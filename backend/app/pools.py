"""Pool management: CRUD, members, invite links, chats."""

import logging
import secrets
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from .database import supabase

logger = logging.getLogger(__name__)

# ── Role hierarchy ──

ROLE_LEVELS = {"viewer": 1, "editor": 2, "admin": 3, "owner": 4}


def get_user_pool_role(pool_id: str, user_id: str) -> Optional[str]:
    """Return the user's role in a pool: owner/admin/editor/viewer or None."""
    # Check ownership first
    pool = supabase.table("pool_pools").select("owner_id").eq("id", pool_id).execute()
    if not pool.data:
        return None
    if pool.data[0]["owner_id"] == user_id:
        return "owner"
    # Check membership
    member = (
        supabase.table("pool_members")
        .select("role")
        .eq("pool_id", pool_id)
        .eq("user_id", user_id)
        .execute()
    )
    if member.data:
        return member.data[0]["role"]
    return None


def require_pool_role(pool_id: str, user_id: str, min_role: str) -> str:
    """Return the user's role or raise 403/404 if insufficient."""
    role = get_user_pool_role(pool_id, user_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Pool not found")
    if ROLE_LEVELS.get(role, 0) < ROLE_LEVELS.get(min_role, 0):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return role


# ── Pool CRUD ──


def create_pool(
    owner_id: str,
    name: str,
    description: str = "",
    icon: str = "\U0001f4da",
    color: str = "#ee7f00",
) -> Dict[str, Any]:
    result = (
        supabase.table("pool_pools")
        .insert({
            "owner_id": owner_id,
            "name": name,
            "description": description,
            "icon": icon,
            "color": color,
        })
        .execute()
    )
    return result.data[0]


def list_pools_for_user(user_id: str) -> List[Dict[str, Any]]:
    """List all pools where user is owner or member."""
    # Owned pools
    owned = (
        supabase.table("pool_pools")
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    owned_pools = owned.data or []
    for p in owned_pools:
        p["role"] = "owner"

    # Member pools
    memberships = (
        supabase.table("pool_members")
        .select("pool_id, role")
        .eq("user_id", user_id)
        .execute()
    )
    member_pools = []
    for m in memberships.data or []:
        pool = (
            supabase.table("pool_pools")
            .select("*")
            .eq("id", m["pool_id"])
            .execute()
        )
        if pool.data:
            p = pool.data[0]
            p["role"] = m["role"]
            member_pools.append(p)

    owned_ids = {p["id"] for p in owned_pools}
    all_pools = owned_pools + [p for p in member_pools if p["id"] not in owned_ids]
    all_pools.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return all_pools


def get_pool(pool_id: str) -> Optional[Dict[str, Any]]:
    result = supabase.table("pool_pools").select("*").eq("id", pool_id).execute()
    return result.data[0] if result.data else None


def update_pool(pool_id: str, **kwargs: Any) -> Optional[Dict[str, Any]]:
    updates = {k: v for k, v in kwargs.items() if v is not None}
    if not updates:
        return get_pool(pool_id)
    result = (
        supabase.table("pool_pools").update(updates).eq("id", pool_id).execute()
    )
    return result.data[0] if result.data else None


def delete_pool(pool_id: str) -> bool:
    result = supabase.table("pool_pools").delete().eq("id", pool_id).execute()
    return bool(result.data)


# ── Members ──


def find_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    result = (
        supabase.table("app_users")
        .select("id, username, email")
        .eq("username", username)
        .execute()
    )
    return result.data[0] if result.data else None


def add_member(pool_id: str, user_id: str, role: str = "viewer") -> Dict[str, Any]:
    result = (
        supabase.table("pool_members")
        .insert({"pool_id": pool_id, "user_id": user_id, "role": role})
        .execute()
    )
    return result.data[0]


def list_members(pool_id: str) -> List[Dict[str, Any]]:
    """List all members + owner for a pool."""
    pool = get_pool(pool_id)
    if not pool:
        return []

    # Get owner info
    owner_result = (
        supabase.table("app_users")
        .select("id, username, email")
        .eq("id", pool["owner_id"])
        .execute()
    )
    members = []
    if owner_result.data:
        owner = owner_result.data[0]
        owner["role"] = "owner"
        members.append(owner)

    # Get members with user info
    member_rows = (
        supabase.table("pool_members")
        .select("user_id, role, created_at")
        .eq("pool_id", pool_id)
        .order("created_at")
        .execute()
    )
    for m in member_rows.data or []:
        user_result = (
            supabase.table("app_users")
            .select("id, username, email")
            .eq("id", m["user_id"])
            .execute()
        )
        if user_result.data:
            u = user_result.data[0]
            u["role"] = m["role"]
            u["member_since"] = m["created_at"]
            members.append(u)

    return members


def update_member_role(pool_id: str, user_id: str, role: str) -> Optional[Dict[str, Any]]:
    result = (
        supabase.table("pool_members")
        .update({"role": role})
        .eq("pool_id", pool_id)
        .eq("user_id", user_id)
        .execute()
    )
    return result.data[0] if result.data else None


def remove_member(pool_id: str, user_id: str) -> bool:
    result = (
        supabase.table("pool_members")
        .delete()
        .eq("pool_id", pool_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


# ── Invite Links ──


def create_invite_link(
    pool_id: str,
    created_by: str,
    role: str = "viewer",
    max_uses: Optional[int] = None,
    expires_at: Optional[str] = None,
) -> Dict[str, Any]:
    row = {
        "pool_id": pool_id,
        "created_by": created_by,
        "role": role,
        "token": secrets.token_hex(24),
    }
    if max_uses is not None:
        row["max_uses"] = max_uses
    if expires_at is not None:
        row["expires_at"] = expires_at
    result = supabase.table("pool_invite_links").insert(row).execute()
    return result.data[0]


def get_invite_by_token(token: str) -> Optional[Dict[str, Any]]:
    result = (
        supabase.table("pool_invite_links")
        .select("*")
        .eq("token", token)
        .eq("is_active", True)
        .execute()
    )
    if not result.data:
        return None
    invite = result.data[0]
    # Check expiry
    if invite.get("expires_at"):
        from datetime import datetime, timezone

        expires = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
        if expires < datetime.now(timezone.utc):
            return None
    # Check max uses
    if invite.get("max_uses") is not None and invite["use_count"] >= invite["max_uses"]:
        return None
    return invite


def use_invite_link(invite_id: str, user_id: str) -> Dict[str, Any]:
    """Increment use_count and add user as member."""
    invite = (
        supabase.table("pool_invite_links")
        .select("*")
        .eq("id", invite_id)
        .execute()
    )
    if not invite.data:
        raise HTTPException(status_code=404, detail="Invite not found")
    inv = invite.data[0]

    # Check if already a member or owner
    role = get_user_pool_role(inv["pool_id"], user_id)
    if role is not None:
        raise HTTPException(status_code=409, detail="Already a member of this pool")

    # Increment use count
    supabase.table("pool_invite_links").update(
        {"use_count": inv["use_count"] + 1}
    ).eq("id", invite_id).execute()

    # Add as member
    add_member(inv["pool_id"], user_id, inv["role"])

    pool = get_pool(inv["pool_id"])
    return pool


def list_invite_links(pool_id: str) -> List[Dict[str, Any]]:
    result = (
        supabase.table("pool_invite_links")
        .select("*")
        .eq("pool_id", pool_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def revoke_invite_link(invite_id: str) -> bool:
    result = (
        supabase.table("pool_invite_links")
        .update({"is_active": False})
        .eq("id", invite_id)
        .execute()
    )
    return bool(result.data)


# ── Pool Documents ──


def list_pool_documents(pool_id: str) -> List[Dict[str, Any]]:
    result = (
        supabase.table("app_documents")
        .select(
            "id,filename,file_type,file_size_bytes,chunk_count,status,error_message,user_id,summary,created_at"
        )
        .eq("pool_id", pool_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_pool_document_preview(pool_id: str, document_id: str) -> Optional[Dict[str, Any]]:
    doc_result = (
        supabase.table("app_documents")
        .select("id,filename,file_type,status,extracted_text")
        .eq("id", document_id)
        .eq("pool_id", pool_id)
        .limit(1)
        .execute()
    )
    if not doc_result.data:
        return None

    doc = doc_result.data[0]
    extracted_text = str(doc.get("extracted_text") or "")
    max_chars = 20000
    text_preview = extracted_text[:max_chars]

    preview: Dict[str, Any] = {
        "id": doc["id"],
        "filename": doc.get("filename"),
        "file_type": doc.get("file_type"),
        "status": doc.get("status"),
        "text_preview": text_preview,
        "text_length": len(extracted_text),
        "truncated": len(extracted_text) > max_chars,
    }

    if doc.get("file_type") == "image":
        try:
            asset_result = (
                supabase.table("app_document_assets")
                .select("storage_path")
                .eq("document_id", document_id)
                .limit(1)
                .execute()
            )
            if asset_result.data:
                preview["image_data_url"] = asset_result.data[0].get("storage_path")
        except Exception as e:
            logger.info("Image preview asset lookup failed for %s: %s", document_id, e)

    return preview


def has_ready_pool_documents(pool_id: str) -> bool:
    result = (
        supabase.table("app_documents")
        .select("id", count="exact")
        .eq("pool_id", pool_id)
        .eq("status", "ready")
        .limit(1)
        .execute()
    )
    return bool(result.data)


# ── Pool Chats ──


def update_pool_chat_title(chat_id: str, title: str) -> None:
    supabase.table("pool_chats").update({"title": title}).eq("id", chat_id).execute()


def create_pool_chat(
    pool_id: str,
    created_by: str,
    title: str = "New Chat",
    is_shared: bool = False,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
) -> Dict[str, Any]:
    row = {
        "pool_id": pool_id,
        "created_by": created_by,
        "title": title,
        "is_shared": is_shared,
    }
    if model:
        row["model"] = model
    if temperature is not None:
        row["temperature"] = temperature
    result = supabase.table("pool_chats").insert(row).execute()
    return result.data[0]


def list_pool_chats(pool_id: str, user_id: str) -> List[Dict[str, Any]]:
    """List shared chats + user's own private chats for a pool."""
    # All shared chats
    shared = (
        supabase.table("pool_chats")
        .select("*")
        .eq("pool_id", pool_id)
        .eq("is_shared", True)
        .order("created_at", desc=True)
        .execute()
    )
    # User's private chats
    private = (
        supabase.table("pool_chats")
        .select("*")
        .eq("pool_id", pool_id)
        .eq("is_shared", False)
        .eq("created_by", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    all_chats = (shared.data or []) + (private.data or [])
    # Enrich with message count
    for chat in all_chats:
        msg_count = (
            supabase.table("pool_chat_messages")
            .select("id", count="exact")
            .eq("chat_id", chat["id"])
            .execute()
        )
        chat["message_count"] = len(msg_count.data) if msg_count.data else 0
    return all_chats


def get_pool_chat(chat_id: str) -> Optional[Dict[str, Any]]:
    """Get chat with its messages."""
    chat_result = supabase.table("pool_chats").select("*").eq("id", chat_id).execute()
    if not chat_result.data:
        return None
    chat = chat_result.data[0]

    # Load messages
    msg_result = (
        supabase.table("pool_chat_messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at")
        .execute()
    )
    chat["messages"] = msg_result.data or []

    # Enrich messages with username and map rag_sources → sources
    user_cache = {}
    for msg in chat["messages"]:
        uid = msg.get("user_id")
        if uid and uid not in user_cache:
            u = supabase.table("app_users").select("username").eq("id", uid).execute()
            user_cache[uid] = u.data[0]["username"] if u.data else "Unknown"
        if uid:
            msg["username"] = user_cache.get(uid, "Unknown")
        if msg.get("rag_sources"):
            msg["sources"] = msg["rag_sources"]

    return chat


def add_pool_chat_message(
    chat_id: str,
    role: str,
    content: str,
    user_id: Optional[str] = None,
    model: Optional[str] = None,
    rag_sources: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    row: Dict[str, Any] = {
        "chat_id": chat_id,
        "role": role,
        "content": content,
    }
    if user_id:
        row["user_id"] = user_id
    if model:
        row["model"] = model
    if rag_sources:
        row["rag_sources"] = rag_sources
    result = supabase.table("pool_chat_messages").insert(row).execute()
    return result.data[0]


def delete_pool_chat(chat_id: str) -> bool:
    result = supabase.table("pool_chats").delete().eq("id", chat_id).execute()
    return bool(result.data)
