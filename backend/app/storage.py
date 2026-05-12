import uuid
from typing import Any, Dict, List, Optional
from .database import supabase


def create_conversation(
    title: str = "New Conversation",
    user_id: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    assistant_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "title": title,
        "user_id": user_id,
    }
    if model is not None:
        payload["model"] = model
    if temperature is not None:
        payload["temperature"] = temperature
    if assistant_id is not None:
        payload["assistant_id"] = assistant_id

    result = supabase.table("chats").insert(payload).execute()
    row = result.data[0]
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "title": row["title"],
        "model": row.get("model"),
        "temperature": float(row["temperature"]) if row.get("temperature") is not None else None,
        "assistant_id": row.get("assistant_id"),
        "messages": [],
    }


def list_conversations(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    query = supabase.table("chats").select("id,created_at,title,user_id")
    if user_id:
        query = query.eq("user_id", user_id)

    result = query.execute()
    items: List[Dict[str, Any]] = []
    for row in result.data:
        msg_q = (
            supabase.table("chat_messages")
            .select("created_at", count="exact")
            .eq("chat_id", row["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        items.append(
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "title": row["title"],
                "message_count": msg_q.count or 0,
                "last_message_at": msg_q.data[0]["created_at"] if msg_q.data else None,
            }
        )
    items.sort(key=lambda c: c.get("last_message_at") or c.get("created_at") or "", reverse=True)
    return items


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    conv_result = supabase.table("chats").select("*").eq("id", conversation_id).execute()
    if not conv_result.data:
        return None

    conv = conv_result.data[0]
    msg_result = (
        supabase.table("chat_messages")
        .select("*")
        .eq("chat_id", conversation_id)
        .order("created_at")
        .execute()
    )

    messages: List[Dict[str, Any]] = []
    for msg in msg_result.data:
        messages.append({
            "role": msg["role"],
            "content": msg["content"],
            "model": msg.get("model"),
            "sources": msg.get("rag_sources") or None,
        })

    return {
        "id": conv["id"],
        "created_at": conv["created_at"],
        "title": conv["title"],
        "model": conv.get("model"),
        "temperature": float(conv["temperature"]) if conv.get("temperature") is not None else None,
        "assistant_id": conv.get("assistant_id"),
        "messages": messages,
    }


def add_user_message(conversation_id: str, content: str) -> None:
    supabase.table("chat_messages").insert(
        {"chat_id": conversation_id, "role": "user", "content": content}
    ).execute()


def add_assistant_message(
    conversation_id: str,
    content: str,
    model: Optional[str] = None,
    rag_sources: Optional[List[Dict[str, Any]]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "chat_id": conversation_id,
        "role": "assistant",
        "content": content,
    }
    if model:
        payload["model"] = model
    if rag_sources:
        payload["rag_sources"] = rag_sources

    supabase.table("chat_messages").insert(payload).execute()


def update_conversation(conversation_id: str, **fields: Any) -> Optional[Dict[str, Any]]:
    allowed = {"title", "model", "temperature"}
    update_data = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not update_data:
        return get_conversation(conversation_id)

    result = supabase.table("chats").update(update_data).eq("id", conversation_id).execute()
    if not result.data:
        return None
    return get_conversation(conversation_id)


def delete_conversation(conversation_id: str) -> bool:
    result = supabase.table("chats").delete().eq("id", conversation_id).execute()
    return len(result.data) > 0


def verify_conversation_owner(conversation_id: str, user_id: str) -> bool:
    result = supabase.table("chats").select("id").eq("id", conversation_id).eq("user_id", user_id).execute()
    return len(result.data) > 0
