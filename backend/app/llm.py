import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple, Union

import httpx

from .providers import get_api_key as _provider_get_api_key
from .providers import get_provider_config as _get_provider_config

logger = logging.getLogger(__name__)


class LLMError(Exception):
    pass


def _safe_provider_error(
    provider: str,
    status: int,
    raw_body: str,
) -> str:
    """Return a user-safe error message from a non-2xx provider response.

    Extracts only the structured `error.message` field (works for OpenAI,
    Anthropic, Google, Mistral, Azure error envelopes); falls back to a
    generic `HTTP {status}` shape if parsing fails. Full raw body is logged
    server-side at WARNING level so ops still has forensic detail. The result
    of this function is what eventually reaches the user via SSE error frame
    or HTTPException detail — it MUST NOT include API keys, URLs, headers,
    or echoed prompts.

    Audit #57/#255 (2026-05-18): the previous direct `resp.text[:500]`
    interpolation could echo Google URLs (with `?key=…`), prompt fragments,
    or internal request IDs to the browser.
    """
    # Server-side log for forensic triage (Coolify stdout only — never audit DB).
    logger.warning(
        "Provider error provider=%s status=%s body=%r",
        provider, status, (raw_body or "")[:2000],
    )
    if raw_body:
        try:
            data = json.loads(raw_body)
        except (json.JSONDecodeError, ValueError):
            data = None
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                msg = err.get("message")
                if isinstance(msg, str) and msg.strip():
                    # Trim, strip newlines (SSE-safety), cap length
                    safe_msg = msg.replace("\n", " ").replace("\r", " ").strip()[:200]
                    return f"{provider} API error ({status}): {safe_msg}"
    return f"{provider} API error ({status})"


# Provider endpoint and header configuration
PROVIDER_CONFIG = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "chat_path": "/chat/completions",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "chat_path": "/messages",
        "auth_header": "x-api-key",
        "auth_prefix": "",
    },
    "google": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "chat_path": "/chat/completions",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "x-ai": {
        "base_url": "https://api.x.ai/v1",
        "chat_path": "/chat/completions",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "azure": {
        # Azure uses dynamic endpoint URLs; base_url is resolved at runtime
        "auth_header": "api-key",
        "auth_prefix": "",
    },
    "mammouth": {
        "base_url": "https://api.mammouth.ai/v1",
        "chat_path": "/chat/completions",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
        "skip_temperature": True,
    },
}

# Available models per provider
AVAILABLE_MODELS = [
    {"id": "openai/gpt-5.1", "provider": "openai", "name": "GPT-5.1"},
    {"id": "openai/gpt-4.1", "provider": "openai", "name": "GPT-4.1"},
    {"id": "openai/gpt-4.1-mini", "provider": "openai", "name": "GPT-4.1 Mini"},
    {"id": "anthropic/claude-sonnet-4-5", "provider": "anthropic", "name": "Claude Sonnet 4.5"},
    {"id": "anthropic/claude-haiku-3-5", "provider": "anthropic", "name": "Claude Haiku 3.5"},
    {"id": "google/gemini-3-pro-preview", "provider": "google", "name": "Gemini 3 Pro"},
    {"id": "google/gemini-2.5-flash", "provider": "google", "name": "Gemini 2.5 Flash"},
    {"id": "mistral/mistral-large-latest", "provider": "mistral", "name": "Mistral Large"},
    {"id": "x-ai/grok-4", "provider": "x-ai", "name": "Grok 4"},
    {"id": "mammouth/gpt-5.2", "provider": "mammouth", "name": "Mammouth GPT-5.2"},
    {"id": "mammouth/gpt-5.2-pro", "provider": "mammouth", "name": "Mammouth GPT-5.2 Pro"},
    {"id": "mammouth/gpt-5.1", "provider": "mammouth", "name": "Mammouth GPT-5.1"},
    {"id": "mammouth/gpt-5", "provider": "mammouth", "name": "Mammouth GPT-5"},
    {"id": "mammouth/gpt-5-mini", "provider": "mammouth", "name": "Mammouth GPT-5 Mini"},
    {"id": "mammouth/gpt-4.1", "provider": "mammouth", "name": "Mammouth GPT-4.1"},
    {"id": "mammouth/gpt-4.1-mini", "provider": "mammouth", "name": "Mammouth GPT-4.1 Mini"},
    {"id": "mammouth/claude-opus-4-6", "provider": "mammouth", "name": "Mammouth Claude Opus 4.6"},
    {"id": "mammouth/claude-sonnet-4-6", "provider": "mammouth", "name": "Mammouth Claude Sonnet 4.6"},
    {"id": "mammouth/claude-sonnet-4-5", "provider": "mammouth", "name": "Mammouth Claude Sonnet 4.5"},
    {"id": "mammouth/claude-haiku-4-5", "provider": "mammouth", "name": "Mammouth Claude Haiku 4.5"},
    {"id": "mammouth/gemini-3-pro-preview", "provider": "mammouth", "name": "Mammouth Gemini 3 Pro"},
    {"id": "mammouth/gemini-2.5-pro", "provider": "mammouth", "name": "Mammouth Gemini 2.5 Pro"},
    {"id": "mammouth/gemini-2.5-flash", "provider": "mammouth", "name": "Mammouth Gemini 2.5 Flash"},
    {"id": "mammouth/mistral-large-3", "provider": "mammouth", "name": "Mammouth Mistral Large 3"},
    {"id": "mammouth/deepseek-v3.2", "provider": "mammouth", "name": "Mammouth DeepSeek V3.2"},
    {"id": "mammouth/deepseek-r1-0528", "provider": "mammouth", "name": "Mammouth DeepSeek R1"},
    {"id": "mammouth/grok-4-0709", "provider": "mammouth", "name": "Mammouth Grok 4"},
]


def parse_model_string(model_string: str) -> Tuple[str, str]:
    if "/" not in model_string:
        raise LLMError(f"Invalid model format: {model_string}. Expected 'provider/model-name'.")
    provider, model_name = model_string.split("/", 1)
    if provider not in PROVIDER_CONFIG:
        raise LLMError(f"Unknown provider: {provider}")
    return provider, model_name


def get_available_models() -> List[Dict[str, Any]]:
    """Return available models from DB (app_model_config), fallback to hardcoded list."""
    try:
        from .database import supabase
        db_result = supabase.table("app_model_config").select("*").eq(
            "is_enabled", True
        ).order("sort_order").execute()
        if db_result.data:
            result = []
            for row in db_result.data:
                available = bool(_provider_get_api_key(row["provider"]))
                entry = {
                    "id": row["model_id"],
                    "provider": row["provider"],
                    "name": row["display_name"],
                    "available": available,
                    "is_default": bool(row.get("is_default")),
                }
                if row.get("deployment_name"):
                    entry["deployment_name"] = row["deployment_name"]
                result.append(entry)
            return result
    except Exception as e:
        logger.warning(f"Failed to load models from DB, using fallback: {e}")

    # Fallback to hardcoded list
    result = []
    for model in AVAILABLE_MODELS:
        available = bool(_provider_get_api_key(model["provider"]))
        result.append({**model, "available": available, "is_default": model["id"] == "google/gemini-3-pro-preview"})
    return result


def _get_deployment_name(model_id: str) -> Optional[str]:
    """Look up the Azure deployment name for a model_id from app_model_config."""
    try:
        from .database import supabase
        result = supabase.table("app_model_config").select(
            "deployment_name"
        ).eq("model_id", model_id).execute()
        if result.data and result.data[0].get("deployment_name"):
            return result.data[0]["deployment_name"]
    except Exception as e:
        logger.warning(f"Failed to load deployment name for {model_id}: {e}")
    return None


def _get_api_key(provider: str) -> str:
    key = _provider_get_api_key(provider)
    if not key:
        raise LLMError(f"No API key configured for provider: {provider}")
    return key


def _build_openai_compatible_request(
    messages: List[Dict[str, str]], model_name: str, temperature: float, stream: bool,
    skip_temperature: bool = False,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "stream": stream,
    }
    if not skip_temperature:
        payload["temperature"] = temperature
    return payload


def _build_anthropic_request(
    messages: List[Dict[str, str]], model_name: str, temperature: float, stream: bool
) -> Dict[str, Any]:
    # Anthropic uses a different format: system message separate, messages array
    system_msg = None
    chat_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_msg = msg["content"]
        else:
            chat_messages.append({"role": msg["role"], "content": msg["content"]})

    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": chat_messages,
        "temperature": temperature,
        "max_tokens": 4096,
        "stream": stream,
    }
    if system_msg:
        payload["system"] = system_msg
    return payload


def _build_google_request(
    messages: List[Dict[str, str]], temperature: float, stream: bool
) -> Dict[str, Any]:
    # Google Gemini uses a different format
    contents = []
    system_instruction = None
    for msg in messages:
        if msg["role"] == "system":
            system_instruction = msg["content"]
        else:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {"temperature": temperature},
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
    return payload


async def call_llm(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> Dict[str, Any]:
    provider, model_name = parse_model_string(model)
    api_key = _get_api_key(provider)

    async with httpx.AsyncClient(timeout=60.0) as client:
        if provider == "azure":
            return await _call_azure(client, messages, model_name, temperature, api_key, model)
        elif provider == "google":
            return await _call_google(client, messages, model_name, temperature, api_key)
        elif provider == "anthropic":
            return await _call_anthropic(client, messages, model_name, temperature, api_key)
        else:
            return await _call_openai_compatible(client, messages, model_name, temperature, api_key, provider)


async def _call_openai_compatible(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
    provider: str,
) -> Dict[str, Any]:
    config = PROVIDER_CONFIG[provider]
    url = f"{config['base_url']}{config['chat_path']}"
    headers = {
        config["auth_header"]: f"{config['auth_prefix']}{api_key}",
        "Content-Type": "application/json",
    }
    payload = _build_openai_compatible_request(messages, model_name, temperature, stream=False,
                                               skip_temperature=config.get("skip_temperature", False))

    resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise LLMError(_safe_provider_error(provider, resp.status_code, resp.text))

    data = resp.json()
    return {
        "content": data["choices"][0]["message"]["content"],
        "usage": data.get("usage", {}),
    }


async def _call_anthropic(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
) -> Dict[str, Any]:
    config = PROVIDER_CONFIG["anthropic"]
    url = f"{config['base_url']}{config['chat_path']}"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = _build_anthropic_request(messages, model_name, temperature, stream=False)

    resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise LLMError(_safe_provider_error("anthropic", resp.status_code, resp.text))

    data = resp.json()
    content_blocks = data.get("content", [])
    text = "".join(block["text"] for block in content_blocks if block.get("type") == "text")
    if not text:
        # Audit #125: non-text blocks (thinking, tool_use, server_tool_use, etc.)
        # would otherwise produce silent-empty responses. Surface the actual
        # block-type vocabulary + stop_reason so callers can diagnose.
        block_types = sorted({b.get("type", "?") for b in content_blocks})
        stop_reason = data.get("stop_reason", "?")
        raise LLMError(
            f"Anthropic returned no text content (stop_reason={stop_reason}, block_types={block_types})"
        )
    return {
        "content": text,
        "usage": data.get("usage", {}),
    }


# Google `finishReason` values that indicate the response was blocked or
# filtered out — must surface as an explicit error, not silent-empty (audit #111).
# STOP / MAX_TOKENS / LANGUAGE / OTHER pass through (partial content is valid).
_GOOGLE_BLOCKED_FINISH_REASONS = frozenset({
    "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII",
})


def _check_google_block(data: Dict[str, Any]) -> None:
    """Raise LLMError if Google response indicates a content/prompt block.

    Audit #111: previously SAFETY/RECITATION/etc. returned empty `parts` and
    the parser silently yielded "" to the user — chat showed a blank reply
    with no diagnostic. Now: prompt-pre-block AND post-generation block both
    raise explicit LLMError.
    """
    prompt_feedback = data.get("promptFeedback") or {}
    block_reason = prompt_feedback.get("blockReason")
    if block_reason:
        raise LLMError(f"Google blocked the prompt (reason: {block_reason})")
    candidates = data.get("candidates") or []
    if candidates:
        finish_reason = candidates[0].get("finishReason")
        if finish_reason in _GOOGLE_BLOCKED_FINISH_REASONS:
            raise LLMError(f"Google blocked the response (finishReason: {finish_reason})")


async def _call_google(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
) -> Dict[str, Any]:
    # Audit #82/#235: API key now passed via `x-goog-api-key` header instead
    # of the `?key=` URL query so it doesn't leak into Coolify access logs,
    # httpx RequestError reprs, or echoed-URL error bodies. Header form is the
    # canonical curl example in current Google AI docs.
    url = f"{PROVIDER_CONFIG['google']['base_url']}/models/{model_name}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    payload = _build_google_request(messages, temperature, stream=False)

    resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise LLMError(_safe_provider_error("google", resp.status_code, resp.text))

    data = resp.json()
    _check_google_block(data)
    candidates = data.get("candidates", [])
    if not candidates:
        raise LLMError("Google API returned no candidates")
    text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    usage = data.get("usageMetadata", {})
    return {
        "content": text,
        "usage": {
            "prompt_tokens": usage.get("promptTokenCount", 0),
            "completion_tokens": usage.get("candidatesTokenCount", 0),
            "total_tokens": usage.get("totalTokenCount", 0),
        },
    }


async def stream_llm(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> AsyncIterator[Union[str, Dict]]:
    """Stream LLM response. Yields text deltas (str), then a final dict with usage info."""
    provider, model_name = parse_model_string(model)
    api_key = _get_api_key(provider)

    async with httpx.AsyncClient(timeout=120.0) as client:
        if provider == "azure":
            async for chunk in _stream_azure(client, messages, model_name, temperature, api_key, model):
                yield chunk
        elif provider == "google":
            async for chunk in _stream_google(client, messages, model_name, temperature, api_key):
                yield chunk
        elif provider == "anthropic":
            async for chunk in _stream_anthropic(client, messages, model_name, temperature, api_key):
                yield chunk
        else:
            async for chunk in _stream_openai_compatible(client, messages, model_name, temperature, api_key, provider):
                yield chunk


def _build_azure_url(model_id: str, model_name: str) -> str:
    """Build Azure OpenAI chat completions URL."""
    cfg = _get_provider_config("azure")
    endpoint_url = cfg.get("endpoint_url", "").rstrip("/")
    api_version = cfg.get("api_version", "2025-04-01-preview")

    if not endpoint_url:
        raise LLMError("Azure endpoint URL is not configured")

    deployment = _get_deployment_name(model_id) or model_name
    return f"{endpoint_url}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"


def _build_azure_request(
    messages: List[Dict[str, str]], model_name: str, stream: bool
) -> Dict[str, Any]:
    """Build Azure request without temperature (unsupported by GPT-5.x)."""
    return {
        "model": model_name,
        "messages": messages,
        "stream": stream,
    }


async def _call_azure(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
    model_id: str,
) -> Dict[str, Any]:
    url = _build_azure_url(model_id, model_name)
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = _build_azure_request(messages, model_name, stream=False)

    resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise LLMError(_safe_provider_error("azure", resp.status_code, resp.text))

    data = resp.json()
    return {
        "content": data["choices"][0]["message"]["content"],
        "usage": data.get("usage", {}),
    }


async def _stream_azure(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
    model_id: str,
) -> AsyncIterator[Union[str, Dict]]:
    url = _build_azure_url(model_id, model_name)
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = _build_azure_request(messages, model_name, stream=True)
    payload["stream_options"] = {"include_usage": True}

    usage = {}
    async with client.stream("POST", url, headers=headers, json=payload) as resp:
        if resp.status_code != 200:
            body = await resp.aread()
            raise LLMError(_safe_provider_error("azure", resp.status_code, body.decode("utf-8", errors="replace")))

        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str.strip() == "[DONE]":
                break
            try:
                data = json.loads(data_str)
                if data.get("usage"):
                    usage = data["usage"]
                delta = data["choices"][0].get("delta", {}).get("content", "")
                if delta:
                    yield delta
            except (json.JSONDecodeError, KeyError, IndexError):
                continue

    if usage:
        yield {"usage": usage}


async def _stream_openai_compatible(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
    provider: str,
) -> AsyncIterator[Union[str, Dict]]:
    config = PROVIDER_CONFIG[provider]
    url = f"{config['base_url']}{config['chat_path']}"
    headers = {
        config["auth_header"]: f"{config['auth_prefix']}{api_key}",
        "Content-Type": "application/json",
    }
    payload = _build_openai_compatible_request(messages, model_name, temperature, stream=True,
                                               skip_temperature=config.get("skip_temperature", False))
    payload["stream_options"] = {"include_usage": True}

    usage = {}
    async with client.stream("POST", url, headers=headers, json=payload) as resp:
        if resp.status_code != 200:
            body = await resp.aread()
            raise LLMError(_safe_provider_error(provider, resp.status_code, body.decode("utf-8", errors="replace")))

        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            data_str = line[6:]
            if data_str.strip() == "[DONE]":
                break
            try:
                data = json.loads(data_str)
                # Capture usage from final chunk
                if data.get("usage"):
                    usage = data["usage"]
                delta = data["choices"][0].get("delta", {}).get("content", "")
                if delta:
                    yield delta
            except (json.JSONDecodeError, KeyError, IndexError):
                continue

    if usage:
        yield {"usage": usage}


async def _stream_anthropic(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
) -> AsyncIterator[Union[str, Dict]]:
    config = PROVIDER_CONFIG["anthropic"]
    url = f"{config['base_url']}{config['chat_path']}"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = _build_anthropic_request(messages, model_name, temperature, stream=True)

    usage = {}
    text_yielded = False
    stop_reason: Optional[str] = None
    seen_block_types: set = set()
    async with client.stream("POST", url, headers=headers, json=payload) as resp:
        if resp.status_code != 200:
            body = await resp.aread()
            raise LLMError(_safe_provider_error("anthropic", resp.status_code, body.decode("utf-8", errors="replace")))

        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            try:
                data = json.loads(line[6:])
                evt_type = data.get("type")
                if evt_type == "content_block_start":
                    block = data.get("content_block", {}) or {}
                    block_type = block.get("type")
                    if block_type:
                        seen_block_types.add(block_type)
                elif evt_type == "content_block_delta":
                    delta = data.get("delta", {}).get("text", "")
                    if delta:
                        yield delta
                        text_yielded = True
                elif evt_type == "message_start":
                    msg_usage = data.get("message", {}).get("usage", {})
                    if msg_usage:
                        usage["prompt_tokens"] = msg_usage.get("input_tokens", 0)
                elif evt_type == "message_delta":
                    delta_usage = data.get("usage", {})
                    if delta_usage:
                        usage["completion_tokens"] = delta_usage.get("output_tokens", 0)
                    # Audit #58/#83: capture stop_reason for end-of-stream diagnostics.
                    new_stop = data.get("delta", {}).get("stop_reason")
                    if new_stop:
                        stop_reason = new_stop
            except (json.JSONDecodeError, KeyError):
                continue

    # Audit #125: if the stream produced no text content (e.g. tool_use-only,
    # thinking-only, or an unexpected refusal), raise explicitly so the user
    # sees a real error rather than an empty bubble.
    if not text_yielded:
        raise LLMError(
            f"Anthropic stream returned no text content (stop_reason={stop_reason or '?'}, block_types={sorted(seen_block_types)})"
        )

    if usage:
        usage["total_tokens"] = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
        yield {"usage": usage}


async def _stream_google(
    client: httpx.AsyncClient,
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float,
    api_key: str,
) -> AsyncIterator[Union[str, Dict]]:
    # Audit #82/#235: API key moved to `x-goog-api-key` header (audit-Zeitstand `?key=` in URL).
    url = f"{PROVIDER_CONFIG['google']['base_url']}/models/{model_name}:streamGenerateContent?alt=sse"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    payload = _build_google_request(messages, temperature, stream=True)

    usage = {}
    text_yielded = False
    final_finish_reason: Optional[str] = None
    final_block_reason: Optional[str] = None
    async with client.stream("POST", url, headers=headers, json=payload) as resp:
        if resp.status_code != 200:
            body = await resp.aread()
            raise LLMError(_safe_provider_error("google", resp.status_code, body.decode("utf-8", errors="replace")))

        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            try:
                data = json.loads(line[6:])
                # Audit #111: capture pre-generation prompt-block signal
                prompt_feedback = data.get("promptFeedback") or {}
                if prompt_feedback.get("blockReason"):
                    final_block_reason = prompt_feedback["blockReason"]
                # Capture usage metadata from chunks
                usage_meta = data.get("usageMetadata")
                if usage_meta:
                    usage = {
                        "prompt_tokens": usage_meta.get("promptTokenCount", 0),
                        "completion_tokens": usage_meta.get("candidatesTokenCount", 0),
                        "total_tokens": usage_meta.get("totalTokenCount", 0),
                    }
                candidates = data.get("candidates", [])
                if candidates:
                    # Audit #58/#83 + #111: track finishReason across chunks; the
                    # final chunk's value tells us if Google blocked the response.
                    fr = candidates[0].get("finishReason")
                    if fr:
                        final_finish_reason = fr
                    parts = candidates[0].get("content", {}).get("parts", [])
                    for part in parts:
                        text = part.get("text", "")
                        if text:
                            yield text
                            text_yielded = True
            except (json.JSONDecodeError, KeyError):
                continue

    # Audit #111: post-stream, if Google blocked the prompt or response and no
    # text was produced, raise explicitly. Don't suppress when partial text was
    # already yielded — that's a MAX_TOKENS-style truncation, valid content.
    if final_block_reason and not text_yielded:
        raise LLMError(f"Google blocked the prompt (reason: {final_block_reason})")
    if not text_yielded and final_finish_reason in _GOOGLE_BLOCKED_FINISH_REASONS:
        raise LLMError(f"Google blocked the response (finishReason: {final_finish_reason})")

    if usage:
        yield {"usage": usage}
