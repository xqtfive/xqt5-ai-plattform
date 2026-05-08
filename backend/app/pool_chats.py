"""Aggregate pool chats across all pools the current user belongs to.

Used by the main chat list in the sidebar so users see personal +
pool chats together. Single read endpoint, no writes, no audit log
(matches existing pool read-endpoint convention).
"""

from typing import Any, Dict, List

from . import pools as pools_mod


def list_all_pool_chats_for_user(user_id: str) -> List[Dict[str, Any]]:
    """Return every pool chat the user has access to, decorated with pool metadata.

    Iterates over `list_pools_for_user(user_id)` and `list_pool_chats(pool_id, user_id)`.
    Membership is enforced implicitly: `list_pools_for_user` only returns pools the
    user is a member of, so each pool_id passed downstream is already authorised.
    `list_pool_chats` itself filters private chats to the caller's own.

    `message_count` is intentionally NOT enriched here. Computing it would require
    one query per chat (existing N+1 in `list_pool_chats`); for the sidebar list,
    counts are not needed. Drop them at this aggregation layer to keep the
    endpoint fast — counts remain available in the per-pool view.

    Result is sorted by `created_at` desc, suitable for chronological merging
    with the user's personal conversations on the frontend.
    """
    pools = pools_mod.list_pools_for_user(user_id)
    if not pools:
        return []

    out: List[Dict[str, Any]] = []
    for pool in pools:
        pool_id = pool["id"]
        chats = pools_mod.list_pool_chats(pool_id, user_id)
        for chat in chats:
            # Strip the count field that `list_pool_chats` enriches; we drop
            # it intentionally for performance. Anything else flows through.
            chat = {k: v for k, v in chat.items() if k != "message_count"}
            chat["pool_id"] = pool_id
            chat["pool_name"] = pool.get("name")
            chat["pool_icon"] = pool.get("icon")
            chat["pool_color"] = pool.get("color")
            chat["pool_role"] = pool.get("role")
            out.append(chat)

    out.sort(key=lambda c: c.get("created_at") or "", reverse=True)
    return out
