-- Pre-bake for image-gen v2: widen `app_generated_images.source` CHECK constraint
-- to include the slash-command source values.
--
-- v1 keeps Pydantic tight (`Literal["studio"]`), so the v1 frontend cannot send
-- the wider values. The schema permissiveness is harmless until v2 re-enables
-- the `/bild` slash command paths in MessageInput / PoolChatArea.
--
-- This migration is idempotent (DROP IF EXISTS, then ADD with the standard
-- PostgreSQL auto-generated constraint name `<table>_<column>_check`).

ALTER TABLE app_generated_images
    DROP CONSTRAINT IF EXISTS app_generated_images_source_check;

ALTER TABLE app_generated_images
    ADD CONSTRAINT app_generated_images_source_check
    CHECK (source IN ('studio', 'chat_slash', 'pool_chat_slash'));
