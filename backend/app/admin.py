import logging
from typing import Any, Dict, List, Optional

from .database import supabase

logger = logging.getLogger(__name__)

DEFAULT_RAG_SETTINGS = {
    "rerank_enabled": False,
    "rerank_candidates": 20,
    "rerank_top_n": 6,
    "rerank_model": "rerank-v3.5",
    "embedding_provider": "openai",
    "embedding_deployment": "",
}


def list_users() -> List[Dict[str, Any]]:
    result = supabase.table("app_users").select(
        "id,username,email,is_active,is_admin,created_at"
    ).order("created_at", desc=True).execute()
    return result.data


def update_user(user_id: str, is_active: Optional[bool] = None, is_admin: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    updates = {}
    if is_active is not None:
        updates["is_active"] = is_active
    if is_admin is not None:
        updates["is_admin"] = is_admin
    if not updates:
        return None

    result = supabase.table("app_users").update(updates).eq("id", user_id).execute()
    if not result.data:
        return None
    return result.data[0]


def get_detailed_usage(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    query = supabase.table("chat_token_usage").select("*")
    if start_date:
        query = query.gte("created_at", start_date)
    if end_date:
        query = query.lte("created_at", end_date + "T23:59:59")
    result = query.execute()
    rows = result.data or []

    # Get all users for name resolution
    users_result = supabase.table("app_users").select("id,username,email").execute()
    users_map = {u["id"]: u for u in (users_result.data or [])}

    # Summary
    total_tokens = sum(r["total_tokens"] for r in rows)
    total_prompt = sum(r["prompt_tokens"] for r in rows)
    total_completion = sum(r["completion_tokens"] for r in rows)
    total_cost = sum(float(r["estimated_cost"]) for r in rows)

    summary = {
        "total_requests": len(rows),
        "total_tokens": total_tokens,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "estimated_cost": round(total_cost, 4),
    }

    # By provider
    by_provider_map: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        p = r.get("provider", "unknown")
        if p not in by_provider_map:
            by_provider_map[p] = {"provider": p, "requests": 0, "tokens": 0, "estimated_cost": 0.0}
        by_provider_map[p]["requests"] += 1
        by_provider_map[p]["tokens"] += r["total_tokens"]
        by_provider_map[p]["estimated_cost"] += float(r["estimated_cost"])
    by_provider = sorted(by_provider_map.values(), key=lambda x: x["estimated_cost"], reverse=True)
    for entry in by_provider:
        entry["estimated_cost"] = round(entry["estimated_cost"], 4)

    # By model — key is (model, provider) to distinguish same model across providers
    by_model_map: Dict[tuple, Dict[str, Any]] = {}
    for r in rows:
        m = r.get("model", "unknown")
        p = r.get("provider", "unknown")
        key = (m, p)
        if key not in by_model_map:
            by_model_map[key] = {
                "model": m,
                "provider": p,
                "requests": 0,
                "tokens": 0,
                "estimated_cost": 0.0,
            }
        by_model_map[key]["requests"] += 1
        by_model_map[key]["tokens"] += r["total_tokens"]
        by_model_map[key]["estimated_cost"] += float(r["estimated_cost"])
    by_model = sorted(by_model_map.values(), key=lambda x: x["estimated_cost"], reverse=True)
    for entry in by_model:
        entry["avg_tokens"] = round(entry["tokens"] / entry["requests"]) if entry["requests"] else 0
        entry["estimated_cost"] = round(entry["estimated_cost"], 4)

    # By user
    by_user_map: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        uid = r["user_id"]
        if uid not in by_user_map:
            user = users_map.get(uid, {})
            by_user_map[uid] = {
                "user_id": uid,
                "username": user.get("username", "Unknown"),
                "email": user.get("email", ""),
                "requests": 0,
                "tokens": 0,
                "estimated_cost": 0.0,
            }
        by_user_map[uid]["requests"] += 1
        by_user_map[uid]["tokens"] += r["total_tokens"]
        by_user_map[uid]["estimated_cost"] += float(r["estimated_cost"])
    by_user = sorted(by_user_map.values(), key=lambda x: x["estimated_cost"], reverse=True)
    for entry in by_user:
        entry["estimated_cost"] = round(entry["estimated_cost"], 4)

    # Daily
    daily_map: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        day = r["created_at"][:10]  # YYYY-MM-DD
        if day not in daily_map:
            daily_map[day] = {"date": day, "requests": 0, "tokens": 0, "estimated_cost": 0.0}
        daily_map[day]["requests"] += 1
        daily_map[day]["tokens"] += r["total_tokens"]
        daily_map[day]["estimated_cost"] += float(r["estimated_cost"])
    daily = sorted(daily_map.values(), key=lambda x: x["date"], reverse=True)
    for entry in daily:
        entry["estimated_cost"] = round(entry["estimated_cost"], 4)

    return {
        "summary": summary,
        "by_provider": by_provider,
        "by_model": by_model,
        "by_user": by_user,
        "daily": daily,
    }


def get_system_stats() -> Dict[str, Any]:
    users = supabase.table("app_users").select("id,is_active", count="exact").execute()
    active_users = supabase.table("app_users").select("id", count="exact").eq("is_active", True).execute()
    chats = supabase.table("chats").select("id", count="exact").execute()
    messages = supabase.table("chat_messages").select("id", count="exact").execute()
    assistants_q = supabase.table("assistants").select("id", count="exact").execute()
    templates_q = supabase.table("prompt_templates").select("id", count="exact").execute()

    return {
        "total_users": users.count or 0,
        "active_users": active_users.count or 0,
        "total_chats": chats.count or 0,
        "total_messages": messages.count or 0,
        "total_assistants": assistants_q.count or 0,
        "total_templates": templates_q.count or 0,
    }


# ── Model Config CRUD ──


def list_model_configs() -> List[Dict[str, Any]]:
    result = supabase.table("app_model_config").select("*").order("sort_order").execute()
    return result.data


def create_model_config(
    model_id: str,
    provider: str,
    display_name: str,
    sort_order: int = 0,
    deployment_name: Optional[str] = None,
) -> Dict[str, Any]:
    row: Dict[str, Any] = {
        "model_id": model_id,
        "provider": provider,
        "display_name": display_name,
        "sort_order": sort_order,
    }
    if deployment_name:
        row["deployment_name"] = deployment_name
    result = supabase.table("app_model_config").insert(row).execute()
    return result.data[0]


def update_model_config(config_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    allowed = {"display_name", "is_enabled", "is_default", "sort_order", "deployment_name"}
    update_data = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not update_data:
        return None

    # If setting a new default, unset all others first (unconditional — no boolean filter)
    if update_data.get("is_default") is True:
        supabase.table("app_model_config").update({"is_default": False}).neq("id", config_id).execute()

    result = supabase.table("app_model_config").update(update_data).eq("id", config_id).execute()
    if not result.data:
        return None
    return result.data[0]


def get_default_model_id() -> Optional[str]:
    """Return the model_id marked as default in app_model_config, or None."""
    try:
        result = supabase.table("app_model_config").select("model_id").eq(
            "is_default", True
        ).eq("is_enabled", True).limit(1).execute()
        if result.data:
            return result.data[0]["model_id"]
    except Exception:
        logger.warning("Failed to load default model from DB")
    return None


def delete_model_config(config_id: str) -> bool:
    result = supabase.table("app_model_config").delete().eq("id", config_id).execute()
    return len(result.data) > 0


def get_rag_settings() -> Dict[str, Any]:
    """Load runtime RAG settings from DB with sane defaults."""
    settings = dict(DEFAULT_RAG_SETTINGS)
    try:
        result = supabase.table("app_runtime_config").select("value").eq("key", "rag_settings").limit(1).execute()
        if result.data:
            value = result.data[0].get("value") or {}
            if isinstance(value, dict):
                settings.update(value)
    except Exception as e:
        logger.warning("Failed to load rag settings from DB: %s", e)

    # Normalize types/ranges defensively.
    settings["rerank_enabled"] = bool(settings.get("rerank_enabled", False))
    settings["rerank_candidates"] = max(5, min(100, int(settings.get("rerank_candidates", 20))))
    settings["rerank_top_n"] = max(1, min(30, int(settings.get("rerank_top_n", 6))))
    settings["rerank_model"] = str(settings.get("rerank_model", "rerank-v3.5")).strip() or "rerank-v3.5"
    if settings["rerank_top_n"] > settings["rerank_candidates"]:
        settings["rerank_top_n"] = settings["rerank_candidates"]
    settings["embedding_provider"] = settings.get("embedding_provider", "openai") if settings.get("embedding_provider") in ("openai", "azure") else "openai"
    settings["embedding_deployment"] = str(settings.get("embedding_deployment", "")).strip()
    return settings


def update_rag_settings(**fields: Any) -> Dict[str, Any]:
    current = get_rag_settings()
    allowed = {"rerank_enabled", "rerank_candidates", "rerank_top_n", "rerank_model", "embedding_provider", "embedding_deployment"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not updates:
        return current

    merged = {**current, **updates}
    merged["rerank_enabled"] = bool(merged.get("rerank_enabled", False))
    merged["rerank_candidates"] = max(5, min(100, int(merged.get("rerank_candidates", 20))))
    merged["rerank_top_n"] = max(1, min(30, int(merged.get("rerank_top_n", 6))))
    merged["rerank_model"] = str(merged.get("rerank_model", "rerank-v3.5")).strip() or "rerank-v3.5"
    if merged["rerank_top_n"] > merged["rerank_candidates"]:
        merged["rerank_top_n"] = merged["rerank_candidates"]
    merged["embedding_provider"] = merged.get("embedding_provider", "openai") if merged.get("embedding_provider") in ("openai", "azure") else "openai"
    merged["embedding_deployment"] = str(merged.get("embedding_deployment", "")).strip()

    row = {"key": "rag_settings", "value": merged}
    result = supabase.table("app_runtime_config").upsert(row, on_conflict="key").execute()
    if result.data:
        return merged
    return get_rag_settings()
