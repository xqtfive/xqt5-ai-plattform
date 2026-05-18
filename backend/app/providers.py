import logging
from typing import Any, Dict, List, Optional

import httpx

from .config import AZURE_API_VERSION, AZURE_ENDPOINT, PROVIDER_KEYS
from .database import supabase
from .encryption import decrypt_value, encrypt_value

logger = logging.getLogger(__name__)

# Known providers and their env-var key names
KNOWN_PROVIDERS = ["openai", "anthropic", "google", "mistral", "x-ai", "azure", "cohere", "mammouth"]

PROVIDER_DISPLAY = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "mistral": "Mistral",
    "x-ai": "xAI",
    "azure": "Azure OpenAI",
    "cohere": "Cohere",
    "mammouth": "Mammouth.ai",
}


def get_api_key(provider: str) -> Optional[str]:
    """Get API key for provider. Priority: DB (active) > env var."""
    try:
        result = supabase.table("app_provider_keys").select(
            "api_key_encrypted,is_active"
        ).eq("provider", provider).execute()
        if result.data:
            row = result.data[0]
            if row["is_active"]:
                decrypted = decrypt_value(row["api_key_encrypted"])
                if decrypted:
                    return decrypted
    except Exception as e:
        logger.warning(f"Failed to load provider key from DB for {provider}: {e}")

    # Fallback to env var
    env_key = PROVIDER_KEYS.get(provider, "")
    return env_key if env_key else None


def get_provider_config(provider: str) -> Dict[str, Any]:
    """Get provider-specific config (endpoint_url, api_version) from DB, fallback to env."""
    config: Dict[str, Any] = {
        "endpoint_url": AZURE_ENDPOINT if provider == "azure" else "",
        "api_version": AZURE_API_VERSION if provider == "azure" else "",
    }
    try:
        result = supabase.table("app_provider_keys").select(
            "endpoint_url,api_version"
        ).eq("provider", provider).execute()
        if result.data:
            row = result.data[0]
            if row.get("endpoint_url"):
                config["endpoint_url"] = row["endpoint_url"]
            if row.get("api_version"):
                config["api_version"] = row["api_version"]
    except Exception as e:
        logger.warning(f"Failed to load provider config from DB for {provider}: {e}")
    return config


def list_providers() -> List[Dict[str, Any]]:
    """List all known providers with their key source status."""
    # Load DB keys
    db_keys = {}
    try:
        result = supabase.table("app_provider_keys").select(
            "provider,is_active,updated_at,endpoint_url,api_version"
        ).execute()
        for row in (result.data or []):
            db_keys[row["provider"]] = row
    except Exception as e:
        logger.warning(f"Failed to load provider keys from DB: {e}")

    providers = []
    for provider in KNOWN_PROVIDERS:
        db_row = db_keys.get(provider)
        has_env = bool(PROVIDER_KEYS.get(provider, ""))

        if db_row and db_row["is_active"]:
            source = "db"
        elif has_env:
            source = "env"
        else:
            source = "none"

        entry = {
            "provider": provider,
            "display_name": PROVIDER_DISPLAY.get(provider, provider),
            "source": source,
            "has_env": has_env,
            "has_db": bool(db_row and db_row["is_active"]),
            "updated_at": db_row["updated_at"] if db_row else None,
        }

        # Azure-specific fields
        if provider == "azure":
            entry["endpoint_url"] = (
                (db_row.get("endpoint_url") if db_row else None) or AZURE_ENDPOINT or ""
            )
            entry["api_version"] = (
                (db_row.get("api_version") if db_row else None) or AZURE_API_VERSION or ""
            )

        providers.append(entry)

    return providers


def set_provider_key(
    provider: str,
    api_key: str,
    endpoint_url: Optional[str] = None,
    api_version: Optional[str] = None,
) -> Dict[str, Any]:
    """Encrypt and upsert a provider API key (with optional Azure-specific fields)."""
    encrypted = encrypt_value(api_key)
    row: Dict[str, Any] = {
        "provider": provider,
        "api_key_encrypted": encrypted,
        "is_active": True,
    }
    if endpoint_url is not None:
        # Strip path — only keep scheme + host (user may paste full Azure URL)
        clean = endpoint_url.strip()
        if clean:
            from urllib.parse import urlparse
            parsed = urlparse(clean)
            if parsed.scheme and parsed.netloc:
                clean = f"{parsed.scheme}://{parsed.netloc}"
        row["endpoint_url"] = clean or None
    if api_version is not None:
        row["api_version"] = api_version.strip() or None
    result = supabase.table("app_provider_keys").upsert(
        row, on_conflict="provider"
    ).execute()
    return result.data[0] if result.data else {"provider": provider, "status": "saved"}


def delete_provider_key(provider: str) -> bool:
    """Soft-delete: set is_active=False."""
    result = supabase.table("app_provider_keys").update({
        "is_active": False,
    }).eq("provider", provider).execute()
    return bool(result.data)


async def test_provider(provider: str) -> Dict[str, Any]:
    """Minimal connectivity test for a provider."""
    from .llm import PROVIDER_CONFIG

    key = get_api_key(provider)
    if not key:
        return {"success": False, "error": "Kein API-Key konfiguriert"}

    if provider == "azure":
        return await _test_azure(key)
    if provider == "cohere":
        return await _test_cohere(key)

    config = PROVIDER_CONFIG.get(provider)
    if not config:
        return {"success": False, "error": f"Unbekannter Provider: {provider}"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if provider == "google":
                # Audit #82/#235 sibling site: Google API key in `x-goog-api-key`
                # header rather than `?key=` URL query (prevents leak via access
                # logs / httpx error reprs / echoed-URL error bodies).
                url = f"{config['base_url']}/models"
                resp = await client.get(url, headers={"x-goog-api-key": key})
            else:
                url = f"{config['base_url']}/models"
                headers = {
                    config.get("auth_header", "Authorization"): f"{config.get('auth_prefix', 'Bearer ')}{key}",
                }
                if provider == "anthropic":
                    headers["anthropic-version"] = "2023-06-01"
                resp = await client.get(url, headers=headers)

            if resp.status_code == 200:
                return {"success": True, "message": "Verbindung erfolgreich"}
            else:
                # Audit #57/#255 sibling: don't echo raw provider body to admin UI.
                logger.warning(
                    "Provider connectivity test failed provider=%s status=%s body=%r",
                    provider, resp.status_code, resp.text[:500],
                )
                return {
                    "success": False,
                    "error": f"HTTP {resp.status_code}",
                }
    except httpx.TimeoutException:
        return {"success": False, "error": "Timeout bei der Verbindung"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _test_azure(api_key: str) -> Dict[str, Any]:
    """Test Azure OpenAI connectivity with a minimal chat request."""
    cfg = get_provider_config("azure")
    endpoint_url = cfg.get("endpoint_url", "").rstrip("/")
    api_version = cfg.get("api_version", "2025-04-01-preview")

    if not endpoint_url:
        return {"success": False, "error": "Keine Endpoint-URL konfiguriert"}

    # Find an Azure deployment name from model config to test with
    deployment = None
    try:
        from .database import supabase as _sb
        result = _sb.table("app_model_config").select(
            "deployment_name"
        ).eq("provider", "azure").limit(1).execute()
        if result.data and result.data[0].get("deployment_name"):
            deployment = result.data[0]["deployment_name"]
    except Exception:
        pass

    if not deployment:
        # No deployment configured yet — just verify endpoint is reachable
        url = f"{endpoint_url}/openai/models?api-version={api_version}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers={"api-key": api_key})
                # Any HTTP response from Azure = endpoint reachable
                if resp.status_code == 401:
                    return {"success": False, "error": "Ungültiger API-Key"}
                return {"success": True, "message": "Endpoint erreichbar (kein Deployment zum Testen konfiguriert)"}
        except httpx.TimeoutException:
            return {"success": False, "error": "Timeout bei der Verbindung"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Test with actual deployment
    url = f"{endpoint_url}/openai/deployments/{deployment}/chat/completions?api-version={api_version}"
    headers = {"api-key": api_key, "Content-Type": "application/json"}
    payload = {"messages": [{"role": "user", "content": "Hi"}], "max_completion_tokens": 5}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                return {"success": True, "message": "Verbindung erfolgreich"}
            elif resp.status_code == 401:
                return {"success": False, "error": "Ungültiger API-Key"}
            else:
                return {
                    "success": False,
                    "error": f"HTTP {resp.status_code} für {url[:120]}... — {resp.text[:300]}",
                }
    except httpx.TimeoutException:
        return {"success": False, "error": "Timeout bei der Verbindung"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _test_cohere(api_key: str) -> Dict[str, Any]:
    """Test Cohere connectivity using a minimal rerank request."""
    payload = {
        "model": "rerank-v3.5",
        "query": "test",
        "documents": ["test document"],
        "top_n": 1,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post("https://api.cohere.com/v2/rerank", headers=headers, json=payload)
            if resp.status_code == 200:
                return {"success": True, "message": "Verbindung erfolgreich"}
            if resp.status_code == 401:
                return {"success": False, "error": "Ungültiger API-Key"}
            return {
                "success": False,
                "error": f"HTTP {resp.status_code}: {resp.text[:300]}",
            }
    except httpx.TimeoutException:
        return {"success": False, "error": "Timeout bei der Verbindung"}
    except Exception as e:
        return {"success": False, "error": str(e)}
