# Umsetzungs-Dokument

## Zielarchitektur
1. Frontend-Service (React/Vite, statisch via Nginx)
2. Backend-Service (FastAPI/Uvicorn)
3. Supabase (Postgres) als zentrale Datenbank
4. Coolify als Orchestrierungs- und Deployment-Ebene

## Technische Entscheidungen
1. Trennung in zwei Container für unabhängige Deployments und Skalierung
2. Supabase als Managed Postgres für schnelle Time-to-Market
3. FastAPI wegen guter API-Performance und klarer Pydantic-Validierung
4. React/Vite wegen schneller Build- und Dev-Zyklen
5. Externe Kopplung zu `llm-council` nur per HTTP-API, keine Funktions- oder Codeübernahme

## Implementierte Artefakte

### MVP (Phase 0 — 2026-02-14)
1. Backend-Grundstruktur unter `backend/app`
2. Frontend-Grundstruktur unter `frontend/src`
3. Container-Builds: `backend/Dockerfile`, `frontend/Dockerfile`
4. Supabase-Migration: `supabase/migrations/20260214_initial_schema.sql`
5. Env-Vorlage: `.env.example`

### Phase A: Core Chat Enhancement (2026-02-15)
1. **LLM Provider Modul** (`backend/app/llm.py`):
   - Multi-Provider Support: OpenAI, Anthropic, Google Gemini, Mistral, X.AI, Azure OpenAI
   - Streaming (SSE) und Non-Streaming Calls via `httpx.AsyncClient`
   - Anthropic-Sonderbehandlung (anderes Request-Format)
   - Azure OpenAI Sonderbehandlung: eigene URL/Request/Call/Stream-Funktionen
   - GPT-5.x: kein Temperature-Parameter, `max_completion_tokens` statt `max_tokens`
   - Azure Auth via `api-key` Header, Deployment-Name Lookup aus `app_model_config`
   - `LLMError` Exception-Klasse für einheitliche Fehlerbehandlung
2. **Eigene Chat-Tabellen** (getrennt von llm-council):
   - `chats` (id, user_id, title, model, temperature, created_at)
   - `chat_messages` (id, chat_id, role, content, model, created_at)
   - Migration: `supabase/migrations/20260215_phase_a_model_temperature.sql`
3. **Backend Endpoints**:
   - `GET /api/models` — Verfügbare Modelle mit Availability-Status
   - `PATCH /api/conversations/{id}` — Conversation Settings updaten
   - `POST /api/conversations/{id}/message` — Erweitert: stream, model, temperature
   - SSE-Streaming mit Coolify-kompatiblen Headers (`X-Accel-Buffering: no`)
   - Auto-Benennung nach erster Nachricht (Background-Task, silent fail)
4. **Frontend Component-Architektur** (`frontend/src/components/`):
   - Sidebar, ChatArea, MessageBubble, MessageInput, ModelSelector, TemperatureSlider, Welcome
   - SSE-Stream-Parsing mit optimistischem Rendering
   - Markdown-Rendering für Assistant-Nachrichten (`react-markdown`)
   - Model-Dropdown und Temperature-Slider
5. **Config**: `DEFAULT_MODEL`, `DEFAULT_TEMPERATURE` in docker-compose.coolify.yml

## Datenbank-Schema-Übersicht

**KEINE shared Tabellen — jede Anwendung nutzt nur eigene Tabellen.**

| Tabelle | Zugehörigkeit | Beschreibung |
|---------|---------------|--------------|
| `app_users` | XQT5 AI Plattform | Eigene Benutzer mit is_admin Flag |
| `chats` | XQT5 AI Plattform | Chat-Konversationen mit model/temperature/assistant_id |
| `chat_messages` | XQT5 AI Plattform | Chat-Nachrichten (clean, ohne Pipeline-Felder) |
| `chat_token_usage` | XQT5 AI Plattform | Token-Verbrauch + Kosten pro Anfrage |
| `assistants` | XQT5 AI Plattform | KI-Assistenten mit System-Prompts |
| `prompt_templates` | XQT5 AI Plattform | Prompt-Templates mit Platzhaltern |
| `app_model_config` | XQT5 AI Plattform | Admin-verwaltete Modell-Liste (+ deployment_name für Azure) |
| `app_provider_keys` | XQT5 AI Plattform | Verschlüsselte Provider-API-Keys + Azure-Config |
| `app_audit_logs` | XQT5 AI Plattform | Audit-Log-Einträge |
| `app_documents` | XQT5 AI Plattform | Hochgeladene Dokumente (PDF/TXT/Bild) mit Status + pool_id |
| `app_document_chunks` | XQT5 AI Plattform | Dokument-Chunks mit Embeddings (vector(1536)) |
| `pool_pools` | XQT5 AI Plattform | Pool-Metadaten (name, description, icon, color, owner_id) |
| `pool_members` | XQT5 AI Plattform | Pool-Mitgliedschaften mit Rolle (viewer/editor/admin) |
| `pool_invite_links` | XQT5 AI Plattform | Share-Links mit Token, Rolle, max_uses, expires_at |
| `pool_chats` | XQT5 AI Plattform | Pool-Chats (shared + private via is_shared Flag) |
| `pool_chat_messages` | XQT5 AI Plattform | Pool-Chat-Nachrichten mit user_id für Attribution |
| `users` | llm-council | Pipeline-Benutzer (nicht anfassen!) |
| `conversations` | llm-council | Pipeline-Konversationen (stage1/2/3) |
| `messages` | llm-council | Pipeline-Nachrichten (stage1/2/3, metadata) |
| `token_usage` | llm-council | Token-Verbrauch pro Pipeline-Stage |
| `app_settings` | llm-council | Globale Einstellungen |
| `api_keys` | llm-council | API-Key-Verwaltung |
| `provider_api_keys` | llm-council | Verschlüsselte Provider-Keys |

## Coolify Setup-Schritte
1. Repo in Coolify verbinden
2. Backend-Service erstellen:
   - Build Context: `backend`, Dockerfile: `backend/Dockerfile`
   - Domain: `api.xqtfive.com`
   - Env: `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`, `CORS_ORIGINS`
   - Provider Keys: `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
   - Azure: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_API_VERSION` (default: 2025-04-01-preview)
   - Defaults: `DEFAULT_MODEL`, `DEFAULT_TEMPERATURE`
   - Rate Limiting: `RATE_LIMIT_STORAGE_URL` (Default: `memory://`, Prod: `redis://redis:6379`)
   - Proxy: `FORWARDED_ALLOW_IPS` (Default: `*`)
3. Frontend-Service erstellen:
   - Build Context: `frontend`, Dockerfile: `frontend/Dockerfile`
   - Domain: `ai-hub.xqtfive.com`
   - Build-Arg: `VITE_API_BASE=https://api.xqtfive.com`
4. `CORS_ORIGINS` im Backend auf Frontend-Domain setzen
5. Supabase-Migrationen in numerischer Reihenfolge ausführen (alle Dateien unter `supabase/migrations/`)
   - **Wichtig**: pgvector Extension muss vor der RAG-Migration aktiviert sein (Dashboard → Database → Extensions → vector)

### Phase B: User & Kosten-Management (2026-02-15)
1. **Eigene User-Tabelle** (`app_users`):
   - Komplett getrennt von llm-council's `users` Tabelle
   - Migration: `supabase/migrations/20260215_phase_b_own_users_table.sql`
2. **Auth-Modul** (`backend/app/auth.py`):
   - bcrypt Passwort-Hashing, JWT Access-Token (30min) + Refresh-Token (7d)
   - FastAPI Dependencies: `get_current_user`, `get_current_admin`
   - Register mit Username/Email Duplikat-Check
3. **Token-Tracking** (`backend/app/token_tracking.py`):
   - Eigene `chat_token_usage` Tabelle (nicht llm-council's `token_usage`)
   - Kosten-Schätzung pro Modell (COST_PER_1M_TOKENS)
   - Usage-Erfassung nach jedem LLM-Call (streaming + non-streaming)
   - Migration: `supabase/migrations/20260215_phase_b_auth_token_tracking.sql`
4. **Geschützte Endpoints**:
   - Alle `/api/conversations/*` mit `Depends(get_current_user)` + Ownership-Check
   - Auth-Endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/me`
   - Usage-Endpoint: `/api/usage`
5. **LLM Usage-Erfassung** (`backend/app/llm.py`):
   - Stream-Generatoren liefern Usage-Dict als letztes Element
   - OpenAI: `stream_options: {"include_usage": true}`
   - Anthropic: `message_start` + `message_delta` Events
   - Google: `usageMetadata` aus letztem Chunk
6. **Frontend**:
   - Login/Register-Screen (`LoginScreen.jsx`)
   - Token-Management in `api.js` (localStorage, auto-refresh bei 401)
   - Usage-Widget in Sidebar (`UsageWidget.jsx`)
   - Auth-State in `App.jsx` (Loading → Login → App)

### Phase C Schritt 1: KI-Assistenten + Prompt-Templates (2026-02-16)
1. **Datenbank-Migration** (`supabase/migrations/20260216_phase_c_assistants_templates.sql`):
   - `assistants` Tabelle (user_id, name, description, system_prompt, model, temperature, is_global, icon)
   - `prompt_templates` Tabelle (user_id, name, description, content, category, is_global)
   - `chats.assistant_id` FK auf `assistants`
2. **Backend CRUD-Module**:
   - `backend/app/assistants.py`: Erstellen, Auflisten (eigene + globale), Lesen, Updaten, Löschen
   - `backend/app/templates.py`: Analog für Prompt-Templates
   - Ownership-/Admin-Checks für globale Einträge
3. **API-Endpoints**:
   - `GET/POST /api/assistants`, `GET/PATCH/DELETE /api/assistants/{id}`
   - `GET/POST /api/templates`, `GET/PATCH/DELETE /api/templates/{id}`
   - `is_global=true` nur für Admins
4. **System-Prompt Injection**:
   - Wenn Chat `assistant_id` hat → Assistant laden → `system_prompt` als erste Message in LLM-Kontext
   - Model/Temperature-Override vom Assistant (nachrangig zu Message- und Conversation-Level)
   - `CreateConversationRequest` erweitert um `assistant_id`
5. **Frontend-Komponenten**:
   - `AssistantSelector.jsx`: Icon-Grid in Sidebar, Klick erstellt neuen Chat mit Assistent
   - `AssistantManager.jsx`: Modal für CRUD (Name, Icon, Beschreibung, System-Prompt, Model/Temp)
   - `TemplateManager.jsx`: Modal für CRUD (Name, Beschreibung, Kategorie, Inhalt)
   - `TemplatePicker.jsx`: Dropdown in MessageInput, fügt Template-Text in Textarea ein
6. **Geänderte Dateien**:
   - `App.jsx`: Assistants/Templates State, CRUD-Handler, Manager-Modals
   - `Sidebar.jsx`: AssistantSelector, Buttons für Assistenten/Templates verwalten
   - `ChatArea.jsx`: Templates-Prop an MessageInput durchreichen
   - `MessageInput.jsx`: TemplatePicker neben Model-Selector
   - `api.js`: 8 neue API-Methoden (CRUD für Assistenten + Templates)
   - `storage.py`: `assistant_id` in create/get_conversation
   - `models.py`: 4 neue Request-Models

### Phase D: Admin-Dashboard + Audit-Logs (2026-02-16)
1. **Datenbank-Migration** (`supabase/migrations/20260216_phase_d_admin_audit.sql`):
   - `app_model_config` Tabelle (model_id, provider, display_name, is_enabled, is_default, sort_order)
   - Seed mit 9 aktuellen Modellen aus `llm.py`
   - `app_audit_logs` Tabelle (user_id, action, target_type, target_id, metadata, ip_address)
   - Indizes auf user_id, action, created_at, (target_type, target_id)
2. **Admin-Modul** (`backend/app/admin.py`):
   - `list_users()`, `update_user()` (Active/Admin-Toggle)
   - `get_global_usage_summary()`, `get_usage_per_user()` (Token-Kosten Aggregation)
   - `get_system_stats()` (Zähler: Users, Chats, Messages, Assistenten, Templates)
   - `list_model_configs()`, `create_model_config()`, `update_model_config()`, `delete_model_config()`
   - Default-Modell-Logik: Setzen eines neuen Defaults setzt alle anderen zurück
3. **Audit-Modul** (`backend/app/audit.py`):
   - Action-Konstanten für Auth, Admin, Chat
   - `log_event()` — fire-and-forget Audit-Logging
   - `list_audit_logs()` — paginierte Abfrage mit Filtern, JOIN auf app_users für Username
4. **Admin API-Endpoints** (alle `Depends(get_current_admin)`):
   - `GET/PATCH /api/admin/users/{id}` — User-Verwaltung (Selbstschutz: kein Self-Deactivate)
   - `GET /api/admin/usage` — Globale + Per-User Kosten
   - `GET /api/admin/stats` — System-Statistiken
   - `GET/POST/PATCH/DELETE /api/admin/models` — Modell-Konfigurationen
   - `GET /api/admin/audit-logs` — Paginierte Audit-Logs mit Filtern
5. **LLM-Modul** (`backend/app/llm.py`):
   - `get_available_models()` liest aus DB (`app_model_config`), Fallback auf hardcoded Liste
6. **Audit-Events** in bestehende Endpoints injiziert:
   - Auth: login (success + failed), register
   - Admin: user toggles, model config CRUD
   - Chat: conversation create/delete, message send (nur Metadaten, kein Inhalt)
7. **Frontend**:
   - `AdminDashboard.jsx`: Tab-basierte Navigation (Benutzer, Kosten, Statistiken, Modelle, Audit-Logs, Provider)
   - Benutzer-Tab: Tabelle mit Active/Admin Toggle-Switches
   - Kosten-Tab: Globale Totals (Cards) + Per-User-Tabelle sortiert nach Kosten
   - Statistiken-Tab: Card-Grid (6 Metriken)
   - Modelle-Tab: Enable/Disable Toggle, Default-Radio, Neues Modell hinzufügen
   - Audit-Logs-Tab: Paginierte Tabelle mit Aktions-Filter, "Mehr laden"-Button
   - `Sidebar.jsx`: Admin-Button (nur für Admins sichtbar)
   - `App.jsx`: showAdmin State, bedingtes Rendering (AdminDashboard statt ChatArea)
   - `api.js`: 9 neue Admin-API-Methoden
   - `styles.css`: Admin-Dashboard, Tabs, Cards, Table, Toggle-Switches
8. **Pydantic-Models** (`backend/app/models.py`):
   - `UpdateUserRequest`, `CreateModelConfigRequest`, `UpdateModelConfigRequest`

### Phase D Erweiterung: Provider-Key-Verwaltung + Azure OpenAI (2026-02-16)
1. **Datenbank-Migrationen**:
   - `supabase/migrations/20260216_phase_d_provider_keys.sql`: `app_provider_keys` Tabelle (provider, api_key_encrypted, extra_config, created_at, updated_at)
   - `supabase/migrations/20260216_phase_d_azure_provider.sql`: `deployment_name` Spalte in `app_model_config`
2. **Encryption-Modul** (`backend/app/encryption.py`):
   - Fernet-Verschlüsselung mit von `JWT_SECRET` abgeleitetem Key (PBKDF2)
   - `encrypt_value()` / `decrypt_value()` Funktionen
3. **Provider-Modul** (`backend/app/providers.py`):
   - `get_provider_key()`: DB-Lookup mit Fallback auf Env-Variable
   - `set_provider_key()`: Verschlüsseltes Speichern in DB
   - `delete_provider_key()`: Entfernen aus DB
   - `get_provider_config()`: Gesamte Provider-Konfiguration (Key + Extra-Config)
   - `test_provider_key()`: Live-Test gegen Provider-API
4. **Admin API-Endpoints** (alle `Depends(get_current_admin)`):
   - `GET /api/admin/providers` — Alle Provider mit Key-Status (masked)
   - `PUT /api/admin/providers/{provider}/key` — Key speichern/aktualisieren
   - `DELETE /api/admin/providers/{provider}/key` — Key löschen
   - `POST /api/admin/providers/{provider}/test` — Provider-Verbindung testen
5. **LLM-Modul Azure-Erweiterungen** (`backend/app/llm.py`):
   - `_azure_url()`: Endpoint-URL-Konstruktion mit Deployment-Name
   - `_azure_headers()`: `api-key` Header statt Bearer Token
   - `_azure_request_body()`: GPT-5.x Handling (kein Temperature, `max_completion_tokens`)
   - `_call_azure()` / `_stream_azure()`: Eigene Call/Stream-Funktionen
   - Auto-Strip von Pfad-Komponenten aus Azure Endpoint-URL
6. **Config** (`backend/app/config.py`):
   - Neue Env-Vars: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_API_VERSION`
7. **Frontend**:
   - Provider-Keys Tab in `AdminDashboard.jsx` mit Save/Delete/Test pro Provider
   - Azure-spezifische Felder (Endpoint-URL, API-Version) im Provider-Tab
   - Deployment-Name Feld in Modell-Konfiguration
   - `api.js`: 4 neue Admin-API-Methoden (GET/PUT/DELETE/POST Provider)

### Phase C Schritt 2: File Upload + RAG-Pipeline (2026-02-16)
1. **Datenbank-Migration** (`supabase/migrations/20260216_phase_c_rag.sql`):
   - `CREATE EXTENSION IF NOT EXISTS vector` (pgvector)
   - `app_documents` Tabelle (user_id, chat_id nullable, filename, file_type, file_size_bytes, extracted_text, chunk_count, status, error_message)
   - `app_document_chunks` Tabelle (document_id, chunk_index, content, token_count, embedding vector(1536))
   - HNSW-Index auf embedding (vector_cosine_ops)
   - RPC `match_document_chunks()`: Scope-basierte Similarity-Suche (Conversation, Pool oder global)
2. **Documents-Modul** (`backend/app/documents.py`):
   - `extract_text()` / `extract_text_and_assets()` (async): PDF/Bild via Mistral OCR API, TXT via UTF-8
   - `_ocr_pdf_mistral_with_assets()`: Sendet PDF als base64 data-URI an Mistral OCR API (`mistral-ocr-latest`), gibt Text + OCR-Assets zurück
   - `_ocr_image_mistral()`: Verarbeitet Bild-Uploads (`PNG/JPG/JPEG/WEBP`) über Mistral OCR API
   - Mistral API-Key via `providers.get_api_key("mistral")` (DB mit Env-Fallback)
   - Keine zusätzlichen System-Pakete nötig (kein Tesseract/Poppler)
   - CRUD: `create_document()`, `update_document_status()`, `list_documents()`, `get_document()`, `delete_document()`
   - `has_ready_documents()`: Quick-Check für RAG-Injection
3. **RAG-Modul** (`backend/app/rag.py`):
   - `chunk_text()`: Paragraph-aware Splitting mit konfigurierbarer chunk_size/overlap
   - `generate_embeddings()`: OpenAI API via httpx, nutzt `providers.get_api_key("openai")`
   - `process_document()`: Chunk + Embed + Store, Token-Usage-Tracking
   - `search_similar_chunks()`: Embedding-Generierung + Supabase RPC
   - `build_rag_context()`: Formatierter Context-String mit Source-Labels
4. **Config** (`backend/app/config.py`): 7 neue Variablen (EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, CHUNK_SIZE, CHUNK_OVERLAP, RAG_TOP_K, RAG_SIMILARITY_THRESHOLD, MAX_UPLOAD_SIZE_MB)
5. **Token-Tracking** (`backend/app/token_tracking.py`): Embedding-Kosten (text-embedding-3-small/large)
6. **API-Endpoints** (`backend/app/main.py`):
   - `POST /api/documents/upload` — UploadFile + Form(chat_id), unterstützt PDF/TXT/Bild, extrahiert Text, erzeugt Chunks+Embeddings
   - `GET /api/documents?chat_id=&scope=` — Dokument-Liste
   - `DELETE /api/documents/{id}` — Löschen (CASCADE auf Chunks)
   - `POST /api/rag/search` — Debug/Test-Endpoint für Similarity-Suche
7. **RAG-Injection** in `send_message()`:
   - Prüft ob User ready Docs hat, sucht ähnliche Chunks, injiziert als System-Message-Kontext
   - `rag_sources` Liste wird in Stream-Done-Event und Non-Streaming-Response mitgegeben
8. **Dependencies**: OCR läuft über Mistral API; `pypdf` ist aktuell noch als Legacy-Dependency in `pyproject.toml` enthalten
9. **Frontend-Komponenten**:
   - `FileUpload.jsx`: Clip-Icon Button mit Hidden File-Input (PDF/TXT/PNG/JPG/JPEG/WEBP)
   - `DocumentList.jsx`: Dokument-Tags (Icon + Name + Chunks + Status + Delete)
   - `SourceDisplay.jsx`: "Sources:" Label mit Filename-Tags unter Assistant-Nachrichten
10. **Frontend-Änderungen**:
    - `api.js`: `uploadDocument()`, `listDocuments()`, `deleteDocument()`, sources in `onDone`
    - `MessageInput.jsx`: FileUpload-Button + DocumentList
    - `MessageBubble.jsx`: SourceDisplay unter Assistant-Nachrichten
    - `ChatArea.jsx`: Neue Props (documents, onUpload, onDeleteDocument)
    - `App.jsx`: chatDocuments State, loadDocuments Effect, Upload/Delete Handlers, Sources an Messages
    - `styles.css`: file-upload, document-list, rag-sources Styles

### Phase D Erweiterung 2: Security Hardening (2026-02-17)
1. **is_active Enforcement** auf Access- UND Refresh-Token:
   - `get_current_user()` prüft `is_active` bei jedem Request
   - Refresh-Endpoint prüft `is_active` vor Token-Erneuerung
   - Fehlermeldung: "Account is inactive"
2. **Token Version Revocation** (`token_version` Spalte in `app_users`):
   - Migration: `supabase/migrations/20260217_phase_d_token_version_revocation.sql`
   - `bump_token_version()` in `auth.py` erhöht die Version → alle bestehenden Tokens ungültig
   - Access- und Refresh-Token enthalten `token_version` Claim, wird bei Validierung geprüft
   - Wird automatisch bei User-Deaktivierung (`PATCH /api/admin/users/{id}` mit `is_active=false`) aufgerufen
3. **slowapi Rate Limiting** (7 Endpoints):
   - `POST /api/auth/register` — 5/minute
   - `POST /api/auth/login` — 10/minute
   - `POST /api/auth/refresh` — 30/minute
   - `POST /api/conversations/{id}/message` — 60/minute
   - `POST /api/documents/upload` — 20/minute
   - `POST /api/rag/search` — 60/minute
   - `POST /api/admin/providers/{provider}/test` — 20/minute
   - Key-Funktion: per-User (`user:<uuid>`) bei gültigem Bearer-Token, Fallback `ip:<address>`
4. **Redis-Backend** via `RATE_LIMIT_STORAGE_URL` Env-Variable:
   - Default: `memory://` (In-Process, kein Redis nötig)
   - Produktion: `redis://redis:6379` für persistente Limits über Restarts
5. **Proxy-Headers** für korrekte Client-IP hinter Reverse-Proxy:
   - Uvicorn CMD: `--proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}"`
   - Env-Variable `FORWARDED_ALLOW_IPS` (Default: `*`)
6. **Dependencies**: `slowapi>=0.1.9`, `redis>=5.0.0` in pyproject.toml + Dockerfile

### Phase D Erweiterung 3: Admin User Löschen + Default-Modell Fix (2026-02-17)
1. **Admin User Soft-Delete** (`DELETE /api/admin/users/{user_id}`):
   - Setzt `is_active=false` + `bump_token_version()` zur Session-Invalidierung
   - Selbstschutz: Admin kann sich nicht selbst löschen (HTTP 400)
   - Audit-Log: `ADMIN_USER_DEACTIVATE`
2. **Frontend UsersTab Erweiterungen** (`AdminDashboard.jsx`):
   - `showInactive` State (default `false`) mit Checkbox "Deaktivierte anzeigen"
   - Inaktive User standardmäßig ausgeblendet, mit Toggle einblendbar
   - "Löschen"-Button pro Zeile (rot, disabled für eigenen User, `confirm()` Dialog)
   - Deaktivierte Zeilen: CSS-Klasse `.user-inactive` für graue Darstellung
   - `currentUser` Prop von `App.jsx` durchgereicht für Selbstschutz
3. **Default-Modell Bugfix** (`llm.py` + `App.jsx` + `admin.py` + `main.py`):
   - `/api/models` gibt jetzt `is_default` Flag aus `app_model_config` zurück (auch im Fallback-Pfad)
   - Frontend wählt beim Laden das `is_default && available` Modell statt hardcoded Fallback
   - Hardcoded `DEFAULT_MODEL` in `FALLBACK_MODEL` umbenannt (nur noch als letzter Fallback)
   - Neuer State `defaultModelId` im Frontend: wird bei Conversation-Wechsel als Fallback genutzt (`activeConversation.model || defaultModelId`)
   - Backend: Neue Funktion `admin.get_default_model_id()` liest `is_default && is_enabled` aus DB
   - Backend: `send_message()` Fallback-Kette erweitert: `payload.model → conversation.model → assistant.model → admin.get_default_model_id() → DEFAULT_MODEL`
4. **API** (`api.js`): Neue Methode `adminDeleteUser(userId)` → `DELETE /api/admin/users/${userId}`

### Phase E: Pools — Geteilte Dokumentensammlungen (umgesetzt 2026-02-18)

#### Datenbank
1. **Migration** (`supabase/migrations/20260218_pools.sql`):
   - `pool_pools` Tabelle (id, name, description, icon, color, owner_id → app_users)
   - `pool_members` Tabelle (pool_id, user_id, role CHECK viewer/editor/admin, UNIQUE pool_id+user_id)
   - `pool_invite_links` Tabelle (pool_id, token VARCHAR(64) UNIQUE, role, max_uses, use_count, expires_at, is_active)
   - `pool_chats` Tabelle (pool_id, title, is_shared, created_by, model, temperature)
   - `pool_chat_messages` Tabelle (chat_id, user_id, role, content, model)
   - `app_documents` erweitert: `pool_id UUID REFERENCES pool_pools(id) ON DELETE CASCADE`
   - `match_document_chunks()` RPC erweitert: neuer Parameter `match_pool_id UUID DEFAULT NULL` — wenn gesetzt, werden nur Pool-Dokumente durchsucht

#### Backend
2. **Pools-Modul** (`backend/app/pools.py`):
   - Pool CRUD: `create_pool()`, `list_pools_for_user()`, `get_pool()`, `update_pool()`, `delete_pool()`
   - Auth: `get_user_pool_role()` → owner/admin/editor/viewer/None, `require_pool_role()` → HTTP 403
   - Members: `add_member()`, `list_members()`, `update_member_role()`, `remove_member()`, `find_user_by_username()`
   - Invites: `create_invite_link()`, `get_invite_by_token()`, `use_invite_link()`, `list_invite_links()`, `revoke_invite_link()`
   - Pool Docs: `list_pool_documents()`, `get_pool_document_preview()`, `has_ready_pool_documents()`
   - Pool Chats: `create_pool_chat()`, `list_pool_chats()`, `get_pool_chat()`, `add_pool_chat_message()`, `delete_pool_chat()`
3. **Bestehende Module erweitert**:
   - `documents.py`: `create_document()` bekommt `pool_id` Parameter
   - `rag.py`: `search_similar_chunks()` bekommt `pool_id` Parameter, wird an RPC weitergegeben
   - `models.py`: 8 neue Pydantic-Modelle (CreatePoolRequest, AddPoolMemberRequest, CreateInviteLinkRequest, JoinPoolRequest, CreatePoolChatRequest, SendPoolMessageRequest, etc.)
4. **API-Endpunkte** (`main.py`):
   - Pool CRUD: POST/GET/PATCH/DELETE `/api/pools`
   - Members: GET/POST/PATCH/DELETE `/api/pools/{pool_id}/members`
   - Invites: GET/POST/DELETE `/api/pools/{pool_id}/invites`, POST `/api/pools/join`
   - Documents: GET/DELETE `/api/pools/{pool_id}/documents` + POST `/api/pools/{pool_id}/documents` (Datei-Upload) + POST `/api/pools/{pool_id}/documents/text` (Text-Paste) + GET `/api/pools/{pool_id}/documents/{document_id}/preview`
   - Chats: GET/POST/DELETE `/api/pools/{pool_id}/chats`, POST `/api/pools/{pool_id}/chats/{chat_id}/message`

#### Frontend
5. **API-Client** (`api.js`): Pool-Endpunkte inkl. Dokumentvorschau (`getPoolDocumentPreview`)
6. **Neue Komponenten** (8 Dateien):
   - `PoolList.jsx` — Sidebar-Sektion mit Pool-Liste
   - `CreatePoolDialog.jsx` — Modal: Pool erstellen
   - `PoolDetail.jsx` — Hauptansicht mit Tabs (Dokumente/Chats/Mitglieder)
   - `PoolDocuments.jsx` — Dokumentenliste + Upload + Vorschau-Modal
   - `PoolChatList.jsx` — Shared + private Chats
   - `PoolChatArea.jsx` — Chat-Ansicht (nutzt bestehende MessageBubble/MessageInput/SourceDisplay)
   - `PoolMembers.jsx` — Mitgliederliste mit Rollen-Management
   - `PoolShareDialog.jsx` — Invite-Link-Dialog
7. **App.jsx Änderungen**: Neuer State (pools, activePool, activePoolView, activePoolChat), mutually exclusive mit activeConversation
8. **Sidebar.jsx**: PoolList-Integration
9. **Phase 2 (2026-05-07)**: Pool-Chats erscheinen jetzt ZUSÄTZLICH in der Hauptliste der Chats. Backend-Aggregator `pool_chats.py::list_all_pool_chats_for_user` + Endpunkt `GET /api/pools/me/chats`. Frontend `App.jsx` mergt persönliche Konversationen + Pool-Chats per `useMemo`, sortiert nach `created_at` desc. `Sidebar.jsx` rendert Pool-Items mit `panel-item--pool` (farbiger linker Rahmen) + Sub-Zeile mit Pool-Tag. Klick auf Pool-Chat setzt neuen `activePoolChatId`-State und übergibt ihn als `initialChatId`-Prop an `PoolDetail`, das ihn per `useRef`-gateter Effect einmalig konsumiert. Komplette Beschreibung siehe `IMPLEMENTIERT.md` Abschnitt „Pool-Chats in Hauptliste der Chats".

#### Phase E Update (2026-02-21): Pool Text Paste Input
9. **Neuer Endpoint** (`main.py`):
   - `POST /api/pools/{pool_id}/documents/text` — Text direkt als RAG-Dokument einfügen
   - Pydantic-Model: `UploadPoolTextRequest` (title: str, content: str)
   - Mindestrolle: `editor`; Rate Limit: 20/minute
   - Text wird intern als TXT-Datei verpackt und durch die bestehende `process_document()`-Pipeline geführt (Chunking + Embedding)
10. **Frontend** (`PoolDocuments.jsx`):
    - Neues "Text einfügen"-Tab neben dem Datei-Upload
    - Textarea für Titel und Inhalt, Submit über denselben API-Client wie Datei-Upload

#### Phase E Update (2026-02-19): Dokumentvorschau im Pool
11. **Neuer Endpoint** (`main.py`):
    - `GET /api/pools/{pool_id}/documents/{document_id}/preview`
    - Zugriff für alle Pool-Mitglieder (ab Rolle `viewer`)
12. **Preview-Logik** (`pools.py`):
    - Liefert `text_preview`, `text_length`, `truncated` für Dokumente
    - Liefert bei Bild-Dokumenten optional `image_data_url` aus `app_document_assets`
13. **Frontend-UX** (`PoolDocuments.jsx` + `styles.css`):
    - Vorschau-Button pro Dokument
    - Modal mit Textvorschau (gekürzt) und optionaler Bildansicht

#### Design-Entscheidungen
- `app_documents` wird wiederverwendet (statt eigener pool_documents), weil `app_document_chunks` per FK darauf verweist — hält Embedding-Pipeline unverändert
- `pool_chats`/`pool_chat_messages` sind separate Tabellen (nicht `chats`/`chat_messages`), weil Pool-Chats Multi-User-Zugriff brauchen
- Owner ist NICHT in `pool_members` — Ownership implizit über `pool_pools.owner_id`

### Phase RAGPools: RAG-Qualität für Conversations + Pools (2026-02-19)

#### Migrations
- `supabase/migrations/20260219_phase_f_multimodal_assets.sql` — `app_document_assets` Tabelle für Bild-RAG
- `supabase/migrations/20260220_runtime_rag_settings.sql` — Admin-konfigurierbare RAG-Einstellungen (Cohere Reranking)
- `supabase/migrations/20260221_rag_scoped_search.sql` — Scope-isolierte `match_document_chunks`/`match_document_assets`: conversation-only, pool-only, global-only (kein `OR d.chat_id IS NULL` mehr)
- `supabase/migrations/20260219_drop_old_function_overloads.sql` — Droppt alte 5-Parameter-Versionen der RPCs (behebt PGRST203)

#### Backend `rag.py`
- **`_rpc_chunks()`** / **`_rpc_assets()`**: Wrapper die pre-computed Embeddings wiederverwenden; Parameter nur inkludiert wenn `is not None`
- **`_search_chunks_hybrid()`** (ehem. `_search_chunks_two_phase`): Phase 1 Vektor (Conversation), Phase 2 Keyword ILIKE-Supplement
- **`_extract_query_keywords()`**: Stopwort-Filterung (DE+EN), min. 4 Zeichen, max. 3 Keywords
- **`_keyword_supplement_chunks()`**: Scope-aware ILIKE-Suche in `app_document_chunks`, enriched mit filename
- **`retrieve_chunks_with_strategy()`**: Conversations nutzen `top_k=50, threshold=0.0` (alle Chunks, kein Filter), Pools nutzen threshold-gefilterte Pläne; ohne Cohere werden alle Chunks in Dokumentreihenfolge zurückgegeben
- **`_apply_optional_rerank()`**: Ohne Cohere → Dokumentreihenfolge (`document_id, chunk_index`), alle Chunks; mit Cohere → `rerank_candidates=50` (Default erhöht von 20)
- **Cohere Reranking** (`_cohere_rerank()`): Optional via Admin-konfigurierbares `rerank_enabled`, `rerank_model`, `rerank_candidates`, `rerank_top_n`

#### Backend `main.py`
- RAG-Injection für `send_message` und `send_pool_message` in separate `try/except`-Blöcke aufgeteilt: Vector-Suche, Context-Injection, Text-Fallback sind unabhängig voneinander
- `exc_info=True` bei allen RAG-Exception-Logs für vollständige Stack-Traces
- **Admin RAG-Settings Endpoints** (beide `Depends(get_current_admin)`):
  - `GET /api/admin/rag-settings` — Liest aktuelle RAG-Konfiguration aus `app_rag_settings` (Cohere-Keys: `rerank_enabled`, `rerank_model`, `rerank_candidates`, `rerank_top_n`)
  - `PATCH /api/admin/rag-settings` — Aktualisiert RAG-Einstellungen; Pydantic-Model: `UpdateRagSettingsRequest`
  - Über das Admin-Dashboard (Provider-Tab) verwaltbar; ermöglicht Cohere Reranking ohne Neudeployment

#### Design-Entscheidungen
- **Globale Dokumente weiterhin API-seitig vorhanden**: Scope `chat_id IS NULL` wird weiterhin unterstützt (z. B. in Dokumentlisten/Fallback-Pfaden); Haupt-UI-Fluss bleibt chat- und pool-zentriert
- **Conversations: Wide-Net-Retrieval**: Statt threshold-Filterung alle verfügbaren Chunks abrufen und in Dokumentreihenfolge sortieren; relevanter für Einzeldokument-Conversations
- **Hybrid Search**: ILIKE-Supplement garantiert dass Kapitel mit spezifischen Begriffen auch bei niedrigem Vektor-Score im Kandidatenset landen (→ in RAGplus durch BM25+RRF ersetzt)

### Phase RAGplus: Verbessertes Chunking + BM25 + Re-Chunk + UX + Zitatmodus + Embedding-Provider + Auto-Summary (2026-02-22)

#### Verbessertes Chunking-System (Ansatz A+B)
1. **Markdown-Section-aware Chunking** (`rag.py`): `chunk_text()` erkennt Markdown-Überschriften und respektiert Sektionsgrenzen. Jeder Chunk bekommt einen Breadcrumb-Header (`## Kapitel > ### Abschnitt`) als Kontext-Anker, damit Retrieval-Treffer ohne umliegenden Text verständlich sind.
2. **Token-basierte Chunk-Größe**: Chunk-Größe und Overlap in Tokens (tiktoken, cl100k_base Encoder) statt Zeichen.
   - `CHUNK_SIZE`: 512 Tokens (war 1500 Zeichen)
   - `CHUNK_OVERLAP`: 50 Tokens (war 200 Zeichen)
   - Kommentar in `config.py`: "CHUNK_SIZE und CHUNK_OVERLAP in TOKENS seit RAGplus"
3. **Neue Hilfsfunktionen** in `rag.py`: `_HEADING_RE`, `_BULLET_RE`, `_SENT_SPLIT_RE`, `_get_encoder()`, `_tok()`, `_breadcrumb()`, `_split_into_units()`, `_overlap_tail()`
4. **Neue Dependency**: `tiktoken>=0.7.0` in `pyproject.toml` und `Dockerfile`

#### Admin Re-Chunk Feature
5. **Backend** (`main.py`):
   - `POST /api/admin/rechunk-documents` — startet Re-Chunking aller Dokumente als FastAPI `BackgroundTask`
   - `GET /api/admin/rechunk-status` — liefert Status (`idle`/`running`/`done`/`error`) + Progress (`done_count`/`total_count`)
   - Globaler Dict `_rechunk_status` in `main.py` für thread-safe Statustracking
   - `rechunk_all_documents(progress_callback)` in `rag.py` — löscht alte Chunks, rechunked + embeddet alle Dokumente neu
6. **Frontend** (`AdminDashboard.jsx`):
   - "Dokumente neu chunken"-Button im Retrieval-Tab
   - Live-Fortschrittsanzeige via 1s-Polling — `rechunkIntervalRef = useRef(null)` (kein useState, kein Re-Render-Cleanup-Bug)
   - Status-Anzeige: "Läuft: X / Y Dokumente verarbeitet"
7. **API** (`api.js`): `adminRechunkDocuments()`, `adminGetRechunkStatus()`

#### BM25 via PostgreSQL FTS (Ersetzt ILIKE Keyword Supplement)
8. **Migration** (`supabase/migrations/20260222_bm25_fts.sql`):
   - GENERATED ALWAYS STORED `content_fts tsvector` Spalte in `app_document_chunks`
   - GIN-Index `idx_doc_chunks_content_fts`
   - `DROP FUNCTION IF EXISTS keyword_search_chunks(text, uuid, int, uuid, uuid)` (PGRST203-Prävention)
   - RPC `keyword_search_chunks()`: `websearch_to_tsquery('german', ...)`, `ts_rank_cd(content_fts, query, 32)`, scope-isoliert
9. **`rag.py` Änderungen**:
   - **Entfernt**: `_extract_query_keywords()`, `_keyword_supplement_chunks()`, `_GERMAN_STOPWORDS`
   - **Neu**: `_bm25_search_chunks()` — Wrapper für `keyword_search_chunks` RPC
   - **Neu**: `_reciprocal_rank_fusion()` — RRF (k=60) merged Vector- und BM25-Resultate nach Rank (nicht Score)
   - **Aktualisiert**: `_search_chunks_hybrid()` und `retrieve_chunks_with_strategy()` verwenden BM25+RRF

#### UX-Verbesserungen
10. **Sidebar 50:50 Split mit Drag-to-Resize** (`Sidebar.jsx` + `styles.css`):
    - Pools- und Conversations-Sektion teilen verfügbaren Sidebar-Platz 50:50 (Standardwert, einstellbar 15-80%)
    - `sidebar-panels` als Flex-Container (flex:1) mit zwei Panels + `sidebar-drag-divider`
    - Drag-Handling via globalen `mousemove`/`mouseup` Listenern + `useRef` für Drag-State (kein Re-Render-Overhead)
    - Beide Panels scrollen unabhängig (`overflow-y: auto`)
    - `.pool-list-section` border-bottom entfernt — Drag-Divider übernimmt visuelle Trennung
11. **Upload-Fortschrittsanzeige** (`FileUpload.jsx`, `PoolDocuments.jsx`, `api.js`, `styles.css`):
    - `uploadWithXhr()` Helper in `api.js`: XHR statt fetch, Authorization-Header aus localStorage, `onProgress`-Callback
    - `onProgress(0-100)` während File-Transfer, `onProgress(-1)` wenn Datei gesendet + Server verarbeitet (OCR)
    - Chat-Kontext (`FileUpload.jsx`): Kompakter Fortschrittsbalken (120px) mit Prozentanzeige unter dem Upload-Button
    - Pool-Kontext (`PoolDocuments.jsx`): Pending-Dokument-Karte in der Liste (Dateiname + Fortschrittsbalken + Statustext)
    - Shimmer-Animation (`@keyframes upload-processing`) für die Server-Processing-Phase

#### Zitatmodus — Source-Excerpts (2026-02-22)
12. **Migrations** (`supabase/migrations/20260223_chunk_page_number.sql`):
    - `page_number INTEGER` Spalte in `app_document_chunks`
    - Beide RPCs (`match_document_chunks`, `keyword_search_chunks`) geben `page_number` zurück
13. **`documents.py`** (`_build_extracted_markdown()`): `<!-- page:N -->` Kommentare vor jeder Seite injiziert
14. **`rag.py`** (`chunk_text()`): `_PAGE_MARKER_RE` parsed Marker, gibt `List[Tuple[str, Optional[int]]]` zurück; `process_document()` speichert `page_number` pro Chunk-Row
15. **`main.py`**: `_make_excerpt()` entfernt Breadcrumb-Prefix (split auf `\n\n`), kürzt auf 350 Zeichen; `rag_sources` enthält `excerpt` + `chunk_index` + `page_number` in beiden Chat- und Pool-Endpunkten
16. **`SourceDisplay.jsx`**: Collapsible Excerpts via `useState`, Chevron-Icon, `.source-tag--citable/--open`, `.source-excerpt` Blockquote; Seitenangabe `(S. N)` neben Dateiname

#### Embedding-Provider-Auswahl (2026-02-22)
17. **Migration** (`supabase/migrations/20260224_embedding_provider_setting.sql`): Patcht `rag_settings` JSONB mit `embedding_provider` + `embedding_deployment`
18. **`admin.py`**:
    - `DEFAULT_RAG_SETTINGS` erweitert um `embedding_provider: "openai"` und `embedding_deployment: ""`
    - Normalisierung in `get_rag_settings()` und `update_rag_settings()`: Whitelist-Validierung für provider, strip für deployment
    - `allowed`-Set in `update_rag_settings()` erweitert
19. **`models.py`**: `UpdateRagSettingsRequest` erweitert um `embedding_provider: Optional[str]` + `embedding_deployment: Optional[str]`
20. **`rag.py`** (`generate_embeddings()`): Liest `embedding_provider` aus `admin_crud.get_rag_settings()`; Azure-Pfad nutzt `api-key` Header, Deployment-URL, kein `model`-Feld; `logger.info()` zeigt genutzten Provider
21. **`rag.py`** (`process_document()`): `record_usage()` nutzt tatsächlichen Provider statt hardcoded `"openai"`
22. **`admin.py`** (`get_detailed_usage()`): `by_model`-Gruppierung nutzt `(model, provider)` als Key — gleicher Modellname von unterschiedlichen Providern erscheint als separate Zeile
23. **`AdminDashboard.jsx`** (RetrievalTab): Select für OpenAI/Azure + bedingtes Deployment-Name-Input-Feld; form-State, loadSettings, handleSave erweitert
24. **`main.py`**: `target_id=None` für Audit-Event `admin.rag_settings.update` (war ungültige UUID); `logging.basicConfig(level=logging.INFO)` für sichtbare App-Logger; `import re` ergänzt

#### Automatische Dokument-Zusammenfassung (2026-02-22)
25. **Migration** (`supabase/migrations/20260225_document_summary.sql`): `summary TEXT` Spalte in `app_documents`
26. **`documents.py`**: `update_document_summary(document_id, summary)` CRUD-Funktion; `summary` in `list_documents()` Select
27. **`pools.py`**: `summary` in `list_pool_documents()` Select
28. **`main.py`** (`_summarize_document()`): Async-Helper — stripped Page-Marker, kürzt auf 6000 Zeichen, ruft Default-LLM mit deutschem 2-3-Satz-Prompt auf, silent fail; wird nach `process_document()` in beiden Upload-Endpunkten aufgerufen (Chat + Pool)
29. **`DocumentList.jsx`**: Summary als `title`-Tooltip auf Dokument-Tag
30. **`PoolDocuments.jsx`**: Summary als 2-zeilig geklammter Text (`.pool-doc-summary`) unter Dateiname; in Preview-Modal als Blockzitat (`.pool-preview-summary`) vor Volltext
31. **`styles.css`**: `.pool-doc-summary` (2-line clamp), `.pool-preview-summary` (kursives Blockzitat mit Akzent-Border)

## Datenbank-Schema-Übersicht

**KEINE shared Tabellen — jede Anwendung nutzt nur eigene Tabellen.**

| Tabelle | Zugehörigkeit | Beschreibung |
|---------|---------------|--------------|
| `app_users` | XQT5 AI Plattform | Eigene Benutzer mit is_admin Flag |
| `chats` | XQT5 AI Plattform | Chat-Konversationen mit model/temperature/assistant_id |
| `chat_messages` | XQT5 AI Plattform | Chat-Nachrichten (clean, ohne Pipeline-Felder) |
| `chat_token_usage` | XQT5 AI Plattform | Token-Verbrauch + Kosten pro Anfrage |
| `assistants` | XQT5 AI Plattform | KI-Assistenten mit System-Prompts |
| `prompt_templates` | XQT5 AI Plattform | Prompt-Templates mit Platzhaltern |
| `app_model_config` | XQT5 AI Plattform | Admin-verwaltete Modell-Liste (+ deployment_name für Azure) |
| `app_provider_keys` | XQT5 AI Plattform | Verschlüsselte Provider-API-Keys + Azure-Config |
| `app_audit_logs` | XQT5 AI Plattform | Audit-Log-Einträge |
| `app_runtime_config` | XQT5 AI Plattform | Admin-konfigurierbare Laufzeit-Einstellungen (RAG-Settings als JSONB) |
| `app_documents` | XQT5 AI Plattform | Hochgeladene Dokumente (PDF/TXT/Bild) mit Status, pool_id, summary |
| `app_document_chunks` | XQT5 AI Plattform | Dokument-Chunks mit Embeddings (vector(1536)), page_number, content_fts |
| `app_document_assets` | XQT5 AI Plattform | OCR-extrahierte Bilder mit Embeddings für multimodales Retrieval |
| `pool_pools` | XQT5 AI Plattform | Pool-Metadaten (name, description, icon, color, owner_id) |
| `pool_members` | XQT5 AI Plattform | Pool-Mitgliedschaften mit Rolle (viewer/editor/admin) |
| `pool_invite_links` | XQT5 AI Plattform | Share-Links mit Token, Rolle, max_uses, expires_at |
| `pool_chats` | XQT5 AI Plattform | Pool-Chats (shared + private via is_shared Flag) |
| `pool_chat_messages` | XQT5 AI Plattform | Pool-Chat-Nachrichten mit user_id für Attribution |
| `users` | llm-council | Pipeline-Benutzer (nicht anfassen!) |
| `conversations` | llm-council | Pipeline-Konversationen (stage1/2/3) |
| `messages` | llm-council | Pipeline-Nachrichten (stage1/2/3, metadata) |
| `token_usage` | llm-council | Token-Verbrauch pro Pipeline-Stage |
| `app_settings` | llm-council | Globale Einstellungen |
| `api_keys` | llm-council | API-Key-Verwaltung |
| `provider_api_keys` | llm-council | Verschlüsselte Provider-Keys |

## Migrations-Übersicht (chronologisch)

| Migration | Inhalt |
|-----------|--------|
| `20260214_initial_schema.sql` | Basis-Schema |
| `20260215_phase_a_model_temperature.sql` | Modellauswahl + Temperatur |
| `20260215_phase_b_auth_token_tracking.sql` | Token-Tracking |
| `20260215_phase_b_own_users_table.sql` | `app_users` Tabelle |
| `20260216_phase_c_rag.sql` | pgvector, `app_documents`, `app_document_chunks`, `match_document_chunks()` RPC |
| `20260216_phase_c_assistants_templates.sql` | Assistenten + Templates |
| `20260216_phase_d_admin_audit.sql` | `app_model_config`, `app_audit_logs` |
| `20260216_phase_d_provider_keys.sql` | `app_provider_keys` |
| `20260216_phase_d_azure_provider.sql` | `deployment_name` in `app_model_config` |
| `20260217_phase_d_token_version_revocation.sql` | `token_version` in `app_users` |
| `20260218_pools.sql` | Pool-Tabellen, `pool_id` in `app_documents`, RPC-Erweiterung |
| `20260219_drop_old_function_overloads.sql` | Bereinigung alter RPC-Signaturen |
| `20260219_phase_f_multimodal_assets.sql` | `app_document_assets` |
| `20260220_runtime_rag_settings.sql` | `app_runtime_config` für Admin-RAG-Settings |
| `20260221_rag_scoped_search.sql` | Scope-isolierte RPCs (conversation/pool/global) |
| `20260222_bm25_fts.sql` | `content_fts tsvector`, GIN-Index, `keyword_search_chunks()` RPC |
| `20260223_chunk_page_number.sql` | `page_number` in `app_document_chunks`, RPC-Updates |
| `20260224_embedding_provider_setting.sql` | `embedding_provider` + `embedding_deployment` in `rag_settings` |
| `20260225_document_summary.sql` | `summary` in `app_documents` |
| `20260226_rag_sources_persistence.sql` | `rag_sources JSONB` in `chat_messages` + `pool_chat_messages` |

### UI/UX Redesign — Overlay Sidebar + Glassmorphism (2026-03-21)

#### Frontend — Overlay Sidebar
1. **`styles.css`** (`.content-panel`):
   - `position: absolute; left: 56px; top: 8px; bottom: 8px; width: 248px; z-index: 200`
   - `background: rgba(255,255,255,0.18); backdrop-filter: blur(16px) saturate(2); -webkit-backdrop-filter: blur(16px) saturate(2)`
   - `border: 1px solid rgba(255,255,255,0.35); border-radius: 12px`
   - `box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)`
   - `.content-panel--hidden`: `opacity: 0; transform: scale(0.93); pointer-events: none`
   - Transition: `opacity 0.2s cubic-bezier(0.4,0,0.2,1), transform 0.22s cubic-bezier(0.34,1.1,0.64,1)`
   - `transform-origin: top left` (Genspark-Effekt: Aufgehen von oben links)
2. **`App.jsx`** — Sidebar-Logik:
   - `displayedPool` (Hauptbereich) getrennt von `activePool` (Sidebar-Navigation) — Pool-Inhalt bleibt beim "Alle Pools"-Klick sichtbar
   - Phase 2 (2026-05-07): zusätzlicher `activePoolChatId`-State für Pool-Chat-Highlighting in der Hauptliste; wird beim Klick auf Pool-Chat in der Merged-Liste gesetzt und als `initialChatId`-Prop an `PoolDetail` durchgereicht
   - `useEffect` mit `document.addEventListener('mousedown', ...)` für Click-Outside-to-Close
   - `handleSelectPool`: `setSidebarOpen(false)` — Sidebar schließt sich bei Pool-Auswahl
   - `onPoolTabChange`, `onCreateConversation`, `onOpenConversation`: alle setzen `setSidebarOpen(false)`
   - Root `<div className="app">` ohne flex-Verschiebung — Sidebar als Overlay
3. **`NavRail.jsx`**: `onHome`-Prop auf Logo-Div — Klick setzt alle States zurück, zeigt Welcome-Screen
4. **`Welcome.jsx`**: Placeholder `"Fragen stellen, Lösungen erhalten…"`
5. **`PoolDetail.jsx`**: `PoolChatArea` außerhalb von `.pool-content` — verhindert doppelte Padding-Kompensation

#### Layout-Vereinfachung
6. `.messages`, `.pool-messages`, `.input-form`, `.pool-content`: Konsistente `padding: 24px 80px` — keine margin-left-Kompensation mehr nötig (Overlay eliminiert Verschiebungslogik)
7. `.input-card-textarea`: `min-height: 80px` für komfortablere Eingabe

---

### Mammouth.ai Provider + Admin-Modellverwaltung (2026-03-22)

#### Backend — Mammouth.ai Provider
1. **`providers.py`**:
   - `"mammouth"` in `KNOWN_PROVIDERS`
   - `"mammouth": "Mammouth.ai"` in `PROVIDER_DISPLAY`
2. **`llm.py`**:
   - `PROVIDER_CONFIG["mammouth"]`: `base_url: https://api.mammouth.ai/v1`, `chat_path: /chat/completions`, `auth_header: Authorization`, `auth_prefix: Bearer`, `skip_temperature: True`
   - `_build_openai_compatible_request()`: neuer Parameter `skip_temperature: bool = False` — wenn True, wird `temperature` nicht in den Request-Body aufgenommen
   - 18 Mammouth-Modelle in `AVAILABLE_MODELS` (Fallback): GPT-5.2/5.1/5, GPT-4.1, Claude Opus 4.6/Sonnet 4.6/4.5/Haiku 4.5, Gemini 3 Pro/2.5 Pro/Flash, Mistral Large 3, DeepSeek V3.2/R1, Grok 4
3. **`main.py`**: Neuer Endpoint `GET /api/admin/providers/{provider}/models`:
   - Mammouth: `GET https://api.mammouth.ai/public/models` (öffentlich, kein Auth)
   - Andere OpenAI-kompatible Provider: `GET {base_url}/models` mit Bearer-Token
   - Google: `GET {base_url}/models?key={api_key}`
   - Filtert Embedding-Modelle für Mammouth heraus
   - Rückgabe: `[{"id": "...", "name": "..."}]`

#### Frontend — Admin Modell-Tab Redesign
4. **`api.js`**: `adminListProviderModels(provider)` → `GET /api/admin/providers/{provider}/models`
5. **`AdminDashboard.jsx`** (`ModelsTab`):
   - Provider-Dropdown (nur Provider mit `source !== 'none'`) statt Freitextfeld
   - Modell-Dropdown (von Provider-API geladen) statt Freitextfeld; Fallback auf Textinput wenn API keine Modelle liefert
   - Auto-Fill: `model_id = "{provider}/{model_id}"`, `display_name = model_id`
   - "Setzen"-Button statt Radio-Button für Default-Modell (keine Browser/React-Konflikte)
   - "✓ Default"-Badge für das aktive Default-Modell
   - `loadProviders()` lädt Provider parallel zu Modellen beim Tab-Open

#### Bug-Fixes
6. **`admin.py`** (`update_model_config()`): Default-Reset nutzt `.neq("id", config_id)` statt `.eq("is_default", True)` — verhindert Silent-Fail bei boolean Supabase-Filter
7. **`admin.py`** (`list_model_configs()`): Sekundärer Sort `.order("model_id")` für stabile Zeilenreihenfolge bei identischem `sort_order`

---

### RAGplus Erweiterungen: Listing-Intent + Metadaten-Filter (2026-03-26)

#### Listing-Intent (Commit bd031af)
1. **`rag.py`** — Neue Intent-Kategorie `"listing"`:
   - `LISTING_QUERY_KEYWORDS`: Set mit DE/EN Trigger-Phrasen ("welche dokumente", "dokumente kennst du", "list documents", etc.)
   - `detect_query_intent()`: gibt jetzt `"summary"`, `"listing"` oder `"fact"` zurück
2. **`main.py`** — `send_message` + `send_pool_message`:
   - Bei `listing`-Intent: `_build_available_documents_context()` wird zusätzlich zum RAG-Chunk-Kontext injiziert — auch wenn Chunks gefunden wurden

#### Metadaten-Filter / Targeted Retrieval (Commit bd031af)
3. **`rag.py`** — Neue Konstanten: `_MAX_TARGETED_CHUNKS = 80`, `_MONTH_MAP` (DE+EN Monatsnamen), `_DOC_TYPE_WORDS` (Protokoll, Rechnung, Vertrag, Bericht, Angebot, Gutachten, etc.)
4. **`rag.py`** — 3 neue Funktionen:
   - `parse_document_filters(query)`: Regex für Jahr (20[2-9]x), Substring-Match für Monatsnamen, Keyword-Lookup für Dokumenttypen → `{date_from, date_to, name_pattern}`
   - `fetch_filtered_document_ids(user_id, pool_id, chat_id, filters)`: Supabase-Abfrage auf `app_documents` mit `.gte("created_at", ...)`, `.lte("created_at", ...)`, `.ilike("filename", "%...%")`, scope-aware (pool / chat / global)
   - `fetch_chunks_for_documents(document_ids)`: direkte Tabellenabfrage auf `app_document_chunks` mit `.in_("document_id", ids)`, geordnet nach (document_id, chunk_index), Batch-Lookup Filenames, `similarity=1.0`
5. **`rag.py`** — `retrieve_chunks_with_strategy()` erweitert:
   - Neuer Parameter `document_filters: Optional[Dict[str, Any]] = None`
   - Bei `intent in ("summary", "listing")` und Treffern: Targeted Retrieval statt Vector-Search
   - Fallback auf normalen Hybrid-Search wenn Filter 0 Dokumente trifft oder `document_filters` leer ist
6. **`main.py`** — `send_message` + `send_pool_message`:
   - `doc_filters = rag_mod.parse_document_filters(payload.content)` vor Retrieval
   - `document_filters=doc_filters` an `retrieve_chunks_with_strategy()` übergeben
7. **Keine Supabase-Migration** — direkte Tabellenabfrage statt RPC-Erweiterung

---

## Phase 3.5 — Filetype-Erweiterung (umgesetzt 2026-05-08/11)

Erweiterung des Upload-Pfads von `pdf/txt/image` auf `pdf/txt/md/csv/docx/xlsx/xls/image`. Architektonisches Muster für alle neuen Extractor-Funktionen in `backend/app/documents.py`:

- **Synchron** (`def _extract_*_text(file_bytes: bytes) -> str`) — keine OCR-Roundtrips für Office-Formate, kein Mistral-API-Call.
- **Markdown als Zwischendarstellung** — Tabellen werden zu Markdown-Pipe-Tabellen (`_rows_to_md_table`-Helper), Sheet-Namen / Heading-Styles werden zu `#`/`##`-Headings. Damit greift der bestehende `extract_section_path()` ohne Anpassung.
- **Keine Asset-Extraktion** — `_extract_*_text_and_assets` liefert immer `[]`. Bild-Extraktion aus Office-Dateien kommt erst mit OCR-Pipeline v2 (Docling).
- **Filetype-Gating zweistufig:** erst die Allowlist `SUPPORTED_UPLOAD_EXTENSIONS` in `main.py:77-81` (HTTP-400 vor Read), dann die Branch-Auswahl in `extract_text()` / `extract_text_and_assets()` in `documents.py:57-106`. Die `_FILE_TYPE_BY_EXT`-Map (`main.py:93-101`) liefert das `file_type`-Label für die DB-Spalte und die Frontend-Icon-Auswahl.

**Legacy-Formate (`.doc`, `.ppt`)** bewusst geschoben — benötigen System-Tool-Subprozesse (`antiword`, `catdoc`) und blähen das Coolify-Image um ~15 MB. **`.pptx`** ebenfalls geschoben weil `python-pptx` Bilder/Group-Shapes/Notes still verwirft — würde RAG-Indizes selbstüberzeugend unvollständig machen. Revisit alle drei bei OCR-Pipeline v2 (Docling liest `.docx/.xlsx/.pptx` mit Layout-Bewusstsein nativ).

## Phase 3.5 — Multi-Datei-Upload mit Concurrency-Semaphore (umgesetzt 2026-05-11)

Frontend-Seite: `<input type="file" multiple>` plus Worker-Pool-Semaphore (`MAX_CONCURRENT = 2`) in `FileUpload.jsx` und `PoolDocuments.jsx`. Pro Datei eigenes State-Tupel `{file, name, status, pct, error}` im lokalen Komponenten-State (nicht App.jsx — der dortige `setError`-Single-Slot hätte vorherige Fehler überschrieben). Backend-Endpunkte unverändert — jede Datei läuft durch die existierende single-file POST-Route.

Begleitender Bugfix in `api.js uploadWithXhr`: 401-Retry mit `tryRefresh()` + einmaligem Retry. War ein pre-existing Fehler (Token-Refresh fehlte für XHR-Uploads), der unter Single-File-Upload selten triggerte, aber bei langen Multi-File-Batches systematisch zuschlug.

## Build-System (umgesetzt 2026-05-11)

`backend/Dockerfile` von hardcoded `pip install`-Liste auf `uv sync --frozen --no-dev --no-install-project` umgestellt. Source-of-Truth-Reihenfolge: `pyproject.toml` deklariert Set + Obergrenzen → `uv.lock` pinnt exakte Versionen mit SHA-256 → Dockerfile installiert ausschließlich aus dem Lockfile. Verhindert dass neue Deps in `pyproject.toml` beim Build still verloren gehen. Siehe `CLAUDE.md` Abschnitt „Build & deploy" und `docs/CODING-DOKUMENT.md` 2026-05-11-Fehlerjournal-Eintrag.

## Modal- und ConfirmDialog-Primitiv (umgesetzt 2026-05-12)

Frontend-Architektur-Erweiterung: zwei neue Primitive ersetzen rohes `.modal-overlay`-Markup und alle `window.confirm()`-Aufrufe.

- **`frontend/src/components/Modal.jsx`** — deklarative `<Modal title onClose>`-API mit `role="dialog"` (überschreibbar zu `alertdialog`), `aria-modal="true"`, `aria-labelledby` an Auto-Titel-ID, Esc-Listener, Tab/Shift-Tab-Fokus-Trap, Fokus-Rückkehr beim Unmount, togglebarer Backdrop-Click-Close (`closeOnBackdropClick`-Prop, Default `true`). Fokus-Initialisierung in `useLayoutEffect` schützt Reacts `autoFocus`-Attribut: das Modal greift nur dann zum ersten fokussierbaren Element, wenn der Fokus nicht bereits durch `autoFocus` innen gelandet ist.

- **`frontend/src/components/ConfirmDialog.jsx`** — exportiert `ConfirmProvider` und Hook `useConfirm()`. Der Provider ist in `main.jsx` oberhalb von `<App />` gemountet (außerhalb der Auth-Gate, damit auch Pre-Auth-Flows den Hook nutzen können). Hook-API: `const confirm = useConfirm(); const ok = await confirm({ title, message, confirmLabel, cancelLabel, destructive })`. Default-Fokus liegt auf Cancel; Default-Labels deutsch. `destructive: true` gibt dem Confirm-Button die `btn-danger`-Klasse. Intern: `<Modal role="alertdialog" closeOnBackdropClick={false} size="confirm">`.

- **Retrofit:** `CreatePoolDialog` und `PoolShareDialog` (mit `closeOnBackdropClick={false}`, weil State-Verlust nach Token-Generierung user-feindlich wäre) auf `<Modal>` migriert. `AssistantManager` und `TemplateManager` *nicht* migriert — ihr Zwei-Panel-Layout (List ↔ Edit-Form) passt nicht in eine deklarative Single-Child-API; ihre `confirm()`-Aufrufe wurden trotzdem auf den Hook umgestellt. Alle 15 `window.confirm()`-Aufrufe über 8 Dateien (App.jsx, PoolMembers, PoolChatList, PoolDocuments, FileUpload, AdminDashboard mit 4 Sub-Tabs, AssistantManager, TemplateManager) ersetzt. Inline-Arrow-`onClick`-Handler in `PoolChatList` und `PoolDocuments` zu async-Funktionen umgebaut; `e.stopPropagation()` läuft synchron vor `await confirm(...)`, damit der Parent-Click nicht feuert.

- **CSS:** `.modal-overlay`/`.modal-content`/`.modal-header`/`.modal-close` (styles.css:1352-1410) unverändert — `<Modal>` rendert dieselbe DOM-Struktur. Zwei neue Regeln: `.modal-content--confirm { max-width: 440px }` und `.confirm-message { white-space: pre-line; ... }`.

- **Anti-Scope:** zwei Vorschau-Modale in `PoolDocuments.jsx` (`.pool-preview-modal-backdrop`, `.pool-text-modal`) bleiben ungewandelt (anderes Pattern, fullscreen Datei-Preview). Eine `IconButton`-Primitive für aria-label-Sweep auf alle Icon-only-Buttons ist Folge-Scope.

## Persistente Seitenleiste — Overlay → Layout-Spalte (umgesetzt 2026-05-12)

Die sekundäre Seitenleiste (`.content-panel` zwischen `NavRail` und Hauptinhalt) wurde von einem auto-schließenden Overlay (`position: absolute`, schloss beim Öffnen eines Chats/Pools) zu einer persistenten Layout-Spalte umgebaut, die offen bleibt bis die Nutzer:in sie explizit schließt.

**CSS-Modell:** `.content-panel` ist jetzt `position: static` mit `flex-shrink: 0` und `width: 248px` — ein normales Flex-Item in `.app`, das `ChatArea`/`PoolDetail` neben sich drückt. `.content-panel--hidden` ist `display: none` (sauberer Layout-Kollaps). Glassmorph-Optik (`backdrop-filter`, abgerundete Ecken, Schatten) bleibt visuell erhalten. Eine `@media (max-width: 768px)`-Regel revertet die Seitenleiste auf engen Viewports zurück zu `position: absolute` + `scale+opacity`-Animation, sodass Mobile als Drawer-Overlay funktioniert (sonst würde 56 px NavRail + 248 px Seitenleiste den Hauptinhalt erdrücken).

**Schließ-Affordanzen:** Drei Wege, das Panel zu schließen — (1) NavRail-Icon der aktiven Section nochmals klicken, (2) Home-Logo, (3) neuer X-Button im Panel-Header (gerendert in allen drei Sidebar-Modi via `CloseSidebarButton`-Komponente in `Sidebar.jsx`, gemeinsame `.panel-header-close`-CSS-Klasse). Der Pool-Nav-Modus bekam einen neuen `.pool-nav-top`-Container, der den „Alle Pools"-Back-Button und den X-Button in einer Flex-Row gruppiert.

**State-Cleanup in `App.jsx`:** Fünf Auto-Close-`setSidebarOpen(false)`-Aufrufe entfernt (in `onCreateConversation`, `onOpenConversation`, `handleSelectPool`, `onPoolTabChange`-JSX-Prop, sowie der Click-Outside-`useEffect`). Der admin-Branch in `handleSectionChange` behält das `setSidebarOpen(false)` als bewusste Ausnahme (Admin bleibt voll-Breite). `handleClosePool` räumt jetzt `displayedPool` zusätzlich zu `activePool` (verhindert „Seitenleiste zeigt Pool-Liste, Hauptinhalt zeigt alten Pool"-Mismatch). `handleSectionChange`-Chat-Branch räumt zusätzlich `activePoolChatId`, damit pool→chat→pool keine alten Pool-Chats reseed.

**Mobile-Drawer-JS-Wiring:** Das Click-Outside-`useEffect` in `App.jsx` hat einen `window.matchMedia('(max-width: 768px)').matches`-Guard — Outside-Click-Close feuert ausschließlich, wenn die Media-Query aktiv ist (Drawer-Modus). Auf Desktop bleibt das Panel offen, auch wenn die Nutzer:in in den Hauptinhalt klickt.

**Bekannte Edge Cases (geparkt):**
- Streaming-Race: `api.sendMessageStream`-Completion-Callback überschreibt `setActiveConversation` auch wenn die Nutzer:in mittendrin in eine andere Section gewechselt hat. Vorher schon vorhanden, durch persistente Sidebar etwas wahrscheinlicher; saubere Lösung braucht `AbortController` + Conversation-ID-Capture in `useRef` — eigener PR.
- `.messages`/`input-form`-Padding (`24px 80px`) wird auf engen Desktop-Viewports knapper. Visuell post-deploy entscheiden.

## Pool-Chat aus gemischter Chat-Liste: Sidebar-Entkopplung (umgesetzt 2026-05-12)

Klick auf einen Pool-Chat in der unifizierten Chats-Seitenleiste (`mergedChatItems`) öffnet jetzt den Chat im Main-Bereich, ohne die Seitenleiste in den Pool-Nav-Modus zu wechseln. Neues State-Tripel `{displayedPool=Pool, activePool=null, activeSection='chat'}` repräsentiert „Pool-Chat im Hauptbereich, Seitenleiste auf gemischter Chat-Liste". Sidebar's Pool-Nav-Gate (`section === 'pools' && activePool`) bleibt false, die Liste bleibt sichtbar.

Expliziter Wechsel in den Pool-Nav-Modus via neuem `<button class="pool-header-open-btn">Pool öffnen</button>` in `PoolHeader.jsx`. Conditional: Button versteckt sich, sobald `activePoolId === pool.id` (Seitenleiste zeigt bereits den Pool). Handler `handleOpenPoolSidebar()` in `App.jsx` setzt `activeSection='pools'`, `activePool=displayedPool`, `sidebarOpen=true`.

**State-Hygiene erweitert:** `onOpenConversation`/`onCreateConversation` und `handleSectionChange`-Pools-Branch räumen jetzt zusätzlich `displayedPool` und `activePoolChatId` auf — verhindert Cross-Modus-Mismatches, in denen `displayedPool` rendert während die Seitenleiste eine andere Section zeigt.

**PoolDetail re-mount via Key:** `<PoolDetail key={displayedPool.id}>` erzwingt sauberen Re-Mount beim Pool-Wechsel — eliminiert den Race zwischen stalem internen State und neuem `useEffect`-Reload.

**Third-Click-Regression-Fix:** Die Re-Click-Logik auf denselben Pool-Chat scheiterte vorher, weil `activePoolChatId` als unverändert wahrgenommen wurde und der `consumedChatIdRef`-Guard in PoolDetail (`if (consumedChatIdRef.current === initialChatId) return`) den Reopen blockierte. Behoben durch (1) neuer `onPoolChatClosed`-Callback aus App.jsx an PoolDetail, der `activePoolChatId` null setzt sobald der/die Nutzer:in den Chat verlässt, plus (2) neuer `useEffect` in PoolDetail mit `[initialChatId]`-Dep, der `consumedChatIdRef` resettet sobald initialChatId null wird. Damit ist der nächste Klick auf denselben Chat ein echter State-Übergang `null → 'chat-1'`, der den Reopen triggert.

## „Chats"-Tab-Re-Click zeigt wieder die Pool-Chat-Liste (umgesetzt 2026-05-12)

Re-Click des aktiven „Chats"-Tabs in der Pool-Nav-Seitenleiste schließt einen offenen Pool-Chat und kehrt zur Chat-Liste zurück. Implementiert via Counter-Signal-Pattern: neue State-Variable `chatListResetSignal` (`useState(0)`) in `App.jsx`, inkrementiert in `handlePoolTabChange(newTab)` wenn `newTab === 'chats' && poolTab === 'chats'`. `PoolDetail` empfängt das Signal als Prop und beobachtet es via `useEffect` mit `[chatListResetSignal]`-Dep, wo es `setActiveChat(null)` aufruft. Idiomatisches Parent-zu-Child-Imperativ-Signal — kleinster Aufwand, lokalisiert, kein Refactor des `activeChat`-State nach oben in App.jsx nötig.

**Selektive Verdrahtung:** Der neue Handler ist NUR an die Pool-Nav-Tab-Buttons in `Sidebar.jsx` verdrahtet. `<PoolDetail onTabChange={setPoolTab}>` bleibt direkt — weil `PoolDetail.handleOpenChat` intern `onTabChange('chats')` aufruft, würde das Routing durch `handlePoolTabChange` den Signal-Effect feuern und den frisch gesetzten Chat sofort wieder schließen. Auch PoolHeader-Count-Badges und PoolOverview-Shortcuts bleiben am direkten Pfad. Folge: nur der Sidebar-Tab triggert den Reset; die Badges in PoolHeader nicht. Bewusster UX-Trade-off — der/die Nutzer:in fragte explizit nach „im Pool-Sidebar", die Badges sind sekundäre Stat-Counter.

**Bonus-Fix in `handleSelectPool`:** `setActivePoolChatId(null)` ergänzt, um den Stale-Chat-ID-Leak zwischen Pools zu schließen (Pool A → Admin → Pool B könnte vorher Chat-IDs verwechseln, wenn der/die Nutzer:in auf den Chats-Tab klickte).

## Chat-Liste-Differenzierung: Border + Type-Icon (umgesetzt 2026-05-12)

Verstärkte visuelle Trennung zwischen persönlichen Chats und Pool-Chats in der unifizierten Chats-Seitenleiste. Die Änderung besteht aus drei orthogonalen Schichten:

**Border-System:** Item-Border-Stärke von 1 px auf 2 px angehoben. Inaktive persönliche Chats erhalten `rgba(33,52,82,0.62)` als Border-Farbe (vorher `rgba(33,52,82,0.18)`, wahrnehmbar als Grau). Aktive persönliche Chats erhalten Navy-Füllung (`rgba(33,52,82,0.10)`) plus solide Navy-Border — ersetzt die bisherige Orange-Füllung, die für alle aktiven Items galt. Aktive Pool-Chats behalten Orange, leicht angehoben auf `rgba(238,127,0,0.10)` Füllung plus `var(--color-primary)`-Border. Die Differenzierung folgt dem bestehenden Markenmodell: Orange = Pool, Navy = Persönlich.

**Type-Icon:** Neues `.panel-item-icon`-Element pro Zeile, rechts ausgerichtet mit `margin-right: 32px` (genug Abstand, damit der absolut positionierte Hover-Delete-Button nicht überlagert). Icons: `<ChatBubbleIcon>` für persönliche Chats, `<GlobeIcon>` für geteilte Pool-Chats, `<LockIcon>` für private Pool-Chats. Das `is_shared`-Flag kommt aus `/api/pools/me/chats` (Backend `pool_chats.py:40–46`).

**CSS-Scoping:** Alle Regeln sind über den Parent-Modifier `.panel-list--chats` eingegrenzt — die Chat-Section erhält diesen Modifier, alle Selektoren lauten `.panel-list--chats .panel-item[…]`. Die Pool-Listenansicht (kein `--chats`-Modifier) bleibt unberührt. Konvention dokumentiert in `CODING-DOKUMENT.md` (2026-05-12).

Berührte Dateien: `frontend/src/components/Sidebar.jsx`, `frontend/src/styles.css`, `frontend/src/components/Icon.jsx` (neue Icon-Exports).

## Chat-Sortierung nach letzter Aktivität (umgesetzt 2026-05-12)

Chat-Listen werden jetzt nach der zuletzt gesendeten Nachricht sortiert, nicht nach Erstellungsdatum. Das betrifft drei Stellen: die unifizierte Seitenleisten-Liste (`mergedChatItems` in `App.jsx`), die „Letzte Chats"-Kacheln in `PoolOverview.jsx` und die Pool-Chat-Liste (`PoolChatList.jsx`).

**Muster: Compute-on-Read.** `last_message_at` wird nicht als denormalisierte Spalte in den Chat-Tabellen gespeichert und nicht per Trigger aktuell gehalten. Stattdessen berechnet jede Chat-Listen-Abfrage das Datum zur Laufzeit — eine bewusste Entscheidung gegen Trigger-Komplexität und für Logik, die vollständig im Appcode versionierbar ist.

**Kombinierte Supabase-Query.** Die bisherige `select("id", count="exact")`-Abfrage pro Chat übertrug alle Message-IDs nur für `len(result.data)`. Sie wird durch `.select("created_at", count="exact").order("created_at", desc=True).limit(1).execute()` ersetzt: `.count` liefert die Gesamtzahl (unabhängig von `.limit`), `.data[0]` liefert den letzten Zeitstempel. Eine Query, kleinere Payload, zwei Werte. Wichtig: `len(msg_count.data)` als Zähler-Pattern ist nach dieser Umstellung falsch — es liefert 0 oder 1 statt der echten Zahl. Korrekt ist `msg_q.count`.

**Sort-Key.** `last_message_at || created_at` — für leere neue Chats greift `created_at` als Fallback, damit sie oben erscheinen bis die erste Nachricht landet.

**Berührte Dateien:** `backend/app/storage.py` (`list_conversations`), `backend/app/pools.py` (`list_pool_chats`, `list_all_pool_chats_for_user`), `backend/app/pool_chats.py`, `backend/app/models.py` (`ConversationMetadata`), `frontend/src/App.jsx`, `frontend/src/components/PoolOverview.jsx` (Zeile 184: Datumsanzeige + Sort), `frontend/src/components/PoolChatList.jsx` (defensiver Frontend-Sort).

**Manueller Deployschritt.** Migration `supabase/migrations/20260512_pool_chat_messages_created_idx.sql` (Index `pool_chat_messages(chat_id, created_at DESC)`) muss vor dem Code-Deploy ausgeführt werden. Ohne den Index ist das Feature funktional korrekt, aber Abfragen auf `pool_chat_messages` laufen per Seq-Scan. Der analoge Index auf `chat_messages` existiert seit 2026-02-15.

## i18n-Drift-Bereinigung (umgesetzt 2026-05-12)

Drei kleine i18n-Patches an Pool-Komponenten beheben englisch-in-deutscher-UI-Regressionen und führen das `t()`-Pattern in fünf weitere Render-Stellen ein.

- **`PoolChatList`** — 5 Strings auf neue `pool.chat.*`-Keys umgestellt (`button.shared/private`, `section.shared/private`, `empty`). Namespace `pool.chat.*` bewusst nicht `pool.chatlist.*`, damit die Keys eine künftige Komponentenumbenennung überdauern.
- **`DocumentList`** — englischer Tooltip `title="Remove document"` → `t('doc.action.delete')` (= `Dokument löschen`, passt zur projektweiten „löschen"-Konvention); englischer Fallback `${chunk_count} chunks` → `${chunk_count} ${t('doc.chunks')}`.
- **Pool-Rolle-Badge** — `t(\`pool.header.role.${role || 'viewer'}\`)`-Pattern (Fallback gegen `undefined`) jetzt konsistent über `Sidebar.jsx` (2 Stellen), `PoolList.jsx`, `PoolMembers.jsx`, `PoolShareDialog.jsx` ausgerollt. PoolOverview.jsx hatte das Pattern schon; jetzt sieht der/die Nutzer:in überall `Eigentümer:in` / `Administrator:in` / `Bearbeiter:in` / `Betrachter:in` statt rohem `owner`/`admin`/`editor`/`viewer`. **Wichtig:** Das Fallback `|| 'viewer'` ist nicht kosmetisch — ohne ihn würde `t('pool.header.role.undefined')` den Key wörtlich zurückgeben, was als sichtbarer Müll auf der UI auftauchen würde.

## Nächste Umsetzungsschritte
- **Map-Reduce-Zusammenfassung**: Dokument-für-Dokument-Zusammenfassung + Combine-Schritt (baut auf Targeted Retrieval auf)
- **Weitere Dokumentformate**: `.doc`, `.ppt`, `.pptx` — geparkt bis OCR-Pipeline v2 (Docling)
- Multi-Pool-Retrieval: RAG-Suche über mehrere Pools gleichzeitig
- Nextcloud/SharePoint-Import
- Einzeldokument-Fokus im Chat
- Konversations-Export (Markdown/PDF)
- Kostenaufschlüsselung nach Pool im Admin-Dashboard
- SSO (OIDC/SAML) — Azure AD / Okta
- RLS und Mandantenmodell in Supabase aktivieren
