-- Migration: Image generation feature
-- Idempotent: safe to re-run on a populated database.
-- NO DROP CONSTRAINT statements.

-- ── 1. app_generated_images ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_generated_images (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    prompt                  TEXT        NOT NULL CHECK (length(prompt) <= 2000),
    resolved_prompt         TEXT        NOT NULL,
    provider                TEXT        NOT NULL,
    model                   TEXT        NOT NULL,
    image_url               TEXT,
    storage_kind            TEXT        NOT NULL DEFAULT 'provider_url'
                                        CHECK (storage_kind IN ('provider_url', 'supabase_storage', 'data_uri')),
    provider_url_expires_at TIMESTAMPTZ,
    parameters_json         JSONB,
    cost_usd                DECIMAL(10,6) NOT NULL DEFAULT 0,
    status                  TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'succeeded', 'failed')),
    error_message           TEXT,
    source                  TEXT        NOT NULL CHECK (source IN ('studio')),
    chat_id                 UUID        REFERENCES chats(id) ON DELETE SET NULL,
    pool_chat_id            UUID        REFERENCES pool_chats(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_generated_images_user_created
    ON app_generated_images (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_generated_images_user_status_created
    ON app_generated_images (user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_app_generated_images_status
    ON app_generated_images (status);

REVOKE ALL ON app_generated_images FROM anon;

-- ── 2. app_image_style_presets ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_image_style_presets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type  TEXT        NOT NULL CHECK (scope_type IN ('global', 'team', 'user', 'pool')),
    scope_id    UUID,
    name        TEXT        NOT NULL,
    prefix      VARCHAR(1000) NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_by  UUID        REFERENCES app_users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_image_style_presets_scope_active
    ON app_image_style_presets (scope_type, scope_id)
    WHERE is_active = true;

REVOKE ALL ON app_image_style_presets FROM anon;

-- ── 3. app_user_limits ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_user_limits (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID        NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    daily_image_cost_limit_usd  DECIMAL(10,2)
                                CHECK (
                                    daily_image_cost_limit_usd >= 0
                                    AND daily_image_cost_limit_usd <= 1000
                                ),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON app_user_limits FROM anon;

-- ── 4. app_model_config — add model_type column ──────────────────────────────

ALTER TABLE app_model_config
    ADD COLUMN IF NOT EXISTS model_type TEXT NOT NULL DEFAULT 'chat'
        CHECK (model_type IN ('chat', 'image', 'embedding', 'tts', 'video'));

ALTER TABLE app_model_config
    ADD COLUMN IF NOT EXISTS pricing JSONB
        DEFAULT '{"type":"fixed","cost_per_image_usd":0.0}'::jsonb;

-- Backfill existing rows that arrived before this column existed
UPDATE app_model_config
    SET model_type = 'chat'
    WHERE model_type IS NULL;

-- Partial unique index: only one default per model_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_model_config_default_per_type
    ON app_model_config (model_type)
    WHERE is_default = true;

-- ── 5. chat_messages — generated_image_id FK ─────────────────────────────────

ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS generated_image_id UUID
        REFERENCES app_generated_images(id) ON DELETE SET NULL;

-- ── 6. pool_chat_messages — generated_image_id FK ────────────────────────────

ALTER TABLE pool_chat_messages
    ADD COLUMN IF NOT EXISTS generated_image_id UUID
        REFERENCES app_generated_images(id) ON DELETE SET NULL;

-- ── 7. app_settings — system default daily image cost cap ────────────────────

INSERT INTO app_settings (key, value)
    VALUES ('default_daily_image_cost_limit_usd', '5.0')
    ON CONFLICT DO NOTHING;
