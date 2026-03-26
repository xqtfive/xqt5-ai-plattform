import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

logging.basicConfig(level=logging.INFO)

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .auth import (
    authenticate_user,
    bump_token_version,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_admin,
    get_current_user,
    get_user_by_id,
    register_user,
)
from .config import (
    CORS_ORIGINS_LIST,
    DEFAULT_MODEL,
    DEFAULT_TEMPERATURE,
    MAX_UPLOAD_SIZE_MB,
    RATE_LIMIT_STORAGE_URL,
)
from .llm import call_llm, get_available_models, LLMError, parse_model_string, stream_llm
from .models import (
    AddPoolMemberRequest,
    CreateAssistantRequest,
    CreateConversationRequest,
    CreateInviteLinkRequest,
    CreateModelConfigRequest,
    CreatePoolChatRequest,
    CreatePoolRequest,
    CreateTemplateRequest,
    JoinPoolRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    SendMessageRequest,
    SendPoolMessageRequest,
    UpdateRagSettingsRequest,
    UpdateAssistantRequest,
    UpdateConversationRequest,
    UpdateModelConfigRequest,
    UpdatePoolMemberRequest,
    UpdatePoolRequest,
    UpdateTemplateRequest,
    UploadPoolTextRequest,
    UpdateUserRequest,
)
from . import admin as admin_crud
from . import assistants as assistants_crud
from . import audit
from . import documents as documents_mod
from . import pools as pools_mod
from . import providers as providers_mod
from . import rag as rag_mod
from . import storage
from . import templates as templates_crud
from .token_tracking import record_usage

logger = logging.getLogger(__name__)

app = FastAPI(title="XQT5 AI-Workplace API")
SUPPORTED_UPLOAD_EXTENSIONS = (".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp")
MAX_OCR_ASSET_EMBEDDINGS = 40


def _is_supported_upload_file(filename: str) -> bool:
    lower = (filename or "").lower()
    return any(lower.endswith(ext) for ext in SUPPORTED_UPLOAD_EXTENSIONS)


def _resolve_file_type(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith(".txt"):
        return "txt"
    return "image"


async def _index_ocr_assets_for_document(
    document_id: str,
    user_id: str,
    filename: str,
    ocr_assets: List[Dict[str, Any]],
    pool_id: Optional[str] = None,
) -> int:
    if not ocr_assets:
        return 0

    selected_assets = ocr_assets[:MAX_OCR_ASSET_EMBEDDINGS]
    if len(ocr_assets) > len(selected_assets):
        logger.info(
            "OCR assets capped for document %s: using %d of %d",
            document_id,
            len(selected_assets),
            len(ocr_assets),
        )

    embedding_inputs: List[str] = []
    for asset in selected_assets:
        page = asset.get("page_number")
        fallback = f"{filename} Seite {page}" if page else filename
        text = (
            str(asset.get("caption", "")).strip()
            or str(asset.get("ocr_text", "")).strip()
            or fallback
        )
        embedding_inputs.append(text[:4000])

    embeddings = await rag_mod.generate_embeddings(embedding_inputs) if embedding_inputs else []
    return documents_mod.create_document_assets(
        document_id=document_id,
        user_id=user_id,
        assets=selected_assets,
        embeddings=embeddings,
        pool_id=pool_id,
    )


def _rate_limit_key(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "", 1).strip()
        if token:
            try:
                payload = decode_token(token)
                if payload.get("type") == "access" and payload.get("sub"):
                    return f"user:{payload['sub']}"
            except HTTPException:
                pass
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_rate_limit_key, storage_uri=RATE_LIMIT_STORAGE_URL)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS_LIST,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "Cache-Control", "Connection"],
)


# ── Public Endpoints ──


@app.get("/")
async def root() -> dict:
    return {"status": "ok", "service": "xqt5-ai-workplace-backend"}


@app.get("/api/health")
async def health() -> dict:
    return {"status": "healthy", "env": os.getenv("ENVIRONMENT", "development")}


@app.get("/api/models")
async def list_models() -> list:
    return get_available_models()


# ── Auth Endpoints ──


@app.post("/api/auth/register", response_model=None)
@limiter.limit("5/minute")
async def register(payload: RegisterRequest, request: Request):
    user = register_user(payload.username, payload.email, payload.password)
    access_token = create_access_token(
        user["id"],
        user.get("is_admin", False),
        token_version=user.get("token_version", 0),
    )
    refresh_token = create_refresh_token(user["id"], token_version=user.get("token_version", 0))
    audit.log_event(audit.AUTH_REGISTER, user_id=user["id"], ip_address=request.client.host)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }


@app.post("/api/auth/login", response_model=None)
@limiter.limit("10/minute")
async def login(payload: LoginRequest, request: Request):
    user = authenticate_user(payload.username, payload.password)
    if not user:
        audit.log_event(
            audit.AUTH_LOGIN_FAILED,
            metadata={"username": payload.username},
            ip_address=request.client.host,
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")
    access_token = create_access_token(
        user["id"],
        user.get("is_admin", False),
        token_version=user.get("token_version", 0),
    )
    refresh_token = create_refresh_token(user["id"], token_version=user.get("token_version", 0))
    audit.log_event(audit.AUTH_LOGIN, user_id=user["id"], ip_address=request.client.host)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user,
    }


@app.post("/api/auth/refresh", response_model=None)
@limiter.limit("30/minute")
async def refresh(payload: RefreshRequest, request: Request):
    del request
    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user_id = token_payload.get("sub")
    token_version = token_payload.get("token_version", 0)
    user = get_user_by_id(user_id)
    if not user or not user.get("is_active", False):
        raise HTTPException(status_code=401, detail="User is inactive or not found")
    if token_version != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")
    access_token = create_access_token(
        user["id"],
        user.get("is_admin", False),
        token_version=user.get("token_version", 0),
    )
    return {
        "access_token": access_token,
        "user": user,
    }


@app.get("/api/auth/me", response_model=None)
async def get_me(current_user: Dict = Depends(get_current_user)):
    user = get_user_by_id(current_user["id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ── Protected Endpoints ──


@app.get("/api/conversations")
async def list_conversations(current_user: Dict = Depends(get_current_user)) -> list:
    return storage.list_conversations(user_id=current_user["id"])


@app.post("/api/conversations")
async def create_conversation(
    request: CreateConversationRequest,
    current_user: Dict = Depends(get_current_user),
) -> dict:
    model = request.model
    temperature = request.temperature

    # If assistant_id is provided, use its defaults
    if request.assistant_id:
        assistant = assistants_crud.get_assistant(request.assistant_id, current_user["id"])
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
        if not model and assistant.get("model"):
            model = assistant["model"]
        if temperature is None and assistant.get("temperature") is not None:
            temperature = assistant["temperature"]

    # Ensure new conversations always get a concrete default model.
    # This prevents stale frontend state from selecting an old default.
    if not model:
        model = admin_crud.get_default_model_id() or DEFAULT_MODEL

    result = storage.create_conversation(
        title=request.title or "New Conversation",
        user_id=current_user["id"],
        model=model,
        temperature=temperature,
        assistant_id=request.assistant_id,
    )
    audit.log_event(
        audit.CHAT_CONVERSATION_CREATE,
        user_id=current_user["id"],
        target_type="conversation",
        target_id=result.get("id"),
    )
    return result


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: Dict = Depends(get_current_user),
) -> dict:
    if not storage.verify_conversation_owner(conversation_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")
    conversation = storage.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.patch("/api/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    current_user: Dict = Depends(get_current_user),
) -> dict:
    if not storage.verify_conversation_owner(conversation_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")

    updates = request.model_dump(exclude_none=True)
    if not updates:
        conversation = storage.get_conversation(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation

    result = storage.update_conversation(conversation_id, **updates)
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: Dict = Depends(get_current_user),
) -> dict:
    if not storage.verify_conversation_owner(conversation_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")
    deleted = storage.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    audit.log_event(
        audit.CHAT_CONVERSATION_DELETE,
        user_id=current_user["id"],
        target_type="conversation",
        target_id=conversation_id,
    )
    return {"deleted": True}


def _build_llm_messages(
    conversation_messages: List[Dict],
    system_prompt: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Convert stored messages to LLM-compatible format, optionally prepending a system prompt."""
    llm_messages = []
    if system_prompt:
        llm_messages.append({"role": "system", "content": system_prompt})
    for msg in conversation_messages:
        llm_messages.append({
            "role": msg["role"],
            "content": msg.get("content", ""),
        })
    return llm_messages


def _inject_system_context(llm_messages: List[Dict[str, str]], context: str) -> None:
    """Append context to existing system message or create one."""
    if not context:
        return
    if llm_messages and llm_messages[0]["role"] == "system":
        llm_messages[0]["content"] += "\n\n" + context
    else:
        llm_messages.insert(0, {"role": "system", "content": context})


def _apply_image_source_policy(llm_messages: List[Dict[str, str]], image_mode: str) -> None:
    """Inject automatic image-source grounding rules into the prompt."""
    mode = (image_mode or "auto").lower()
    if mode == "off":
        return

    policy = (
        "IMAGE SOURCE POLICY:\n"
        "- Mention image/chart/diagram references only when semantically relevant to the answer.\n"
        "- If no relevant image evidence exists, do not mention image sources.\n"
        "- Prefer text evidence if image relevance is weak."
    )
    _inject_system_context(llm_messages, policy)


def _build_available_documents_context(docs: List[Dict]) -> str:
    """Build fallback context listing conversation-visible documents by status."""
    ready_names = []
    processing_names = []
    error_names = []
    seen_ready = set()
    seen_processing = set()
    seen_error = set()
    for doc in docs or []:
        name = (doc.get("filename") or "").strip()
        if not name:
            continue
        status = (doc.get("status") or "").strip().lower()
        if status == "ready":
            if name in seen_ready:
                continue
            seen_ready.add(name)
            ready_names.append(name)
            continue
        if status == "processing":
            if name in seen_processing:
                continue
            seen_processing.add(name)
            processing_names.append(name)
            continue
        if status == "error":
            if name in seen_error:
                continue
            seen_error.add(name)
            error_names.append(name)

    if not ready_names and not processing_names and not error_names:
        return ""

    lines = ["[Available documents in this workspace:]"]
    if ready_names:
        lines.append("- Ready:")
        lines.extend(f"  - {name}" for name in ready_names[:50])
    if processing_names:
        lines.append("- Processing:")
        lines.extend(f"  - {name}" for name in processing_names[:20])
    if error_names:
        lines.append("- Error:")
        lines.extend(f"  - {name}" for name in error_names[:20])
    return "\n".join(lines)


def _build_document_text_fallback_context(rows: List[Dict]) -> str:
    """Build fallback context from extracted document text (including OCR output)."""
    parts = ["[Document text fallback context:]"]
    added = 0
    for row in rows or []:
        text = (row.get("extracted_text") or "").strip()
        if not text:
            continue
        filename = row.get("filename", "unknown")
        parts.append(f"\n--- {filename} ---\n{text[:3500]}")
        added += 1
        if added >= 3:
            break
    if added == 0:
        return ""
    return "\n".join(parts)


def _apply_document_access_policy(llm_messages: List[Dict[str, str]]) -> None:
    """Prevent non-grounded 'no access' answers once document context is injected."""
    policy = (
        "DOCUMENT ACCESS POLICY:\n"
        "- You are provided extracted workspace document content in this prompt.\n"
        "- Do NOT claim you cannot access files/documents.\n"
        "- Base your answer strictly on provided context. If context is insufficient, say what is missing."
    )
    _inject_system_context(llm_messages, policy)


_EXCERPT_MAX = 350

def _make_excerpt(content: str) -> str:
    """Return a short readable excerpt from a chunk, stripping breadcrumb prefix."""
    parts = content.split('\n\n', 1)
    text = parts[1].strip() if len(parts) > 1 else content.strip()
    if len(text) > _EXCERPT_MAX:
        text = text[:_EXCERPT_MAX].rsplit(' ', 1)[0] + ' …'
    return text


async def _summarize_document(extracted_text: str, filename: str) -> Optional[str]:
    """Generate a 2-3 sentence summary of a document using the default LLM."""
    try:
        # Strip page markers, truncate to ~6000 chars for the prompt
        clean_text = re.sub(r"<!-- page:\d+ -->\n?", "", extracted_text).strip()[:6000]
        if not clean_text:
            return None
        messages = [
            {
                "role": "user",
                "content": (
                    "Fasse den folgenden Dokumentinhalt in 2-3 prägnanten Sätzen auf Deutsch zusammen. "
                    "Antworte NUR mit der Zusammenfassung, ohne Einleitung oder Kommentar.\n\n"
                    f"Dateiname: {filename}\n\n"
                    f"{clean_text}"
                ),
            }
        ]
        model = admin_crud.get_default_model_id() or DEFAULT_MODEL
        result = await call_llm(messages, model, temperature=0.3)
        summary = result["content"].strip()[:600]
        return summary or None
    except Exception as e:
        logger.warning("Document summary generation failed for %s: %s", filename, e)
        return None


async def _auto_name_conversation(conversation_id: str, user_message: str) -> None:
    """Generate a short title for the conversation using the LLM."""
    try:
        messages = [
            {
                "role": "user",
                "content": (
                    f"Generate a very short title (max 6 words) for a conversation that starts with this message. "
                    f"Reply with ONLY the title, no quotes, no punctuation at the end.\n\n"
                    f"Message: {user_message[:500]}"
                ),
            }
        ]
        result = await call_llm(messages, DEFAULT_MODEL, temperature=0.3)
        title = result["content"].strip().strip('"').strip("'")[:100]
        if title:
            storage.update_conversation(conversation_id, title=title)
    except Exception as e:
        logger.warning(f"Auto-naming failed for {conversation_id}: {e}")


@app.post("/api/conversations/{conversation_id}/message", response_model=None)
@limiter.limit("60/minute")
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    del request
    if not storage.verify_conversation_owner(conversation_id, current_user["id"]):
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation = storage.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Load assistant if linked
    system_prompt = None
    assistant = None
    if conversation.get("assistant_id"):
        assistant = assistants_crud.get_assistant(conversation["assistant_id"], current_user["id"])
        if assistant:
            system_prompt = assistant.get("system_prompt")

    # Determine model and temperature: message-level > conversation-level > assistant > default
    model = payload.model or conversation.get("model") or (assistant.get("model") if assistant else None) or admin_crud.get_default_model_id() or DEFAULT_MODEL
    temperature = payload.temperature if payload.temperature is not None else (
        conversation.get("temperature") if conversation.get("temperature") is not None else (
            assistant.get("temperature") if assistant and assistant.get("temperature") is not None else DEFAULT_TEMPERATURE
        )
    )

    # Store user message
    storage.add_user_message(conversation_id, payload.content)

    # Check if this is the first user message (for auto-naming)
    is_first_message = all(m["role"] != "user" for m in conversation.get("messages", []))

    # Build LLM message history (with system prompt if assistant)
    llm_messages = _build_llm_messages(conversation.get("messages", []), system_prompt=system_prompt)
    llm_messages.append({"role": "user", "content": payload.content})

    image_mode = (payload.image_mode or "auto").lower()
    rag_image_sources = []
    _apply_image_source_policy(llm_messages, image_mode)

    # RAG: inject relevant document context
    rag_sources = []
    has_doc_context = False

    # Detect intent first (never fails); initialize chunks before vector search
    query_intent = rag_mod.detect_query_intent(payload.content)
    doc_filters = rag_mod.parse_document_filters(payload.content)
    chunks = []

    # Step 1: Vector/targeted search — best-effort, failures must not block text fallback
    try:
        rag_settings = admin_crud.get_rag_settings()
        chunks = await rag_mod.retrieve_chunks_with_strategy(
            query=payload.content,
            user_id=current_user["id"],
            chat_id=conversation_id,
            intent=query_intent,
            rerank_settings=rag_settings,
            document_filters=doc_filters,
        )
    except Exception as e:
        logger.warning("RAG vector search failed: %s", e, exc_info=True)

    # Step 2: Inject context — always runs regardless of vector search outcome
    try:
        if chunks:
            rag_context = rag_mod.build_rag_context(chunks)
            rag_sources = [
                {
                    "filename": c["filename"],
                    "similarity": round(c["similarity"], 3),
                    "excerpt": _make_excerpt(c.get("content", "")),
                    "chunk_index": c.get("chunk_index", 0),
                    "page_number": c.get("page_number"),
                }
                for c in chunks
            ]
            _inject_system_context(llm_messages, rag_context)
            has_doc_context = True
        else:
            docs = documents_mod.list_documents(
                user_id=current_user["id"],
                chat_id=conversation_id,
                scope="chat",
            )
            docs_context = _build_available_documents_context(docs)
            _inject_system_context(llm_messages, docs_context)

        # For listing intents, always inject the full document list (even when chunks found)
        if query_intent == "listing":
            docs = documents_mod.list_documents(
                user_id=current_user["id"],
                chat_id=conversation_id,
                scope="chat",
            )
            docs_context = _build_available_documents_context(docs)
            _inject_system_context(llm_messages, docs_context)

        should_try_images = rag_mod.should_use_image_retrieval(payload.content, image_mode)
        if not should_try_images and image_mode == "auto" and query_intent == "summary":
            # Summary prompts should still try visual retrieval.
            should_try_images = True
        if not should_try_images and image_mode == "auto" and not chunks:
            should_try_images = True

        if should_try_images:
            try:
                assets = await rag_mod.search_similar_assets(
                    query=payload.content,
                    user_id=current_user["id"],
                    chat_id=conversation_id,
                    top_k=8 if query_intent == "summary" else 5,
                    threshold=0.0 if query_intent == "summary" else rag_mod.RAG_SIMILARITY_THRESHOLD,
                )
            except Exception as e:
                logger.warning("Image asset search failed: %s", e, exc_info=True)
                assets = []
            image_context = rag_mod.build_image_rag_context(assets)
            _inject_system_context(llm_messages, image_context)
            if image_context:
                has_doc_context = True
            rag_image_sources = [
                {
                    "asset_id": a.get("asset_id"),
                    "document_id": a.get("document_id"),
                    "filename": a.get("filename"),
                    "page_number": a.get("page_number"),
                    "caption": a.get("caption"),
                    "url": a.get("storage_path"),
                    "similarity": round(a.get("similarity", 0), 3),
                }
                for a in assets
            ]

        if not has_doc_context:
            chat_rows = documents_mod.list_chat_document_texts(
                user_id=current_user["id"],
                chat_id=conversation_id,
                limit=3,
            )
            global_rows = documents_mod.list_global_document_texts(
                user_id=current_user["id"],
                limit=2,
            )
            combined_rows = chat_rows + [
                r for r in global_rows
                if r.get("id") not in {c.get("id") for c in chat_rows}
            ]
            text_context = _build_document_text_fallback_context(combined_rows)
            _inject_system_context(llm_messages, text_context)
            if text_context:
                has_doc_context = True
    except Exception as e:
        logger.warning("RAG injection failed: %s", e, exc_info=True)

    # Hard fallback: even if retrieval failed, keep conversation document visibility in context.
    if not has_doc_context:
        try:
            docs = documents_mod.list_documents(
                user_id=current_user["id"],
                chat_id=conversation_id,
                scope="chat",
            )
            docs_context = _build_available_documents_context(docs)
            _inject_system_context(llm_messages, docs_context)
            if docs_context:
                has_doc_context = True
        except Exception as e:
            logger.warning(f"Conversation docs fallback failed: {e}")

    if has_doc_context:
        _apply_document_access_policy(llm_messages)

    if payload.stream:
        return StreamingResponse(
            _stream_response(
                conversation_id, llm_messages, model, temperature,
                is_first_message, payload.content, current_user["id"],
                rag_sources=rag_sources,
                rag_image_sources=rag_image_sources,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming response
    try:
        result = await call_llm(llm_messages, model, temperature)
        assistant_content = result["content"]
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    storage.add_assistant_message(conversation_id, assistant_content, model=model)

    # Record token usage
    usage = result.get("usage", {})
    if usage:
        provider, _ = parse_model_string(model)
        record_usage(
            user_id=current_user["id"],
            chat_id=conversation_id,
            model=model,
            provider=provider,
            prompt_tokens=usage.get("prompt_tokens", usage.get("input_tokens", 0)),
            completion_tokens=usage.get("completion_tokens", usage.get("output_tokens", 0)),
        )

    # Audit log (metadata only, no content)
    audit.log_event(
        audit.CHAT_MESSAGE_SEND,
        user_id=current_user["id"],
        target_type="conversation",
        target_id=conversation_id,
        metadata={"model": model},
    )

    # Auto-name in background
    if is_first_message:
        asyncio.create_task(_auto_name_conversation(conversation_id, payload.content))

    updated = storage.get_conversation(conversation_id)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to load updated conversation")
    if rag_sources:
        updated["rag_sources"] = rag_sources
    if rag_image_sources:
        updated["rag_image_sources"] = rag_image_sources
    return updated


async def _stream_response(
    conversation_id: str,
    llm_messages: List[Dict[str, str]],
    model: str,
    temperature: float,
    is_first_message: bool,
    user_content: str,
    user_id: str,
    rag_sources: Optional[List[Dict]] = None,
    rag_image_sources: Optional[List[Dict]] = None,
):
    full_content = ""
    usage = {}
    try:
        async for chunk in stream_llm(llm_messages, model, temperature):
            if isinstance(chunk, dict):
                # Usage data from final chunk
                usage = chunk.get("usage", {})
            else:
                full_content += chunk
                yield f"data: {json.dumps({'delta': chunk})}\n\n"

        # Store the complete assistant message (with RAG sources for persistence)
        storage.add_assistant_message(conversation_id, full_content, model=model, rag_sources=rag_sources or None)

        # Record token usage
        if usage:
            provider, _ = parse_model_string(model)
            record_usage(
                user_id=user_id,
                chat_id=conversation_id,
                model=model,
                provider=provider,
                prompt_tokens=usage.get("prompt_tokens", usage.get("input_tokens", 0)),
                completion_tokens=usage.get("completion_tokens", usage.get("output_tokens", 0)),
            )

        # Audit log (metadata only, no content)
        audit.log_event(
            audit.CHAT_MESSAGE_SEND,
            user_id=user_id,
            target_type="conversation",
            target_id=conversation_id,
            metadata={"model": model},
        )

        done_data = {'done': True, 'content': full_content}
        if rag_sources:
            done_data['sources'] = rag_sources
        if rag_image_sources:
            done_data['image_sources'] = rag_image_sources
        yield f"data: {json.dumps(done_data)}\n\n"

        # Auto-name in background after stream completes
        if is_first_message:
            asyncio.create_task(_auto_name_conversation(conversation_id, user_content))

    except LLMError as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    except Exception as e:
        logger.error(f"Stream error: {e}")
        yield f"data: {json.dumps({'error': 'An unexpected error occurred'})}\n\n"


# ── Assistants Endpoints ──


@app.get("/api/assistants", response_model=None)
async def list_assistants(current_user: Dict = Depends(get_current_user)):
    return assistants_crud.list_assistants(current_user["id"])


@app.post("/api/assistants", response_model=None)
async def create_assistant(
    request: CreateAssistantRequest,
    current_user: Dict = Depends(get_current_user),
):
    if request.is_global and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can create global assistants")
    return assistants_crud.create_assistant(
        user_id=current_user["id"],
        name=request.name,
        description=request.description,
        system_prompt=request.system_prompt,
        model=request.model,
        temperature=request.temperature,
        is_global=request.is_global,
        icon=request.icon,
    )


@app.get("/api/assistants/{assistant_id}", response_model=None)
async def get_assistant(
    assistant_id: str,
    current_user: Dict = Depends(get_current_user),
):
    assistant = assistants_crud.get_assistant(assistant_id, current_user["id"])
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return assistant


@app.patch("/api/assistants/{assistant_id}", response_model=None)
async def update_assistant(
    assistant_id: str,
    request: UpdateAssistantRequest,
    current_user: Dict = Depends(get_current_user),
):
    updates = request.model_dump(exclude_none=True)
    result = assistants_crud.update_assistant(
        assistant_id, current_user["id"],
        is_admin=current_user.get("is_admin", False),
        **updates,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assistant not found or no permission")
    return result


@app.delete("/api/assistants/{assistant_id}", response_model=None)
async def delete_assistant(
    assistant_id: str,
    current_user: Dict = Depends(get_current_user),
):
    deleted = assistants_crud.delete_assistant(
        assistant_id, current_user["id"],
        is_admin=current_user.get("is_admin", False),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Assistant not found or no permission")
    return {"deleted": True}


# ── Templates Endpoints ──


@app.get("/api/templates", response_model=None)
async def list_templates(current_user: Dict = Depends(get_current_user)):
    return templates_crud.list_templates(current_user["id"])


@app.post("/api/templates", response_model=None)
async def create_template(
    request: CreateTemplateRequest,
    current_user: Dict = Depends(get_current_user),
):
    if request.is_global and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can create global templates")
    return templates_crud.create_template(
        user_id=current_user["id"],
        name=request.name,
        description=request.description,
        content=request.content,
        category=request.category,
        is_global=request.is_global,
    )


@app.get("/api/templates/{template_id}", response_model=None)
async def get_template(
    template_id: str,
    current_user: Dict = Depends(get_current_user),
):
    template = templates_crud.get_template(template_id, current_user["id"])
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@app.patch("/api/templates/{template_id}", response_model=None)
async def update_template(
    template_id: str,
    request: UpdateTemplateRequest,
    current_user: Dict = Depends(get_current_user),
):
    updates = request.model_dump(exclude_none=True)
    result = templates_crud.update_template(
        template_id, current_user["id"],
        is_admin=current_user.get("is_admin", False),
        **updates,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Template not found or no permission")
    return result


@app.delete("/api/templates/{template_id}", response_model=None)
async def delete_template(
    template_id: str,
    current_user: Dict = Depends(get_current_user),
):
    deleted = templates_crud.delete_template(
        template_id, current_user["id"],
        is_admin=current_user.get("is_admin", False),
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found or no permission")
    return {"deleted": True}


# ── Document / RAG Endpoints ──


@app.post("/api/documents/upload", response_model=None)
@limiter.limit("20/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    chat_id: Optional[str] = Form(None),
    current_user: Dict = Depends(get_current_user),
):
    del request
    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    lower = file.filename.lower()
    if not _is_supported_upload_file(lower):
        raise HTTPException(status_code=400, detail="Only PDF, TXT, PNG, JPG, JPEG and WEBP files are supported")

    # Read and validate size
    file_bytes = await file.read()
    max_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_UPLOAD_SIZE_MB}MB limit")

    # Verify chat ownership if chat_id provided
    if chat_id:
        if not storage.verify_conversation_owner(chat_id, current_user["id"]):
            raise HTTPException(status_code=404, detail="Conversation not found")

    # Extract text
    try:
        extracted_text, ocr_assets = await documents_mod.extract_text_and_assets(
            file.filename, file_bytes, user_id=current_user["id"]
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not extract text: {e}")

    if not extracted_text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from file")

    file_type = _resolve_file_type(file.filename)

    # Create document record
    doc = documents_mod.create_document(
        user_id=current_user["id"],
        chat_id=chat_id,
        filename=file.filename,
        file_type=file_type,
        file_size_bytes=len(file_bytes),
        extracted_text=extracted_text,
    )

    # Process: chunk + embed (async but awaited)
    try:
        chunk_count, tokens_used = await rag_mod.process_document(
            doc["id"], extracted_text, current_user["id"],
        )
        doc["chunk_count"] = chunk_count
        doc["status"] = "ready"

        if file_type == "image":
            try:
                embedding_input = (extracted_text or "").strip()[:4000] or file.filename
                embeddings = await rag_mod.generate_embeddings([embedding_input])
                documents_mod.create_document_asset(
                    document_id=doc["id"],
                    user_id=current_user["id"],
                    file_bytes=file_bytes,
                    mime_type=documents_mod.guess_image_mime(file.filename),
                    filename=file.filename,
                    caption=embedding_input[:1000],
                    ocr_text=extracted_text,
                    embedding=embeddings[0] if embeddings else None,
                )
            except Exception as e:
                logger.warning("Image asset indexing failed for %s: %s", doc["id"], e)

        if ocr_assets:
            try:
                asset_count = await _index_ocr_assets_for_document(
                    document_id=doc["id"],
                    user_id=current_user["id"],
                    filename=file.filename,
                    ocr_assets=ocr_assets,
                )
                if asset_count:
                    doc["asset_count"] = asset_count
            except Exception as e:
                logger.warning("OCR asset indexing failed for %s: %s", doc["id"], e)

        summary = await _summarize_document(extracted_text, file.filename)
        if summary:
            documents_mod.update_document_summary(doc["id"], summary)
            doc["summary"] = summary
    except Exception as e:
        logger.error(f"RAG processing failed for {doc['id']}: {e}")
        doc["status"] = "error"
        doc["error_message"] = str(e)

    return doc


@app.get("/api/documents", response_model=None)
async def list_documents(
    chat_id: Optional[str] = None,
    scope: str = "all",
    current_user: Dict = Depends(get_current_user),
):
    return documents_mod.list_documents(
        user_id=current_user["id"],
        chat_id=chat_id,
        scope=scope,
    )


@app.delete("/api/documents/{document_id}", response_model=None)
async def delete_document(
    document_id: str,
    current_user: Dict = Depends(get_current_user),
):
    deleted = documents_mod.delete_document(document_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"deleted": True}


@app.post("/api/rag/search", response_model=None)
@limiter.limit("60/minute")
async def rag_search(
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    body = await request.json()
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    chat_id = body.get("chat_id")
    chunks = await rag_mod.search_similar_chunks(
        query=query,
        user_id=current_user["id"],
        chat_id=chat_id,
    )
    return {"chunks": chunks}


# ── Usage Endpoint ──


@app.get("/api/usage", response_model=None)
async def get_usage(current_user: Dict = Depends(get_current_user)):
    from .token_tracking import get_user_usage_summary
    return get_user_usage_summary(current_user["id"])


# ── Admin Endpoints ──


@app.get("/api/admin/users", response_model=None)
async def admin_list_users(admin: Dict = Depends(get_current_admin)):
    return admin_crud.list_users()


@app.patch("/api/admin/users/{user_id}", response_model=None)
async def admin_update_user(
    user_id: str,
    request: UpdateUserRequest,
    admin: Dict = Depends(get_current_admin),
):
    # Self-protection: admin cannot deactivate or de-admin themselves
    if user_id == admin["id"]:
        if request.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        if request.is_admin is False:
            raise HTTPException(status_code=400, detail="Cannot remove your own admin status")

    result = admin_crud.update_user(user_id, is_active=request.is_active, is_admin=request.is_admin)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")

    # Invalidate all existing user sessions on deactivation.
    if request.is_active is False:
        bump_token_version(user_id)

    # Audit log for user toggles
    if request.is_active is not None:
        action = audit.ADMIN_USER_ACTIVATE if request.is_active else audit.ADMIN_USER_DEACTIVATE
        audit.log_event(action, user_id=admin["id"], target_type="user", target_id=user_id)
    if request.is_admin is not None:
        action = audit.ADMIN_USER_GRANT_ADMIN if request.is_admin else audit.ADMIN_USER_REVOKE_ADMIN
        audit.log_event(action, user_id=admin["id"], target_type="user", target_id=user_id)

    return result


@app.delete("/api/admin/users/{user_id}", response_model=None)
async def admin_delete_user(
    user_id: str,
    admin: Dict = Depends(get_current_admin),
):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = admin_crud.update_user(user_id, is_active=False)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    bump_token_version(user_id)
    audit.log_event(
        audit.ADMIN_USER_DEACTIVATE,
        user_id=admin["id"],
        target_type="user",
        target_id=user_id,
    )
    return {"deleted": True}


@app.get("/api/admin/usage", response_model=None)
async def admin_get_usage(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: Dict = Depends(get_current_admin),
):
    return admin_crud.get_detailed_usage(start_date, end_date)


@app.get("/api/admin/stats", response_model=None)
async def admin_get_stats(admin: Dict = Depends(get_current_admin)):
    return admin_crud.get_system_stats()


@app.get("/api/admin/rag-settings", response_model=None)
async def admin_get_rag_settings(admin: Dict = Depends(get_current_admin)):
    del admin
    return admin_crud.get_rag_settings()


@app.patch("/api/admin/rag-settings", response_model=None)
async def admin_update_rag_settings(
    request: UpdateRagSettingsRequest,
    admin: Dict = Depends(get_current_admin),
):
    updates = request.model_dump(exclude_none=True)
    settings = admin_crud.update_rag_settings(**updates)
    audit.log_event(
        "admin.rag_settings.update",
        user_id=admin["id"],
        target_type="rag_settings",
        target_id=None,
        metadata=updates,
    )
    return settings


# Module-level state for the re-chunk background task (single-process deployment)
_rechunk_status: Dict[str, Any] = {"state": "idle"}


async def _run_rechunk_task(admin_user_id: str) -> None:
    global _rechunk_status
    _rechunk_status = {
        "state": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "progress": {"done": 0, "total": 0},
    }

    def on_progress(done: int, total: int) -> None:
        _rechunk_status["progress"] = {"done": done, "total": total}

    try:
        result = await rag_mod.rechunk_all_documents(progress_callback=on_progress)
        _rechunk_status = {
            "state": "done",
            "result": result,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("Re-chunk complete: %s", result)
    except Exception as e:
        _rechunk_status = {"state": "error", "error": str(e)}
        logger.error("Re-chunk background task failed: %s", e, exc_info=True)


@app.post("/api/admin/rechunk-documents", response_model=None)
async def admin_rechunk_documents(
    background_tasks: BackgroundTasks,
    admin: Dict = Depends(get_current_admin),
):
    if _rechunk_status.get("state") == "running":
        raise HTTPException(status_code=409, detail="Re-chunking is already in progress")
    background_tasks.add_task(_run_rechunk_task, admin["id"])
    audit.log_event(
        "admin.rechunk.start",
        user_id=admin["id"],
        target_type="documents",
        target_id="all",
    )
    return {"status": "started"}


@app.get("/api/admin/rechunk-status", response_model=None)
async def admin_rechunk_status(admin: Dict = Depends(get_current_admin)):
    del admin
    return _rechunk_status


@app.get("/api/admin/models", response_model=None)
async def admin_list_models(admin: Dict = Depends(get_current_admin)):
    return admin_crud.list_model_configs()


@app.post("/api/admin/models", response_model=None)
async def admin_create_model(
    request: CreateModelConfigRequest,
    admin: Dict = Depends(get_current_admin),
):
    result = admin_crud.create_model_config(
        model_id=request.model_id,
        provider=request.provider,
        display_name=request.display_name,
        sort_order=request.sort_order,
        deployment_name=request.deployment_name,
    )
    audit.log_event(
        audit.ADMIN_MODEL_CREATE,
        user_id=admin["id"],
        target_type="model_config",
        target_id=result.get("id"),
        metadata={"model_id": request.model_id},
    )
    return result


@app.patch("/api/admin/models/{model_config_id}", response_model=None)
async def admin_update_model(
    model_config_id: str,
    request: UpdateModelConfigRequest,
    admin: Dict = Depends(get_current_admin),
):
    updates = request.model_dump(exclude_none=True)
    result = admin_crud.update_model_config(model_config_id, **updates)
    if not result:
        raise HTTPException(status_code=404, detail="Model config not found")
    audit.log_event(
        audit.ADMIN_MODEL_UPDATE,
        user_id=admin["id"],
        target_type="model_config",
        target_id=model_config_id,
        metadata=updates,
    )
    return result


@app.delete("/api/admin/models/{model_config_id}", response_model=None)
async def admin_delete_model(
    model_config_id: str,
    admin: Dict = Depends(get_current_admin),
):
    deleted = admin_crud.delete_model_config(model_config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model config not found")
    audit.log_event(
        audit.ADMIN_MODEL_DELETE,
        user_id=admin["id"],
        target_type="model_config",
        target_id=model_config_id,
    )
    return {"deleted": True}


# ── Provider Key Management ──


@app.get("/api/admin/providers", response_model=None)
async def admin_list_providers(admin: Dict = Depends(get_current_admin)):
    return providers_mod.list_providers()


@app.put("/api/admin/providers/{provider}/key", response_model=None)
async def admin_set_provider_key(
    provider: str,
    request: Request,
    admin: Dict = Depends(get_current_admin),
):
    body = await request.json()
    api_key = body.get("api_key", "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="api_key is required")
    endpoint_url = body.get("endpoint_url")
    api_version = body.get("api_version")
    providers_mod.set_provider_key(
        provider, api_key,
        endpoint_url=endpoint_url,
        api_version=api_version,
    )
    audit.log_event(
        "admin.provider.set_key",
        user_id=admin["id"],
        target_type="provider",
        target_id=provider,
    )
    return {"status": "saved", "provider": provider}


@app.delete("/api/admin/providers/{provider}/key", response_model=None)
async def admin_delete_provider_key(
    provider: str,
    admin: Dict = Depends(get_current_admin),
):
    deleted = providers_mod.delete_provider_key(provider)
    if not deleted:
        raise HTTPException(status_code=404, detail="Provider key not found")
    audit.log_event(
        "admin.provider.delete_key",
        user_id=admin["id"],
        target_type="provider",
        target_id=provider,
    )
    return {"status": "deleted", "provider": provider}


@app.post("/api/admin/providers/{provider}/test", response_model=None)
@limiter.limit("20/minute")
async def admin_test_provider(
    provider: str,
    request: Request,
    admin: Dict = Depends(get_current_admin),
):
    del request
    return await providers_mod.test_provider(provider)


@app.get("/api/admin/providers/{provider}/models", response_model=None)
async def admin_list_provider_models(
    provider: str,
    admin: Dict = Depends(get_current_admin),
):
    """Fetch available models for a given provider from their API."""
    from .llm import PROVIDER_CONFIG
    import httpx

    # Mammouth public endpoint — no auth required
    if provider == "mammouth":
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.mammouth.ai/public/models")
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Mammouth API error: {resp.status_code}")
                data = resp.json()
                models = [
                    {"id": m["id"], "name": m["id"]}
                    for m in (data.get("data") or [])
                    if m.get("object") == "model" and "embedding" not in m["id"]
                ]
                return models
        except httpx.TimeoutException:
            raise HTTPException(status_code=502, detail="Timeout beim Abrufen der Mammouth-Modelle")

    # OpenAI-compatible providers: fetch from /models
    config = PROVIDER_CONFIG.get(provider)
    if not config or "base_url" not in config:
        raise HTTPException(status_code=400, detail=f"Modell-Liste für Provider '{provider}' nicht unterstützt")

    api_key = providers_mod.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail="Kein API-Key für diesen Provider konfiguriert")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                config.get("auth_header", "Authorization"): f"{config.get('auth_prefix', 'Bearer ')}{api_key}"
            }
            if provider == "anthropic":
                headers["anthropic-version"] = "2023-06-01"
            if provider == "google":
                url = f"{config['base_url']}/models?key={api_key}"
                resp = await client.get(url)
            else:
                url = f"{config['base_url']}/models"
                resp = await client.get(url, headers=headers)

            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Provider API error: {resp.status_code}")

            data = resp.json()
            # OpenAI-style response
            if "data" in data:
                models = [{"id": m["id"], "name": m.get("id", m["id"])} for m in data["data"]]
            elif "models" in data:
                models = [{"id": m.get("name", m.get("id", "")), "name": m.get("displayName", m.get("name", ""))} for m in data["models"]]
            else:
                models = []
            return models
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="Timeout beim Abrufen der Modelle")


@app.get("/api/admin/audit-logs", response_model=None)
async def admin_get_audit_logs(
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    admin: Dict = Depends(get_current_admin),
):
    return audit.list_audit_logs(
        limit=min(limit, 500),
        offset=offset,
        action_filter=action,
        user_id_filter=user_id,
    )


# ── Pool Endpoints ──


@app.post("/api/pools", response_model=None)
async def create_pool(
    payload: CreatePoolRequest,
    current_user: Dict = Depends(get_current_user),
):
    pool = pools_mod.create_pool(
        owner_id=current_user["id"],
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
        color=payload.color,
    )
    pool["role"] = "owner"
    return pool


@app.get("/api/pools", response_model=None)
async def list_pools(current_user: Dict = Depends(get_current_user)):
    return pools_mod.list_pools_for_user(current_user["id"])


@app.get("/api/pools/{pool_id}", response_model=None)
async def get_pool(
    pool_id: str,
    current_user: Dict = Depends(get_current_user),
):
    role = pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    pool = pools_mod.get_pool(pool_id)
    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")
    pool["role"] = role
    return pool


@app.patch("/api/pools/{pool_id}", response_model=None)
async def update_pool(
    pool_id: str,
    payload: UpdatePoolRequest,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    updates = payload.model_dump(exclude_none=True)
    result = pools_mod.update_pool(pool_id, **updates)
    if not result:
        raise HTTPException(status_code=404, detail="Pool not found")
    return result


@app.delete("/api/pools/{pool_id}", response_model=None)
async def delete_pool(
    pool_id: str,
    current_user: Dict = Depends(get_current_user),
):
    role = pools_mod.get_user_pool_role(pool_id, current_user["id"])
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can delete a pool")
    pools_mod.delete_pool(pool_id)
    return {"deleted": True}


# ── Pool Members ──


@app.get("/api/pools/{pool_id}/members", response_model=None)
async def list_pool_members(
    pool_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    return pools_mod.list_members(pool_id)


@app.post("/api/pools/{pool_id}/members", response_model=None)
async def add_pool_member(
    pool_id: str,
    payload: AddPoolMemberRequest,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    target_user = pools_mod.find_user_by_username(payload.username)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    # Check if already member or owner
    existing_role = pools_mod.get_user_pool_role(pool_id, target_user["id"])
    if existing_role:
        raise HTTPException(status_code=409, detail="User is already a member")
    pools_mod.add_member(pool_id, target_user["id"], payload.role)
    return pools_mod.list_members(pool_id)


@app.patch("/api/pools/{pool_id}/members/{user_id}", response_model=None)
async def update_pool_member(
    pool_id: str,
    user_id: str,
    payload: UpdatePoolMemberRequest,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    # Cannot change owner role
    pool = pools_mod.get_pool(pool_id)
    if pool and pool["owner_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot change owner role")
    result = pools_mod.update_member_role(pool_id, user_id, payload.role)
    if not result:
        raise HTTPException(status_code=404, detail="Member not found")
    return pools_mod.list_members(pool_id)


@app.delete("/api/pools/{pool_id}/members/{user_id}", response_model=None)
async def remove_pool_member(
    pool_id: str,
    user_id: str,
    current_user: Dict = Depends(get_current_user),
):
    # Self-leave is allowed for any member
    if user_id == current_user["id"]:
        role = pools_mod.get_user_pool_role(pool_id, current_user["id"])
        if role == "owner":
            raise HTTPException(status_code=400, detail="Owner cannot leave the pool")
        pools_mod.remove_member(pool_id, user_id)
        return {"removed": True}
    # Otherwise need admin+
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    pool = pools_mod.get_pool(pool_id)
    if pool and pool["owner_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the owner")
    removed = pools_mod.remove_member(pool_id, user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"removed": True}


# ── Pool Invite Links ──


@app.get("/api/pools/{pool_id}/invites", response_model=None)
async def list_pool_invites(
    pool_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    return pools_mod.list_invite_links(pool_id)


@app.post("/api/pools/{pool_id}/invites", response_model=None)
async def create_pool_invite(
    pool_id: str,
    payload: CreateInviteLinkRequest,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    return pools_mod.create_invite_link(
        pool_id=pool_id,
        created_by=current_user["id"],
        role=payload.role,
        max_uses=payload.max_uses,
        expires_at=payload.expires_at,
    )


@app.delete("/api/pools/{pool_id}/invites/{invite_id}", response_model=None)
async def revoke_pool_invite(
    pool_id: str,
    invite_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    revoked = pools_mod.revoke_invite_link(invite_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"revoked": True}


@app.post("/api/pools/join", response_model=None)
async def join_pool(
    payload: JoinPoolRequest,
    current_user: Dict = Depends(get_current_user),
):
    invite = pools_mod.get_invite_by_token(payload.token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
    pool = pools_mod.use_invite_link(invite["id"], current_user["id"])
    return pool


# ── Pool Documents ──


@app.get("/api/pools/{pool_id}/documents", response_model=None)
async def list_pool_documents(
    pool_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    return pools_mod.list_pool_documents(pool_id)


@app.get("/api/pools/{pool_id}/documents/{document_id}/preview", response_model=None)
async def get_pool_document_preview(
    pool_id: str,
    document_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    preview = pools_mod.get_pool_document_preview(pool_id, document_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Document not found")
    return preview


@app.post("/api/pools/{pool_id}/documents/upload", response_model=None)
@limiter.limit("20/minute")
async def upload_pool_document(
    pool_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: Dict = Depends(get_current_user),
):
    del request
    pools_mod.require_pool_role(pool_id, current_user["id"], "editor")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    lower = file.filename.lower()
    if not _is_supported_upload_file(lower):
        raise HTTPException(status_code=400, detail="Only PDF, TXT, PNG, JPG, JPEG and WEBP files are supported")

    file_bytes = await file.read()
    max_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {MAX_UPLOAD_SIZE_MB}MB limit")

    try:
        extracted_text, ocr_assets = await documents_mod.extract_text_and_assets(
            file.filename, file_bytes, user_id=current_user["id"]
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not extract text: {e}")

    if not extracted_text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from file")

    file_type = _resolve_file_type(file.filename)

    doc = documents_mod.create_document(
        user_id=current_user["id"],
        chat_id=None,
        filename=file.filename,
        file_type=file_type,
        file_size_bytes=len(file_bytes),
        extracted_text=extracted_text,
        pool_id=pool_id,
    )

    try:
        chunk_count, tokens_used = await rag_mod.process_document(
            doc["id"], extracted_text, current_user["id"],
        )
        doc["chunk_count"] = chunk_count
        doc["status"] = "ready"

        if file_type == "image":
            try:
                embedding_input = (extracted_text or "").strip()[:4000] or file.filename
                embeddings = await rag_mod.generate_embeddings([embedding_input])
                documents_mod.create_document_asset(
                    document_id=doc["id"],
                    user_id=current_user["id"],
                    file_bytes=file_bytes,
                    mime_type=documents_mod.guess_image_mime(file.filename),
                    filename=file.filename,
                    caption=embedding_input[:1000],
                    ocr_text=extracted_text,
                    embedding=embeddings[0] if embeddings else None,
                    pool_id=pool_id,
                )
            except Exception as e:
                logger.warning("Pool image asset indexing failed for %s: %s", doc["id"], e)

        if ocr_assets:
            try:
                asset_count = await _index_ocr_assets_for_document(
                    document_id=doc["id"],
                    user_id=current_user["id"],
                    filename=file.filename,
                    ocr_assets=ocr_assets,
                    pool_id=pool_id,
                )
                if asset_count:
                    doc["asset_count"] = asset_count
            except Exception as e:
                logger.warning("Pool OCR asset indexing failed for %s: %s", doc["id"], e)

        summary = await _summarize_document(extracted_text, file.filename)
        if summary:
            documents_mod.update_document_summary(doc["id"], summary)
            doc["summary"] = summary
    except Exception as e:
        logger.error(f"RAG processing failed for pool doc {doc['id']}: {e}")
        doc["status"] = "error"
        doc["error_message"] = str(e)

    return doc


@app.post("/api/pools/{pool_id}/documents/text", response_model=None)
@limiter.limit("20/minute")
async def upload_pool_text(
    pool_id: str,
    payload: UploadPoolTextRequest,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    del request
    pools_mod.require_pool_role(pool_id, current_user["id"], "editor")

    text_content = payload.content.strip()
    if not text_content:
        raise HTTPException(status_code=422, detail="Text content cannot be empty")

    title = (payload.title or "").strip()
    if title:
        filename = f"{title}.txt" if not title.lower().endswith(".txt") else title
    else:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H-%M")
        filename = f"Eingefuegter Text {timestamp}.txt"

    file_size_bytes = len(text_content.encode("utf-8"))
    max_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size_bytes > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds {MAX_UPLOAD_SIZE_MB}MB limit",
        )

    doc = documents_mod.create_document(
        user_id=current_user["id"],
        chat_id=None,
        filename=filename,
        file_type="txt",
        file_size_bytes=file_size_bytes,
        extracted_text=text_content,
        pool_id=pool_id,
    )

    try:
        chunk_count, _tokens_used = await rag_mod.process_document(
            doc["id"], text_content, current_user["id"],
        )
        doc["chunk_count"] = chunk_count
        doc["status"] = "ready"
    except Exception as e:
        logger.error(f"RAG processing failed for pool text doc {doc['id']}: {e}")
        doc["status"] = "error"
        doc["error_message"] = str(e)

    return doc


@app.delete("/api/pools/{pool_id}/documents/{document_id}", response_model=None)
async def delete_pool_document(
    pool_id: str,
    document_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "editor")
    # Verify document belongs to this pool
    doc = documents_mod.get_document(document_id, current_user["id"])
    if not doc:
        # Try without user filter for pool docs (uploaded by other users)
        from .database import supabase as db
        result = db.table("app_documents").select("id").eq("id", document_id).eq("pool_id", pool_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        db.table("app_documents").delete().eq("id", document_id).execute()
        return {"deleted": True}
    deleted = documents_mod.delete_document(document_id, current_user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"deleted": True}


# ── Pool Chats ──


@app.get("/api/pools/{pool_id}/chats", response_model=None)
async def list_pool_chats(
    pool_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    return pools_mod.list_pool_chats(pool_id, current_user["id"])


@app.post("/api/pools/{pool_id}/chats", response_model=None)
async def create_pool_chat(
    pool_id: str,
    payload: CreatePoolChatRequest,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    model = payload.model or admin_crud.get_default_model_id() or DEFAULT_MODEL
    return pools_mod.create_pool_chat(
        pool_id=pool_id,
        created_by=current_user["id"],
        title=payload.title,
        is_shared=payload.is_shared,
        model=model,
        temperature=payload.temperature,
    )


@app.get("/api/pools/{pool_id}/chats/{chat_id}", response_model=None)
async def get_pool_chat(
    pool_id: str,
    chat_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    chat = pools_mod.get_pool_chat(chat_id)
    if not chat or chat["pool_id"] != pool_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    # Private chat visibility: only creator can see it
    if not chat["is_shared"] and chat["created_by"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@app.post("/api/pools/{pool_id}/chats/{chat_id}/message", response_model=None)
@limiter.limit("60/minute")
async def send_pool_message(
    pool_id: str,
    chat_id: str,
    payload: SendPoolMessageRequest,
    request: Request,
    current_user: Dict = Depends(get_current_user),
):
    del request
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")

    chat = pools_mod.get_pool_chat(chat_id)
    if not chat or chat["pool_id"] != pool_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not chat["is_shared"] and chat["created_by"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Chat not found")

    model = payload.model or chat.get("model") or admin_crud.get_default_model_id() or DEFAULT_MODEL
    temperature = payload.temperature if payload.temperature is not None else (
        chat.get("temperature") if chat.get("temperature") is not None else DEFAULT_TEMPERATURE
    )

    # Store user message
    pools_mod.add_pool_chat_message(chat_id, "user", payload.content, user_id=current_user["id"])

    # Build LLM messages from chat history
    llm_messages = _build_llm_messages(chat.get("messages", []))
    llm_messages.append({"role": "user", "content": payload.content})

    image_mode = (payload.image_mode or "auto").lower()
    rag_image_sources = []
    _apply_image_source_policy(llm_messages, image_mode)

    # RAG: inject relevant pool document context
    rag_sources = []
    has_doc_context = False

    # Detect intent first (never fails); initialize chunks before vector search
    query_intent = rag_mod.detect_query_intent(payload.content)
    doc_filters = rag_mod.parse_document_filters(payload.content)
    chunks = []

    # Step 1: Vector/targeted search — best-effort, failures must not block text fallback
    try:
        rag_settings = admin_crud.get_rag_settings()
        chunks = await rag_mod.retrieve_chunks_with_strategy(
            query=payload.content,
            user_id=current_user["id"],
            pool_id=pool_id,
            intent=query_intent,
            rerank_settings=rag_settings,
            document_filters=doc_filters,
        )
    except Exception as e:
        logger.warning("Pool RAG vector search failed: %s", e, exc_info=True)

    # Step 2: Inject context — always runs regardless of vector search outcome
    try:
        if chunks:
            rag_context = rag_mod.build_rag_context(chunks)
            rag_sources = [
                {
                    "filename": c["filename"],
                    "similarity": round(c["similarity"], 3),
                    "excerpt": _make_excerpt(c.get("content", "")),
                    "chunk_index": c.get("chunk_index", 0),
                    "page_number": c.get("page_number"),
                }
                for c in chunks
            ]
            _inject_system_context(llm_messages, rag_context)
            has_doc_context = True
        else:
            pool_docs = pools_mod.list_pool_documents(pool_id)
            docs_context = _build_available_documents_context(pool_docs)
            _inject_system_context(llm_messages, docs_context)

        # For listing intents, always inject the full document list (even when chunks found)
        if query_intent == "listing":
            pool_docs = pools_mod.list_pool_documents(pool_id)
            docs_context = _build_available_documents_context(pool_docs)
            _inject_system_context(llm_messages, docs_context)

        should_try_images = rag_mod.should_use_image_retrieval(payload.content, image_mode)
        if not should_try_images and image_mode == "auto" and query_intent == "summary":
            should_try_images = True
        if not should_try_images and image_mode == "auto" and not chunks:
            should_try_images = True

        if should_try_images:
            try:
                assets = await rag_mod.search_similar_assets(
                    query=payload.content,
                    user_id=current_user["id"],
                    pool_id=pool_id,
                    top_k=8 if query_intent == "summary" else 5,
                    threshold=0.0 if query_intent == "summary" else rag_mod.RAG_SIMILARITY_THRESHOLD,
                )
            except Exception as e:
                logger.warning("Pool image asset search failed: %s", e, exc_info=True)
                assets = []
            image_context = rag_mod.build_image_rag_context(assets)
            _inject_system_context(llm_messages, image_context)
            if image_context:
                has_doc_context = True
            rag_image_sources = [
                {
                    "asset_id": a.get("asset_id"),
                    "document_id": a.get("document_id"),
                    "filename": a.get("filename"),
                    "page_number": a.get("page_number"),
                    "caption": a.get("caption"),
                    "url": a.get("storage_path"),
                    "similarity": round(a.get("similarity", 0), 3),
                }
                for a in assets
            ]

        if not has_doc_context:
            text_rows = documents_mod.list_ready_pool_document_texts(
                pool_id=pool_id,
                limit=3,
            )
            text_context = _build_document_text_fallback_context(text_rows)
            _inject_system_context(llm_messages, text_context)
            if text_context:
                has_doc_context = True
    except Exception as e:
        logger.warning("Pool RAG injection failed: %s", e, exc_info=True)

    if has_doc_context:
        _apply_document_access_policy(llm_messages)

    if payload.stream:
        return StreamingResponse(
            _stream_pool_response(
                pool_id, chat_id, llm_messages, model, temperature,
                current_user["id"], rag_sources=rag_sources, rag_image_sources=rag_image_sources,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming
    try:
        result = await call_llm(llm_messages, model, temperature)
        assistant_content = result["content"]
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    pools_mod.add_pool_chat_message(chat_id, "assistant", assistant_content, model=model)

    usage = result.get("usage", {})
    if usage:
        provider, _ = parse_model_string(model)
        record_usage(
            user_id=current_user["id"],
            chat_id=None,
            model=model,
            provider=provider,
            prompt_tokens=usage.get("prompt_tokens", usage.get("input_tokens", 0)),
            completion_tokens=usage.get("completion_tokens", usage.get("output_tokens", 0)),
        )

    updated_chat = pools_mod.get_pool_chat(chat_id)
    if not updated_chat:
        raise HTTPException(status_code=500, detail="Failed to load updated chat")
    if rag_sources:
        updated_chat["rag_sources"] = rag_sources
    if rag_image_sources:
        updated_chat["rag_image_sources"] = rag_image_sources
    return updated_chat


async def _stream_pool_response(
    pool_id: str,
    chat_id: str,
    llm_messages: List[Dict[str, str]],
    model: str,
    temperature: float,
    user_id: str,
    rag_sources: Optional[List[Dict]] = None,
    rag_image_sources: Optional[List[Dict]] = None,
):
    full_content = ""
    usage = {}
    try:
        async for chunk in stream_llm(llm_messages, model, temperature):
            if isinstance(chunk, dict):
                usage = chunk.get("usage", {})
            else:
                full_content += chunk
                yield f"data: {json.dumps({'delta': chunk})}\n\n"

        pools_mod.add_pool_chat_message(chat_id, "assistant", full_content, model=model, rag_sources=rag_sources or None)

        if usage:
            provider, _ = parse_model_string(model)
            record_usage(
                user_id=user_id,
                chat_id=None,
                model=model,
                provider=provider,
                prompt_tokens=usage.get("prompt_tokens", usage.get("input_tokens", 0)),
                completion_tokens=usage.get("completion_tokens", usage.get("output_tokens", 0)),
            )

        done_data = {'done': True, 'content': full_content}
        if rag_sources:
            done_data['sources'] = rag_sources
        if rag_image_sources:
            done_data['image_sources'] = rag_image_sources
        yield f"data: {json.dumps(done_data)}\n\n"

    except LLMError as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
    except Exception as e:
        logger.error(f"Pool stream error: {e}")
        yield f"data: {json.dumps({'error': 'An unexpected error occurred'})}\n\n"


@app.delete("/api/pools/{pool_id}/chats/{chat_id}", response_model=None)
async def delete_pool_chat(
    pool_id: str,
    chat_id: str,
    current_user: Dict = Depends(get_current_user),
):
    pools_mod.require_pool_role(pool_id, current_user["id"], "viewer")
    chat = pools_mod.get_pool_chat(chat_id)
    if not chat or chat["pool_id"] != pool_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    # Only creator or admin+ can delete
    if chat["created_by"] != current_user["id"]:
        pools_mod.require_pool_role(pool_id, current_user["id"], "admin")
    pools_mod.delete_pool_chat(chat_id)
    return {"deleted": True}
