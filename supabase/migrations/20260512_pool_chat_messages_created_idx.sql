-- Composite index supporting the "newest message per chat" query used by
-- pools.list_pool_chats / pool_chats.list_all_pool_chats_for_user when sorting
-- chats by last_message_at. chat_messages already has the equivalent index
-- from 20260215_phase_a_model_temperature.sql.

CREATE INDEX IF NOT EXISTS idx_pool_chat_messages_chat_created
  ON pool_chat_messages(chat_id, created_at DESC);
