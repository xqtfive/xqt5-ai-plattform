import logging
from typing import Any, Dict, List, Optional

from .database import supabase

logger = logging.getLogger(__name__)

# Action constants
AUTH_LOGIN = "auth.login"
AUTH_LOGIN_FAILED = "auth.login_failed"
AUTH_REGISTER = "auth.register"

ADMIN_USER_ACTIVATE = "admin.user.activate"
ADMIN_USER_DEACTIVATE = "admin.user.deactivate"
ADMIN_USER_GRANT_ADMIN = "admin.user.grant_admin"
ADMIN_USER_REVOKE_ADMIN = "admin.user.revoke_admin"

ADMIN_MODEL_CREATE = "admin.model.create"
ADMIN_MODEL_UPDATE = "admin.model.update"
ADMIN_MODEL_DELETE = "admin.model.delete"

CHAT_CONVERSATION_CREATE = "chat.conversation.create"
CHAT_CONVERSATION_DELETE = "chat.conversation.delete"
CHAT_MESSAGE_SEND = "chat.message.send"

DOCUMENT_UPLOAD_DEDUP_SKIPPED = "document.upload.dedup_skipped"

IMAGE_GENERATE = "image.generate"
IMAGE_GENERATE_FAILED = "image.generate.failed"
IMAGE_GENERATE_MODERATION_BLOCKED = "image.generate.moderation_blocked"
IMAGE_DELETE = "image.delete"
ADMIN_IMAGE_STYLE_PRESET_CREATE = "admin.image_style_preset.create"
ADMIN_IMAGE_STYLE_PRESET_UPDATE = "admin.image_style_preset.update"
ADMIN_IMAGE_STYLE_PRESET_DELETE = "admin.image_style_preset.delete"
ADMIN_USER_LIMIT_UPDATE = "admin.user.limit_update"


def log_event(
    action: str,
    user_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Fire-and-forget audit log entry."""
    try:
        payload: Dict[str, Any] = {"action": action}
        if user_id:
            payload["user_id"] = user_id
        if target_type:
            payload["target_type"] = target_type
        if target_id:
            payload["target_id"] = target_id
        if metadata:
            payload["metadata"] = metadata
        if ip_address:
            payload["ip_address"] = ip_address

        supabase.table("app_audit_logs").insert(payload).execute()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


def list_audit_logs(
    limit: int = 100,
    offset: int = 0,
    action_filter: Optional[str] = None,
    user_id_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    query = supabase.table("app_audit_logs").select(
        "id,user_id,action,target_type,target_id,metadata,ip_address,created_at,"
        "app_users(username)"
    ).order("created_at", desc=True).range(offset, offset + limit - 1)

    if action_filter:
        query = query.eq("action", action_filter)
    if user_id_filter:
        query = query.eq("user_id", user_id_filter)

    result = query.execute()
    # Flatten the username from the join
    logs = []
    for row in (result.data or []):
        user_info = row.pop("app_users", None)
        row["username"] = user_info.get("username") if user_info else None
        logs.append(row)
    return logs
