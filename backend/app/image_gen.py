"""Image generation: provider dispatch, daily cap, style prefix, gallery."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

from . import admin as admin_crud
from . import audit
from .database import supabase
from .image_storage import (
    create_pending_image,
    get_user_images_page,
    mark_image_failed,
    mark_image_succeeded,
)
from .providers import get_api_key

logger = logging.getLogger(__name__)

# Provider URL lifetime is conservatively 60 minutes for both OpenAI and xAI.
_PROVIDER_URL_TTL_MINUTES = 60


def _is_moderation_error(body) -> bool:
    """Heuristic: return True if a provider error response indicates a content-policy block."""
    if isinstance(body, dict):
        err = body.get("error", {}) if isinstance(body.get("error"), dict) else {}
        code = (err.get("code") or "").lower()
        message = (err.get("message") or "").lower()
        if "content_policy" in code or "moderation" in code:
            return True
        if any(token in message for token in ("content policy", "moderation", "safety system")):
            return True
    elif isinstance(body, str):
        lower = body.lower()
        if any(token in lower for token in ("content_policy_violation", "content policy", "moderation")):
            return True
    return False


# ── Daily cost cap ────────────────────────────────────────────────────────────


def check_daily_cost_cap(user_id: str) -> Dict[str, Any]:
    """Return cap state for the user.

    Only succeeded images count against the daily total — pending/failed do not.
    Returns: {daily_limit_usd, used_today_usd, remaining_usd, allowed: bool}
    """
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Sum succeeded images generated today
    agg_result = (
        supabase.table("app_generated_images")
        .select("cost_usd")
        .eq("user_id", user_id)
        .eq("status", "succeeded")
        .gte("created_at", f"{today_str}T00:00:00+00:00")
        .lt("created_at", f"{today_str}T23:59:59.999999+00:00")
        .execute()
    )
    used_today = sum(float(r["cost_usd"]) for r in (agg_result.data or []))

    # Per-user limit
    limit_row = (
        supabase.table("app_user_limits")
        .select("daily_image_cost_limit_usd")
        .eq("user_id", user_id)
        .execute()
    )
    daily_limit: Optional[float] = None
    if limit_row.data and limit_row.data[0].get("daily_image_cost_limit_usd") is not None:
        daily_limit = float(limit_row.data[0]["daily_image_cost_limit_usd"])

    # Fall back to system default
    if daily_limit is None:
        setting_row = (
            supabase.table("app_settings")
            .select("value")
            .eq("key", "default_daily_image_cost_limit_usd")
            .execute()
        )
        if setting_row.data:
            daily_limit = float(setting_row.data[0]["value"])
        else:
            daily_limit = 5.0  # Hard fallback if settings row is missing

    remaining = max(0.0, daily_limit - used_today)
    return {
        "daily_limit_usd": daily_limit,
        "used_today_usd": round(used_today, 6),
        "remaining_usd": round(remaining, 6),
        "allowed": used_today < daily_limit,
    }


def get_user_budget(user_id: str) -> Dict[str, Any]:
    """Return the current user's daily image cost budget.

    Reuses the same UTC day boundaries as check_daily_cost_cap so the numbers
    are always consistent with the cap enforcement check.
    """
    cap = check_daily_cost_cap(user_id)
    return {
        "daily_limit_usd": cap["daily_limit_usd"],
        "used_today_usd": cap["used_today_usd"],
        "remaining_usd": cap["remaining_usd"],
    }


# ── Style prefix ─────────────────────────────────────────────────────────────


def resolve_style_prefix(user_id: str) -> str:  # noqa: ARG001  (user_id reserved for v2 user-scope)
    """Return the active global style prefix, or empty string.

    v1: only the single active global-scope row is considered.
    v2 will layer: global → team → user → pool.
    """
    result = (
        supabase.table("app_image_style_presets")
        .select("prefix")
        .eq("scope_type", "global")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0].get("prefix") or ""
    return ""


# ── Provider dispatch ─────────────────────────────────────────────────────────


async def _call_openai(
    model_name: str,
    prompt: str,
    parameters: Dict[str, Any],
) -> Dict[str, Any]:
    """POST to OpenAI images/generations and return {url: str, storage_kind: str}.

    Handles both response shapes:
    - ``url`` field  → storage_kind='provider_url'  (dall-e-2, dall-e-3)
    - ``b64_json`` field → storage_kind='data_uri'  (gpt-image-1)
    """
    api_key = get_api_key("openai")
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    payload: Dict[str, Any] = {"model": model_name, "prompt": prompt, "n": 1}
    payload.update(parameters)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )

    if response.status_code != 200:
        logger.error("OpenAI image generation failed: %s %s", response.status_code, response.text[:500])
        exc = HTTPException(
            status_code=502,
            detail=f"OpenAI returned {response.status_code}",
        )
        try:
            exc._provider_body = response.json()  # type: ignore[attr-defined]
        except Exception:
            exc._provider_body = response.text[:500]  # type: ignore[attr-defined]
        raise exc

    data = response.json()
    try:
        item = data["data"][0]
    except (KeyError, IndexError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected OpenAI response shape") from exc

    if item.get("url"):
        return {"url": item["url"], "storage_kind": "provider_url"}
    if item.get("b64_json"):
        return {
            "url": f"data:image/png;base64,{item['b64_json']}",
            "storage_kind": "data_uri",
        }
    raise HTTPException(status_code=502, detail="Unexpected OpenAI response shape")


async def _call_xai(
    model_name: str,
    prompt: str,
    parameters: Dict[str, Any],
) -> Dict[str, Any]:
    """POST to xAI images/generations and return {url: str, storage_kind: str}.

    Handles both response shapes:
    - ``url`` field  → storage_kind='provider_url'
    - ``b64_json`` field → storage_kind='data_uri'
    """
    api_key = get_api_key("xai")
    if not api_key:
        raise HTTPException(status_code=503, detail="xAI API key not configured")

    payload: Dict[str, Any] = {"model": model_name, "prompt": prompt, "n": 1}
    payload.update(parameters)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.x.ai/v1/images/generations",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )

    if response.status_code != 200:
        logger.error("xAI image generation failed: %s %s", response.status_code, response.text[:500])
        exc = HTTPException(
            status_code=502,
            detail=f"xAI returned {response.status_code}",
        )
        try:
            exc._provider_body = response.json()  # type: ignore[attr-defined]
        except Exception:
            exc._provider_body = response.text[:500]  # type: ignore[attr-defined]
        raise exc

    data = response.json()
    try:
        item = data["data"][0]
    except (KeyError, IndexError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected xAI response shape") from exc

    if item.get("url"):
        return {"url": item["url"], "storage_kind": "provider_url"}
    if item.get("b64_json"):
        return {
            "url": f"data:image/png;base64,{item['b64_json']}",
            "storage_kind": "data_uri",
        }
    raise HTTPException(status_code=502, detail="Unexpected xAI response shape")


async def _call_provider(
    provider: str,
    model_name: str,
    prompt: str,
    parameters: Dict[str, Any],
) -> Dict[str, Any]:
    """Dispatch to the correct provider function."""
    if provider == "openai":
        return await _call_openai(model_name, prompt, parameters)
    if provider == "xai":
        return await _call_xai(model_name, prompt, parameters)
    raise HTTPException(
        status_code=400,
        detail=f"Unsupported image provider: {provider}. Supported: openai, xai",
    )


# ── Cost estimation ───────────────────────────────────────────────────────────


def _estimate_cost(pricing: Optional[Dict[str, Any]]) -> float:
    """Extract per-image cost from pricing JSONB.

    v1 only handles the 'fixed' type.  Structure is ready for future types
    ('size_variant', 'per_count') without changing callers.
    """
    if not pricing:
        return 0.0
    pricing_type = pricing.get("type", "fixed")
    if pricing_type == "fixed":
        return float(pricing.get("cost_per_image_usd", 0.0))
    # Future types — return 0 and log rather than hard-failing
    logger.warning("_estimate_cost: unhandled pricing type=%s, defaulting to 0", pricing_type)
    return 0.0


# ── Main entry point ─────────────────────────────────────────────────────────


async def generate_image_for_user(
    user_id: str,
    model: Optional[str],
    prompt: str,
    parameters: Dict[str, Any],
    source: str,
    chat_id: Optional[str] = None,
    pool_chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate an image on behalf of a user.

    Sequence (financial-integrity order):
      0. Resolve default model when none supplied
      1. Validate model exists with model_type='image'
      2. Estimate cost from pricing JSONB
      3. Check daily cost cap — 402 if exceeded
      4. Resolve style prefix
      5. Build resolved_prompt
      6. Insert pending stub row  ← BEFORE provider call
      7. Audit IMAGE_GENERATE
      8. Call provider
      9a. Success: mark_image_succeeded, return record
      9b. Failure: mark_image_failed, audit IMAGE_GENERATE_FAILED, raise 502/503
    """
    # 0. Resolve default image model when caller omits it (e.g. slash-command path)
    if not model:
        model = admin_crud.get_default_model_id(model_type="image")
        if not model:
            raise HTTPException(
                status_code=400,
                detail="Kein Standard-Bildmodell konfiguriert. Bitte ein Bildmodell als Standard markieren.",
            )

    # 1. Validate model
    model_row_result = (
        supabase.table("app_model_config")
        .select("id,model_id,provider,pricing,is_enabled")
        .eq("model_id", model)
        .eq("model_type", "image")
        .execute()
    )
    if not model_row_result.data:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{model}' not found or not registered as an image model",
        )
    model_row = model_row_result.data[0]
    if not model_row.get("is_enabled", True):
        raise HTTPException(status_code=400, detail=f"Model '{model}' is disabled")

    provider = model_row["provider"]
    pricing = model_row.get("pricing") or {}

    # 2. Estimate cost
    estimated_cost = _estimate_cost(pricing)

    # 3. Daily cap check
    cap = check_daily_cost_cap(user_id)
    if not cap["allowed"]:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Daily image cost limit of ${cap['daily_limit_usd']:.2f} reached. "
                f"Used today: ${cap['used_today_usd']:.4f}."
            ),
        )

    # 4. Style prefix
    prefix = resolve_style_prefix(user_id)

    # 5. Resolved prompt
    if prefix:
        resolved_prompt = f"{prefix} {prompt}".strip()
    else:
        resolved_prompt = prompt.strip()

    # 6. Insert pending stub BEFORE calling provider
    pending = create_pending_image(
        user_id=user_id,
        prompt=prompt,
        resolved_prompt=resolved_prompt,
        provider=provider,
        model=model,
        source=source,
        parameters=parameters,
        estimated_cost=estimated_cost,
        chat_id=chat_id,
        pool_chat_id=pool_chat_id,
    )
    image_id = pending["id"]

    # 7. Audit immediately with metadata (NOT the prompt text — only its length)
    audit.log_event(
        action=audit.IMAGE_GENERATE,
        user_id=user_id,
        target_type="generated_image",
        target_id=image_id,
        metadata={
            "provider": provider,
            "model": model,
            "prompt_length": len(prompt),
            "cost_usd": estimated_cost,
            "source": source,
            **({"chat_id": chat_id} if chat_id else {}),
            **({"pool_chat_id": pool_chat_id} if pool_chat_id else {}),
        },
    )

    # 8. Call provider
    try:
        result = await _call_provider(provider, model, resolved_prompt, parameters)
    except HTTPException as exc:
        error_msg = f"HTTP {exc.status_code}: {exc.detail}"
        mark_image_failed(image_id, error_msg)
        provider_body = getattr(exc, "_provider_body", None)
        is_moderation = _is_moderation_error(provider_body or str(exc.detail))
        audit_action = audit.IMAGE_GENERATE_MODERATION_BLOCKED if is_moderation else audit.IMAGE_GENERATE_FAILED
        audit.log_event(
            action=audit_action,
            user_id=user_id,
            target_type="generated_image",
            target_id=image_id,
            metadata={"error_truncated": error_msg[:500], "provider": provider, "model": model},
        )
        raise
    except Exception as exc:
        error_msg = str(exc)[:500]
        mark_image_failed(image_id, error_msg)
        audit.log_event(
            action=audit.IMAGE_GENERATE_FAILED,
            user_id=user_id,
            target_type="generated_image",
            target_id=image_id,
            metadata={"error_truncated": error_msg, "provider": provider, "model": model},
        )
        raise HTTPException(status_code=502, detail="Image provider error") from exc

    # 9a. Success
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_PROVIDER_URL_TTL_MINUTES)
    final_record = mark_image_succeeded(
        image_id,
        result["url"],
        expires_at=expires_at,
        storage_kind=result.get("storage_kind", "provider_url"),
    )
    return final_record


# ── Gallery ───────────────────────────────────────────────────────────────────


def get_user_gallery(user_id: str, limit: int = 20, offset: int = 0) -> Dict[str, Any]:
    """Return paginated succeeded images for a user."""
    images = get_user_images_page(user_id, limit=limit, offset=offset)
    count_result = (
        supabase.table("app_generated_images")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("status", "succeeded")
        .execute()
    )
    total = count_result.count or 0
    return {"images": images, "limit": limit, "offset": offset, "total": total}


# ── Style preset CRUD ─────────────────────────────────────────────────────────


def list_style_presets() -> List[Dict[str, Any]]:
    result = (
        supabase.table("app_image_style_presets")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def create_style_preset(
    name: str,
    prefix: str,
    created_by: Optional[str] = None,
    scope_type: str = "global",
    scope_id: Optional[str] = None,
) -> Dict[str, Any]:
    row: Dict[str, Any] = {
        "name": name,
        "prefix": prefix,
        "scope_type": scope_type,
        "is_active": True,
    }
    if created_by:
        row["created_by"] = created_by
    if scope_id:
        row["scope_id"] = scope_id
    result = supabase.table("app_image_style_presets").insert(row).execute()
    return result.data[0]


def update_style_preset(preset_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    allowed = {"name", "prefix", "is_active", "scope_type", "scope_id"}
    update_data = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not update_data:
        return None
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("app_image_style_presets")
        .update(update_data)
        .eq("id", preset_id)
        .execute()
    )
    return result.data[0] if result.data else None


def delete_style_preset(preset_id: str) -> bool:
    result = (
        supabase.table("app_image_style_presets")
        .delete()
        .eq("id", preset_id)
        .execute()
    )
    return bool(result.data)


# ── Admin image usage ─────────────────────────────────────────────────────────


def get_image_usage_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Return aggregated image generation usage for admin overview."""
    query = (
        supabase.table("app_generated_images")
        .select("user_id,model,provider,cost_usd,status,created_at,app_users(username)")
        .eq("status", "succeeded")
    )
    if start_date:
        query = query.gte("created_at", f"{start_date}T00:00:00+00:00")
    if end_date:
        query = query.lte("created_at", f"{end_date}T23:59:59+00:00")

    result = query.execute()
    rows = result.data or []

    total_cost = 0.0
    by_user: Dict[str, Dict[str, Any]] = {}
    by_model: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        cost = float(row.get("cost_usd") or 0)
        total_cost += cost

        uid = row["user_id"]
        user_info = row.get("app_users") or {}
        username = user_info.get("username", uid)
        if uid not in by_user:
            by_user[uid] = {"user_id": uid, "username": username, "count": 0, "cost_usd": 0.0}
        by_user[uid]["count"] += 1
        by_user[uid]["cost_usd"] += cost

        mdl = row["model"]
        if mdl not in by_model:
            by_model[mdl] = {"model": mdl, "provider": row["provider"], "count": 0, "cost_usd": 0.0}
        by_model[mdl]["count"] += 1
        by_model[mdl]["cost_usd"] += cost

    return {
        "summary": {
            "total_images": len(rows),
            "total_cost_usd": round(total_cost, 6),
        },
        "by_user": sorted(by_user.values(), key=lambda x: x["cost_usd"], reverse=True),
        "by_model": sorted(by_model.values(), key=lambda x: x["cost_usd"], reverse=True),
    }
