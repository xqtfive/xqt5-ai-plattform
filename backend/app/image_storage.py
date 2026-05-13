"""Image storage helpers: stub row lifecycle and URL resolution."""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .database import supabase

logger = logging.getLogger(__name__)


def resolve_image_url(image_record: Dict[str, Any]) -> str:
    """Return the accessible URL for a generated image.

    v1 supports provider_url (signed URL from OpenAI/xAI) and data_uri
    (base64-inlined for providers like gpt-image-1 that return b64_json).
    Future supabase_storage kind extends this function.
    """
    storage_kind = image_record.get("storage_kind", "provider_url")
    if storage_kind in ("provider_url", "data_uri"):
        return image_record.get("image_url") or ""
    logger.warning("resolve_image_url: unhandled storage_kind=%s", storage_kind)
    return image_record.get("image_url") or ""


def create_pending_image(
    user_id: str,
    prompt: str,
    resolved_prompt: str,
    provider: str,
    model: str,
    source: str,
    parameters: Optional[Dict[str, Any]] = None,
    estimated_cost: float = 0.0,
    chat_id: Optional[str] = None,
    pool_chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a stub image row with status='pending' BEFORE calling the provider.

    This guards financial integrity: the row exists before money is potentially spent.
    """
    row: Dict[str, Any] = {
        "user_id": user_id,
        "prompt": prompt,
        "resolved_prompt": resolved_prompt,
        "provider": provider,
        "model": model,
        "source": source,
        "status": "pending",
        "storage_kind": "provider_url",
        "cost_usd": estimated_cost,
        "parameters_json": parameters or {},
    }
    if chat_id:
        row["chat_id"] = chat_id
    if pool_chat_id:
        row["pool_chat_id"] = pool_chat_id

    result = supabase.table("app_generated_images").insert(row).execute()
    return result.data[0]


def mark_image_succeeded(
    image_id: str,
    image_url: str,
    expires_at: Optional[datetime] = None,
    storage_kind: str = "provider_url",
) -> Dict[str, Any]:
    """Transition a pending row to succeeded and attach the URL or data URI."""
    updates: Dict[str, Any] = {
        "status": "succeeded",
        "image_url": image_url,
        "storage_kind": storage_kind,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if expires_at is not None and storage_kind == "provider_url":
        updates["provider_url_expires_at"] = expires_at.isoformat()

    result = (
        supabase.table("app_generated_images")
        .update(updates)
        .eq("id", image_id)
        .execute()
    )
    return result.data[0]


def mark_image_failed(image_id: str, error_message: str) -> Dict[str, Any]:
    """Transition a pending row to failed and record the error."""
    updates: Dict[str, Any] = {
        "status": "failed",
        "cost_usd": 0,
        "error_message": error_message[:2000],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = (
        supabase.table("app_generated_images")
        .update(updates)
        .eq("id", image_id)
        .execute()
    )
    return result.data[0]


def get_user_images_page(
    user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """Return a page of succeeded images for a user, newest first."""
    result = (
        supabase.table("app_generated_images")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "succeeded")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data or []
