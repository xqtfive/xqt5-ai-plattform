# XQT5 AI Platform — Feature & Implementation TODO

Generated: 2026-03-31  
Sources: `xqt5-ai-plattform-dri` code diff, `RAG-VERBESSERUNGSPLAN.md`, `RAG-STATUS.md`, `articles/`, `basline-code/rag-vrm/`, `kvml_test/`

---

## Repository Orientation

| Folder | Role |
|--------|------|
| `xqt5-ai-plattform/` | **CURRENT LATEST** — this is the active codebase, do not overwrite or replace |
| `xqt5-ai-plattform-dri/` | **Parallel development branch** — contains RAG improvements developed separately; features need to be carefully cherry-picked INTO latest |

The merge direction is always **dri → latest**. The dri branch diverged at some point and received focused RAG work while the latest continued to evolve independently. A wholesale file replacement would destroy functionality that exists only in latest. Each item in Part 1 must be ported as a targeted change, not a bulk overwrite.

---

## Priority Legend
- 🔴 **BLOCKER** — Required by KVWL tender (A-criteria = rejection without it)
- 🟠 **HIGH** — Significant value, clear implementation path
- 🟡 **MEDIUM** — Good ROI, 1–3 days each
- 🟢 **NICE-TO-HAVE** — Lower urgency, future roadmap
- ✅ **In dri, not in latest** — Implemented in `xqt5-ai-plattform-dri`, needs cherry-picking into `xqt5-ai-plattform`

---

## Part 1: Features in dri NOT in latest — Cherry-pick into `xqt5-ai-plattform`

These features exist in `xqt5-ai-plattform-dri` but are absent from the current latest (`xqt5-ai-plattform`). They must be ported as individual targeted changes. **Do not copy files wholesale** — the latest has its own changes that would be lost.

> **Scope note:** Only the RAG backend improvements from dri are being ported. The dri branch also made various UI and structural changes (sidebar redesign, NavRail removal, provider removals, Welcome.jsx simplification) — these are either regressions or have no value for the latest repo and are intentionally excluded.

> **Critical bugfix:** The dri branch fixed `_reciprocal_rank_fusion()` overwriting the cosine `similarity` score with the tiny RRF score (0.008–0.016), which caused the relevance gate to always evaluate `False` and silently disabled RAG in hybrid mode. This fix must be ported first, before any other RAG changes.

### RAG Backend — Port from dri into latest

- [ ] ✅🟠 **Phase 1.1 — Relevance gate** (`apply_relevance_gate()`)
  - Discards all chunks when `max(similarity) < RAG_RELEVANCE_GATE` (default: 0.35)
  - Includes the RRF score bug fix (separate `rrf_score` field, `similarity` always holds raw cosine)
  - Files: `rag.py`, `config.py` (new `RAG_RELEVANCE_GATE` env var)

- [ ] ✅🟠 **Phase 1.2 — Full source citations**
  - `build_rag_context()` outputs page number + section breadcrumb path in source header
  - Format: `datei.pdf | Seite 12 | §3.1 Titel (Relevanz: 87%)`
  - `rag_sources` array to frontend includes `page_number`, `section_path`, `chunk_index`
  - Files: `rag.py`, `main.py`

- [ ] ✅🟠 **Phase 4.2 — Contextual retrieval** (Anthropic technique, opt-in)
  - `_generate_chunk_context()` prepends a 1-sentence LLM-generated context to each chunk before embedding
  - Runs via `asyncio.gather` for parallel batch processing per document
  - Opt-in: admin toggle `contextual_retrieval_enabled` + configurable model (`contextual_retrieval_model`)
  - Only applies to newly uploaded documents; existing docs need re-chunking
  - Files: `rag.py`, `admin.py`, `models.py`, `AdminDashboard.jsx`

- [ ] ✅🟠 **Phase 4.3 — Document summary on upload**
  - **Verify first:** `_summarize_document()` appears to already exist in `main.py` of the latest repo — confirm it is wired up in both upload endpoints and actually populates `app_documents.summary` before treating this as done
  - `_summarize_document()` generates 2–3 sentence summary after chunking
  - Stored in `app_documents.summary` (column already exists, previously never populated)
  - Files: `main.py`, `documents.py`

- [ ] ✅🟠 **Phase 5.1 — Table-aware chunking**
  - `_table_to_atoms()` treats Markdown table blocks as atomic units
  - Oversized tables split only at row boundaries; each continuation chunk starts with `[Tabellenfortsetzung — Spalten: …]`
  - `_units_with_table_awareness()` replaces `_split_into_units()` in section splitting loop
  - Files: `rag.py`

- [ ] ✅🟠 **Phase 5.3 — Neighbor chunk retrieval**
  - `enrich_with_neighbors()` fetches `chunk_index ± 1` for top-3 results after relevance gate
  - Neighbor chunks get `similarity = parent_similarity × 0.85` and `is_neighbor = true`
  - Results sorted by `document_id + chunk_index` for sequential reading
  - Opt-in: admin toggle `neighbor_chunks_enabled` (default: true)
  - Files: `rag.py`, `main.py`, `admin.py`, `models.py`, `AdminDashboard.jsx`

- [ ] ✅🟠 **Phase 7.1 — Token-budget context assembly**
  - `build_rag_context(max_tokens=6000)` fills chunks by relevance until budget exhausted
  - Skipped chunks are logged; prevents 50-chunk context from dominating the LLM window
  - `max_context_tokens` configurable up to 32,000 in admin settings
  - Files: `rag.py`, `main.py`, `admin.py`, `models.py`, `AdminDashboard.jsx`

- [ ] ✅🟠 **Phase 7.2 — XML structured context format**
  - `build_rag_context()` now outputs XML-tagged blocks instead of `--- Source N ---`
  - Format per Anthropic prompting best practices:
    ```xml
    <documents>
      <document index="1">
        <source>datei.pdf | Seite 12 | §3.1 Titel (Relevanz: 87%)</source>
        <content>…</content>
      </document>
    </documents>
    ```
  - Files: `rag.py`

### Additional Backend Changes in dri — Port to latest

- [ ] 🟠 **`main.py`: Update `_apply_document_access_policy()`**
  - Current (2-part): don't claim no access + base answer on context
  - New (3-part, from dri):
    1. Use document context ONLY when directly relevant to the user's question
    2. If user asks something unrelated to documents, answer from own knowledge — do not reference documents
    3. Base answers on provided context, state clearly when information is missing
  - File: `main.py` → `_apply_document_access_policy()`

---

## Part 2: RAG Pipeline — Open Items (from RAG-VERBESSERUNGSPLAN.md / RAG-STATUS.md)

These are planned but not yet implemented in either repo.

### No DB Schema Required

- [ ] 🟠 **Phase 6.2 — Query expansion** (no schema change needed)
  - Generate 2 additional query phrasings via fast LLM call, retrieve for all 3, merge via RRF
  - Activation condition: only when `intent == "fact"` AND `max_similarity < 0.5` after first pass
  - New function: `_expand_query(query) -> List[str]` in `rag.py`; parallel embeddings via `generate_embeddings`
  - New admin setting: `query_expansion_enabled: bool` (default: false)
  - **Effort:** Medium | **Value:** High for factual queries with weak initial retrieval

### DB Schema Required

- [ ] 🟠 **Phase 4.1 — Upload metadata extraction**
  - New columns in `app_documents`: `language varchar`, `doc_type varchar`, `page_count int`, `has_tables bool`, `has_images bool`
  - Source: Mistral `document_annotation.language` + `image_annotation.document_type`; fallback: langdetect + LLM classification on first 500 tokens
  - Extend RPC `match_document_chunks` with optional `filter_language` and `filter_doc_type` parameters
  - Migration: `ALTER TABLE app_documents ADD COLUMN language varchar, ADD COLUMN doc_type varchar, ADD COLUMN page_count int, ADD COLUMN has_tables bool DEFAULT false, ADD COLUMN has_images bool DEFAULT false;`
  - **Effort:** Medium | **Value:** Enables language/type pre-filtering, reduces search space

- [ ] 🟠 **Phase 6.1 — Summary-based retrieval path**
  - New column: `ALTER TABLE app_documents ADD COLUMN summary_embedding vector(1536);`
  - New RPC: `match_document_summaries` — vector search on `summary_embedding`
  - On upload: generate `summary_embedding` after `_summarize_document()` and store
  - Retrieval: when `intent == "summary"`, search document summaries instead of chunks; supplement with small number of chunks for detail accuracy
  - **Effort:** Medium | **Value:** High — current summary queries return fragmented chunk results

- [ ] 🟡 **Phase 5.2 — Parent-child indexing** (full implementation)
  - Small child chunks (128–256 tokens) indexed for precise retrieval; full parent chunks (512–1,024 tokens) returned for generation
  - Schema:
    ```sql
    CREATE TABLE app_document_parent_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid REFERENCES app_documents(id) ON DELETE CASCADE,
      chunk_index int NOT NULL,
      content text NOT NULL,
      page_number int,
      created_at timestamptz DEFAULT now()
    );
    ALTER TABLE app_document_chunks ADD COLUMN parent_chunk_id uuid REFERENCES app_document_parent_chunks(id);
    ```
  - **Recommendation:** Phase 5.3 (neighbor chunks, already done) covers most of the benefit. Only implement if retrieval metrics show clear need.

### Large Refactor / External Dependency

- [ ] 🟡 **Phase 2 — OCR abstraction layer** *(deliberately postponed — OCR pipeline in parallel project)*
  - Define `OCRResult` dataclass as unified schema (see `RAG-VERBESSERUNGSPLAN.md §2.1` for full spec)
  - Wrap existing Mistral functions in `documents.py` as `MistralOCRAdapter`
  - When ready: Docling as primary extraction path for text-based PDFs (>80 chars/page average)
  - VLM image interpretation as `[BILDBESCHREIBUNG]` block embedded directly in chunk text

- [ ] 🟡 **Phase 3 — Image storage migration** (Base64 → Supabase Storage)
  - **Depends on:** Phase 2 (OCR abstraction should come first)
  - Create Supabase Storage bucket `document-assets` (private, auth-required)
  - Store images at `{user_id}/{document_id}/{asset_id}.{ext}`, store only path in `app_document_assets.storage_path`
  - Backend generates short-lived signed URLs on demand
  - Write one-time migration script for existing Base64 rows
  - Frontend replaces `[BILD:asset_uuid]` markers with rendered images via signed URL

- [ ] 🟢 **Phase 8 — Multimodal query handling**
  - **Depends on:** Phase 3 (image storage) + Phase 2 (OCR abstraction)
  - Extend `detect_query_intent()` to recognize visual queries ("Was zeigt das Diagramm auf Seite 5?")
  - Vision-capable message constructor in `llm.py`
  - ColPali evaluation: monitor `byaldi` (RAGatouille wrapper); only adopt if OCR benchmarking shows persistent failures on table/layout-heavy documents (requires self-hosted model + Qdrant)

---

## Part 3: Feature Requirements from KVWL Analysis

Sourced from `kvml_test/` — the tender is not the goal, but the feature requirements are directly applicable as product improvements. Items already captured in the original TODO section are kept; genuinely new features found in the deeper gap analysis are added here as a separate block.

---

### 3.0 New Features from kvml_test Gap Analysis (not previously in TODO)

- [ ] 🟠 **CSV + Excel upload and parsing**
  - Currently only PDF, TXT, and image files are supported
  - Add `pandas` + `openpyxl` for `.csv`, `.xls`, `.xlsx` parsing in `documents.py`
  - Chunking strategy for tabular data: each row or logical row-group as a chunk; include column headers in every chunk (same principle as table-aware chunking Phase 5.1)
  - Store as text chunks in `app_document_chunks` — no special schema needed
  - File: `documents.py`

- [ ] 🟠 **DOCX upload and parsing**
  - `.docx` files are a common business format, currently not supported
  - Use `python-docx` to extract: paragraphs, headings, tables (as Markdown), embedded images
  - Feed output into existing chunking pipeline
  - File: `documents.py`

- [ ] 🟠 **Canvas / Artifacts renderer** (code live preview + diagrams)
  - Code blocks in responses rendered with live preview in a sandboxed `<iframe>`
  - Mermaid diagram rendering (charts, flowcharts, sequence diagrams) from fenced code blocks
  - HTML/CSS/JS preview for generated web code
  - Toggle per message: "View Code" ↔ "Preview"
  - Implementation: frontend-only, no backend changes needed; use `DOMPurify` + sandboxed iframe for security
  - File: new `Artifacts.jsx` component, integrated into `MessageBubble.jsx`

- [ ] 🟠 **Inline citations in response text**
  - Currently citations are shown as a source list below the response
  - Add inline `[1]`-style reference markers in the LLM response, linked to the source list
  - Implementation: instruct the LLM via system prompt to use `[SOURCE:N]` markers, then replace markers in frontend with clickable superscript links
  - Requires prompt engineering change in `main.py` + frontend marker replacement in `MessageBubble.jsx`

- [ ] 🟡 **Per-message feedback (thumbs up/down)**
  - Thumbs up/down button on each assistant response
  - Store: `message_id`, `user_id`, `rating` (1/-1), `timestamp` in new `app_message_feedback` table
  - Admin view: feedback overview, sortable by model/date/rating
  - Useful for: identifying bad responses, tuning RAG thresholds, model comparisons
  - File: `MessageBubble.jsx`, new `feedback.py` router

- [ ] 🟡 **Chat fork** (copy shared chat to own workspace)
  - When viewing a shared/pool conversation, "Fork" button creates a personal copy
  - New conversation with all messages duplicated, linked to original via `forked_from_id`
  - User can continue from fork independently
  - File: `storage.py` + `Sidebar.jsx`

- [ ] 🟡 **Prompt library: team/group scope**
  - Currently templates are either global or personal
  - Add a "team" scope: visible to all members of a specific pool or user group
  - DB: add `group_id` FK to `app_templates` (nullable); scope = global | group | personal
  - UI: template picker shows group templates as a separate section
  - File: `templates.py`, `TemplatePicker.jsx`

- [ ] 🟡 **Fine-grained agent sharing per group**
  - Currently global assistants are visible to everyone; no group-level sharing
  - Add `sharing_scope`: `global` | `group:{group_id}` | `private`
  - UI: assistant creation form includes scope selector
  - File: `assistants.py`, `AssistantManager.jsx`

- [ ] 🟡 **Standalone MFA / TOTP** (without Entra ID)
  - TOTP enrollment via QR code (`pyotp` + `qrcode` libraries)
  - Admin can require MFA per user group
  - On login: if MFA enabled, second step before JWT issued
  - Note: when Entra SSO is implemented, Entra's own MFA covers enterprise users; TOTP covers local/dev accounts
  - File: `auth.py`, new `MFASetup.jsx` component

- [ ] 🟡 **Full data export / exit management**
  - User can request export of all their data: conversations, documents, settings → ZIP file
  - Admin can trigger full tenant data export (all users)
  - Exported ZIP contains: `chats.json`, `documents/` folder, `settings.json`
  - Complies with DSGVO Art. 20 (data portability) and audit requirements
  - File: new `/api/export/me` endpoint in `main.py`

- [ ] 🟡 **Configurable data routing rules** (data type → model, BYOM / on-prem routing)
  - Admin can define rules: e.g. "if document type = contract → only allow local/on-prem models"
  - Rules stored in `app_routing_rules` table: `condition` (document_type, pool_id, group_id) + `allowed_model_ids[]`
  - Enforced in `llm.py` before LLM call; returns 403 with message if rule violated
  - **BYOM use case:** organisations running self-hosted inference (Llama, Qwen via Ollama or vLLM) can route sensitive pools exclusively to local endpoints — custom base URL + API-key are already supported in `providers.py`; this rule layer makes the routing automatic and enforceable rather than manual
  - Use case: sensitive/social data pools restricted to EU/local models only; general chat allowed cloud models

- [ ] 🟡 **Conditional Access / IP allowlist middleware**
  - Admin-configurable IP ranges that are allowed to access the platform
  - FastAPI middleware checks `X-Forwarded-For` / `request.client.host` against allowlist
  - If blocked: return 403 with "Access restricted to authorized networks"
  - Config: `ALLOWED_IP_RANGES` env var (CIDR notation, comma-separated)
  - Also: respect Entra ID Conditional Access policies (flagged in token claims) post-SSO

- [ ] 🟢 **SIEM / structured log export**
  - Extend audit log to support structured export formats: CSV, JSON, Syslog (RFC 5424), CEF
  - New admin endpoint: `GET /api/admin/audit/export?format=json&from=...&to=...`
  - Allows integration with enterprise SIEM systems (Splunk, Microsoft Sentinel)
  - File: `audit.py`

- [ ] 🟢 **Application monitoring** (Prometheus + Grafana)
  - Add `prometheus-fastapi-instrumentator` for automatic endpoint metrics
  - Expose `/metrics` endpoint (admin-auth protected)
  - Key metrics: request latency p50/p95, LLM call duration, RAG retrieval time, error rates, active users
  - Optional: Grafana dashboard config as code in `infra/`

- [ ] 🟢 **WCAG 2.1 accessibility**
  - Systematic accessibility pass across all UI components
  - Key requirements: keyboard navigation for all interactive elements, ARIA labels on icon-only buttons, sufficient colour contrast ratios (4.5:1 for text), focus indicators visible, screen-reader-friendly semantics (`role`, `aria-live` for streaming output)
  - Run automated checks: `axe-core` or `eslint-plugin-jsx-a11y`
  - High effort (7+ days for full compliance), but correct long-term direction for any enterprise product
  - File: all `.jsx` components; start with `MessageBubble.jsx`, `Sidebar.jsx`, `MessageInput.jsx`

- [ ] 🟢 **Self-hosted / pluggable vector database support**
  - Currently the RAG layer is hard-coupled to Supabase pgvector RPCs
  - Abstract retrieval behind a `VectorStore` interface with a pgvector implementation as default; allow alternative backends (Qdrant, ChromaDB) for customers who need on-prem RAG
  - Minimum: make the vector DB connection string and RPC names configurable via env vars so a self-hosted pgvector instance works without code changes
  - Full abstraction (Qdrant/ChromaDB support) is large effort — only if there is concrete customer demand for on-prem RAG
  - File: `rag.py` (extract retrieval calls into a thin adapter class)

- [ ] 🟢 **BYOK — Bring-your-own-Key encryption support**
  - Currently encryption keys (Fernet for stored API keys) are managed internally; hosting-provider disk encryption protects data at rest
  - BYOK allows customers to supply their own encryption key, held outside the hosting provider — the platform wraps all at-rest secrets with the customer key before storing
  - Implementation: KMS integration (AWS KMS, Azure Key Vault, or HashiCorp Vault) as the key provider; envelope encryption pattern (data key encrypted with customer master key)
  - High effort and adds operational complexity; only relevant for organisations with strict key custody requirements
  - File: `encryption.py`

---

### 3.1 Enterprise/Identity Features (originally KVWL-driven)

#### Must-have (SSO, MCP, system prompts)

- [ ] 🔴 **Azure Entra ID SSO (OIDC / OAuth 2.0)** — ~3–4 days
  - Backend: add `/auth/entra/login` + `/auth/entra/callback` using `msal` or `authlib`
  - On callback: validate ID token, extract email/display name/groups, provision user in DB
  - Frontend: "Login with Microsoft" button → redirect → callback → store JWT
  - Env vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`
  - Keep existing username/password login for local dev

- [ ] 🔴 **Model Context Protocol (MCP) support** — ~4–5 days
  - Integrate MCP Python SDK (`modelcontextprotocol`)
  - Admin UI to register MCP servers (URL + auth)
  - Route tool calls through MCP before LLM call
  - Human-in-the-loop tool confirmation UI
  - OAuth 2.0 auth flow for remote MCP servers

- [ ] 🔴 **Immutable global system prompts** (admin-defined, non-overridable by users) — ~1 day
  - Add `global_system_prompt` field to `app_settings`
  - In `llm.py`: always prepend before any user/assistant prompt
  - Admin UI: toggle + text editor; users cannot see or override it

#### High-value platform features

- [ ] 🟠 **RBAC from Entra ID groups** (~1 day post-SSO)
  - Map Entra group IDs → platform roles (admin, power_user, basic_user)
  - Store group→role mapping in `app_settings`; apply on login and token refresh

- [ ] 🟠 **Fallback model on provider failure** — ~1–2 days
  - In `llm.py`: catch provider API errors → retry with configured fallback model
  - Admin UI to configure fallback per provider; log fallback events to audit log

- [ ] 🟠 **Web search toggle** — ~3 days *(NOW: MK2)*
  - Integrate Brave Search API or Serper API
  - Per-conversation toggle (user) + default setting (admin)
  - Append search results to system prompt as context; show sources in citations
  - User-configurable filters per search: domain whitelist (e.g. trusted sources only), time range (last week/month/year/any), compliance mode toggle (excludes non-verifiable sources)
  - Admin can set default filter presets; user overrides per conversation
  - Filter state persisted per conversation in `app_conversations.search_filter_config jsonb`

- [ ] 🟠 **Audit log — extend to append-only** — ~0.5 days
  - `app_audit_logs` table, `audit.py` module, and admin UI table view already exist; LLM calls, logins, and admin actions are already logged
  - **Missing:** RLS append-only enforcement — add a new migration with `CREATE POLICY` blocking DELETE/UPDATE on `app_audit_logs`; no such policy exists today
  - **Missing:** File uploads not logged — add `audit.log_event()` calls in the upload handlers in `main.py` and `documents.py`
  - **Missing:** Token counts absent from LLM audit entries — extend `metadata` payload at `main.py:763` to include `prompt_tokens` and `completion_tokens`

- [ ] 🟠 **Token budgets and EUR cost limits** — ~2–3 days
  - Track token usage per user per period in `app_usage` table
  - Admin: set max tokens/day per user, max EUR/month per group
  - Soft warning at 80%, hard block at 100%; usage dashboard in admin panel

- [ ] 🟡 **Admin feature toggles per user group** — ~2 days
  - `app_group_settings` table: `group_id`, `feature_key`, `enabled`
  - Features: web_search, file_upload, rag, pool_creation, model_selection

- [ ] 🟡 **PDF export / conversation download** — ~1 day
  - Export conversation as PDF (reportlab) or JSON; download button in chat header
  - Include: model info, timestamps, all messages

- [ ] 🟡 **Auto-delete file retention policies** — ~1–2 days
  - `retention_days` field on pools + global setting
  - Nightly APScheduler task deletes expired files + chunks; admin config UI

- [ ] 🟡 **Upload policy config** (file types, size limits) — ~1 day
  - Admin-configurable: allowed MIME types, max file size (MB), max files per pool

- [ ] 🟡 **Default model per user group** — ~0.5 days
  - Store `default_model_id` in group settings; apply as initial model selection

- [ ] 🟡 **Tenant restriction** (KVWL-only Entra accounts) — ~0.5 days
  - Config: `ALLOWED_ENTRA_TENANT_IDS` (comma-separated); reject other tenant tokens in callback

- [ ] 🟡 **PII scrubbing** (Presidio) — ~5–7 days, 50 pts
  - Integrate `presidio-analyzer` + `presidio-anonymizer`
  - Scrub PII from outgoing LLM prompts; admin toggle per pool or globally

- [ ] 🟡 **A/B arena mode** — ~2–3 days, 20 pts
  - Split chat view with two models on same prompt; thumbs up/down per response

- [ ] 🟡 **Document comparison** — ~2–3 days, 30 pts
  - Select two documents → structured diff/comparison via LLM; side-by-side view

- [ ] 🟡 **Speech-to-text input** — ~2 days, 20 pts
  - Web Speech API (browser-native); microphone button in chat input

- [ ] 🟠 **Image generation** — ~4 days *(NOW: MK5)*
  - Integrate at least one image generation provider (e.g. DALL-E 3 via OpenAI API, or Stability AI)
  - Image generation UI in chat: dedicated input mode, prompt field, optional style/size selectors
  - Admin: enable/disable per provider, configure allowed models, set corporate style presets (brand colours, forbidden content categories)
  - Generated images displayed inline in chat; downloadable
  - No upload of sensitive image data to external services — generation-only, no inbound image processing in this feature
  - Provider key managed via existing encrypted key storage in DB

- [ ] 🟠 **UI localisation (German)** — ~1 day *(NOW: MK1)*
  - All UI strings (buttons, labels, placeholders, error messages, onboarding) available in German
  - Language toggle in user settings; default determined by browser locale or admin config
  - Minimum: full German language file covering all current UI surfaces
  - Implementation: extract hardcoded strings into a locale object (`de.js` / `en.js`), load at runtime

- [ ] 🟠 **No-code agent / workflow editor** — ~5–7 days *(NOW: MK4)*
  - Visual editor for non-technical users to define multi-step agent workflows: chain tools, set conditions, define input/output mappings
  - Each workflow node can be: LLM call, web search, RAG lookup, MCP tool call, code execution, conditional branch
  - Workflows saved as JSON in DB, executable as a custom assistant
  - UI: drag-and-drop canvas or sequential step list (step list is lower effort and sufficient for initial version)
  - Depends on MCP support for tool execution
  - File: new `WorkflowEditor.jsx`, `workflows.py` router, `app_workflows` table

- [ ] 🟠 **SharePoint RAG connector** — ~4–5 days *(NOW: KK2)*
  - Connect to Microsoft SharePoint via Microsoft Graph API (`/sites/{site}/drives/{drive}/items`)
  - Auth: OAuth 2.0 with delegated permissions (user selects which SharePoint sites/folders are accessible)
  - User explicitly selects relevant SharePoint sources per use case — no automatic full-repository indexing
  - Selected documents fetched, chunked and embedded into the existing RAG pipeline (stored in `app_document_chunks` as any other document)
  - Respects SharePoint permissions: access token scope limits which files can be fetched
  - Admin: configure allowed SharePoint tenants; user: browse and select sources in pool document manager
  - Re-sync on schedule or on demand; track `sharepoint_item_id` + `last_modified` for incremental updates
  - File: new `sharepoint.py` connector, integration into `documents.py` upload pipeline

---

## Part 4: RAG Improvements Inspired by `basline-code`

The `basline-code/rag-vrm/` directory contains a C++ codebase RAG system with a fundamentally different architecture. Despite being designed for code, several of its techniques are directly applicable to document RAG. The table below tracks overlap with both existing xqt5 versions.

**Legend:** ✅ = already present | ❌ = not present | ➡️ = needs adaptation

| Technique | Latest | DRI | Action |
|-----------|--------|-----|--------|
| Weighted RRF (3 signals) | ❌ equal weights | ❌ equal weights | **Adopt** — 4.1 |
| Payload/metadata search (3rd retrieval signal) | ❌ | ❌ | **Adopt** — 4.2 |
| Custom reranking with explicit boost signals | ❌ | ❌ | **Adapt** — 4.3 |
| BM25 corpus caching (Redis, hash-keyed) | ❌ | ❌ | **Adapt** — 4.4 |
| Per-chunk symbol/keyword extraction | ❌ | ❌ | **Adopt** — 4.5 / 4.6 |
| File-type dispatch → type-specific parser + chunker | ❌ | ❌ | **Adopt** — 4.6 |
| Content-type heuristic detection (beyond extension) | ❌ | ❌ | **New** — 4.6 |
| Code symbol extraction (AST/regex) per chunk | ❌ | ❌ | **Adapt** — 4.6 |
| start_line / end_line per chunk | ❌ | ❌ | **Adopt** — 4.6 |
| Code symbol payload search + filename boost | ❌ | ❌ | **Adapt** — 4.7 |
| Token-aware embedding batch splitting | ✅ | ✅ | Skip — already present |
| Query intent detection | partial | ✅ 3-way | Already in DRI |
| Tiered fallback retrieval | partial | ✅ multi-tier | Already in DRI |
| Table-aware chunking | ❌ | ✅ | Already in DRI — port via Part 1 |
| Heading breadcrumb injection | ✅ | ✅ | Already present |

---

### 4.1 Weighted RRF Fusion

**What baseline does:** Three independent signals with different weights fused via RRF:
```
rrf_score = vector_w/(k+rank_v) + bm25_w/(k+rank_b) + payload_w/(k+rank_p)
  vector_weight = 0.5, bm25_weight = 0.3, payload_weight = 0.2, k = 60
```

**What xqt5 does (both versions):** Equal weight `1/(k+rank+1)` across only two signals (vector + BM25).

- [ ] 🟠 **Adopt weighted RRF** — change from equal weights to `vector=0.6, BM25=0.25, payload=0.15` (bumping vector slightly for document semantics, reducing BM25 slightly since German FTS is weaker than English)
  - File: `rag.py` → `_reciprocal_rank_fusion()`
  - The `k=60` constant is correct (from original RRF paper); keep it
  - **Note:** This is a pure code change, no schema needed

---

### 4.2 Payload/Metadata as Third Retrieval Signal

**What baseline does:** Runs a separate exact-match query against indexed metadata fields (entity names, file names, class arrays) completely in parallel with vector and BM25, then fuses all three results via RRF. Chunks appearing in the payload match list get a dedicated score signal independent of semantic similarity.

**What xqt5 does:** Only two signals — vector + BM25 full-text. No metadata pre-filter as a retrieval signal.

- [ ] 🟠 **Add metadata retrieval as a third RRF signal** — for documents, the relevant payload fields to index and search are:
  - `document_type` (exact match: "Rechnung", "Protokoll", "Vertrag")
  - `section_heading` (exact or partial match against query)
  - `keywords` array (top TF-IDF terms extracted at upload time, stored per chunk or per document)
  - Implementation: new Supabase RPC `payload_search_chunks(query_terms text[], doc_filter jsonb)` that does array overlap / ILIKE on the above columns
  - Returns chunk IDs + a boolean hit marker; weight 0.15 in RRF
  - **Requires:** new columns `document_type varchar`, `keywords text[]` in `app_document_chunks` (or `app_documents` joined)
  - **Note:** This is the document-adapted version of baseline's `_payload_search()`

---

### 4.3 Custom Reranking with Explicit Boost Signals

**What baseline does:** After RRF fusion, applies a second-pass reranker that adds/subtracts explicit numeric boosts from the base score. Boosts are cumulative, clamped to [0, 1]:
- Entity name exact match in query: +0.5
- Filename match: +0.4
- Chunk type aligns with query intent: +0.3
- Query term frequency in chunk text: up to +0.25
- Payload match flag: +0.15
- Length/quality signals: ±0.03–0.05

**What xqt5 does:** No custom reranking. Optional Cohere cross-encoder (`_apply_optional_rerank()`), but that's a remote API call with latency and cost.

- [ ] 🟡 **Implement lightweight local reranker** — adapted boost signals for document RAG (no remote API):
  - `+0.4` if query contains the chunk's `section_heading` (breadcrumb match)
  - `+0.3` if `document_type` matches a type keyword in query ("Protokoll", "Rechnung", "Vertrag", etc.)
  - `+0.2` if a date mentioned in query falls within the document's date range
  - `+0.15` if chunk is from a payload-match result (exact metadata hit)
  - `+0.05 per query term` found in chunk text (capped at +0.25)
  - `-0.1` if chunk is very short (<80 chars) and not a table or heading chunk
  - Final score: `max(0, min(rrf_score + boost, 1.0))`
  - File: new `_rerank_chunks(chunks, query, intent)` function in `rag.py`
  - **Note:** The latest already has optional Cohere cross-encoder reranking (`_apply_optional_rerank()`). This local reranker is a zero-latency, zero-cost complement — no API key required, runs in-process. They serve different purposes: Cohere does deep semantic re-scoring, this does fast metadata-aware boosting. Both can coexist: local reranker first, then optional Cohere pass on the top-N.
  - **Also:** Recency and authority boost signals (Part 5.7) should be implemented as additional cases inside this reranker — not separately.

---

### 4.4 BM25 Corpus Caching (Redis)

**What baseline does:** Before computing BM25 scores, hashes the current corpus content (sampling strategy for large sets), checks Redis for a cached tokenized corpus, only tokenizes if cache miss. TTL = 1 hour.

**What xqt5 does:** Relies on PostgreSQL's built-in FTS (`ts_rank`, `tsvector`) which is not cached in application memory.

- [ ] 🟢 **BM25 result caching in Redis** — cache the merged RRF result set (not the tokenized corpus, since pgvector handles BM25 via Postgres FTS) keyed on `sha256(query + scope_id + threshold)[:16]`:
  - Hits within same conversation turn (e.g., streaming retry) skip the full retrieval
  - TTL: 300 seconds (short, conversations change)
  - Only cache if result set is non-empty
  - **Note:** Lower priority than the signal/reranking items above; Postgres FTS is already fast

---

### 4.5 Per-Chunk Keyword Extraction (for Payload Search)

**What baseline does:** Extracts `called_functions` from each chunk individually (not file-level) using regex, then stores as an array in chunk metadata. This is what powers the payload search signal.

**Document equivalent:** Extract top keywords (TF-IDF weighted) from each chunk at indexing time.

- [ ] 🟡 **Extract and store `keywords[]` per chunk** at upload/chunking time:
  - Compute TF-IDF for tokens in the chunk relative to the full document (chunk TF × inverse doc frequency)
  - Store top 10 keywords as `keywords text[]` in `app_document_chunks`
  - Used by: payload search (4.2 above), reranker term matching (4.3 above)
  - Library: `sklearn.feature_extraction.text.TfidfVectorizer` or simple token frequency counter
  - German stopword list needed (NLTK has one, or use `spacy` de_core_news_sm)
  - **Schema:** `ALTER TABLE app_document_chunks ADD COLUMN keywords text[] DEFAULT '{}';`
  - Also create GIN index: `CREATE INDEX ON app_document_chunks USING GIN (keywords);`

---

### 4.6 Content-Type Detection + Adaptive Upload Strategy

**What baseline does:** The indexer routes each file to a completely different parser and chunker based on file extension: C++ files → syntax-aware LangChain CPP splitter with entity extraction; config files (.json/.yaml/.xml) → config parser; scripts (.py/.sh) → script parser with function count; docs (.md/.txt) → generic prose chunker. Each route produces different chunk metadata tailored to the content type.

**What xqt5 does:** All uploaded files go through the same pipeline regardless of content — PDFs via Mistral OCR, text files via direct read, then the same heading/sentence-boundary chunker for everything. A `.py` file and a policy document receive identical treatment.

This is the single most structurally underexploited idea from the baseline. The concept generalises beyond C++ to any upload.

- [ ] 🟠 **Detect content type at upload time** — `detect_content_type(filename, file_bytes) -> str`
  - **Extension-based first pass** (fast, ~90% accurate):
    - `.py` → `code_python`
    - `.js`, `.ts`, `.jsx`, `.tsx` → `code_javascript`
    - `.sql` → `code_sql`
    - `.c`, `.cpp`, `.java`, `.go`, `.rs`, `.cs` → `code_generic`
    - `.json` → `config_json`
    - `.yaml`, `.yml` → `config_yaml`
    - `.xml` → `config_xml`
    - `.md` → `markdown`
    - `.csv` → `data_csv` (already planned in Part 3.0)
    - `.xlsx`, `.xls` → `data_excel` (already planned in Part 3.0)
    - `.pdf`, `.docx`, `.png`, `.jpg` → `structured_doc` (current OCR pipeline)
    - `.txt` and unknown → proceed to content heuristic
  - **Content heuristic for ambiguous files** (for `.txt`, no extension, or overrides):
    - First 500 bytes start with `{` or `[` → `config_json`
    - First line is `---` or has dominant `key: value` pattern → `config_yaml`
    - Has `def `, `import `, `class ` + Python-style indentation → `code_python`
    - Has `` ``` `` fenced code blocks → `mixed_prose_code`
    - Has `|` table rows (> 3 lines matching `^\s*\|`) → `markdown`
    - Has `function `, `const `, `let `, `=>` → `code_javascript`
    - Otherwise → `prose`
  - Store detected type as `content_type varchar` in `app_documents`
  - **Schema:** `ALTER TABLE app_documents ADD COLUMN content_type varchar DEFAULT 'prose';`
  - File: `documents.py` → new `detect_content_type()` function; called at upload before OCR/chunking

- [ ] 🟠 **Route to type-specific chunking strategy** — based on `content_type`:
  - **`prose` / `structured_doc`:** current pipeline (heading-boundary + sentence splitter) — no change
  - **`markdown`:** heading-boundary chunking (already good) + treat fenced code blocks as atomic units (same mechanism as table-aware chunking but for `` ``` `` delimiters)
  - **`code_python` / `code_javascript` / `code_generic` / `code_sql`:** use `RecursiveCharacterTextSplitter.from_language()` from LangChain with the appropriate `Language` enum — this splits at function/class/method boundaries, not sentence boundaries; preserves semantic units in code
    - LangChain `Language.PYTHON`, `Language.JS`, `Language.SQL`, `Language.CPP` etc.
    - No OCR step — read file as UTF-8 text directly
    - Overlap between chunks: 1–2 function signatures (so a caller chunk always sees the signature it references)
  - **`config_json` / `config_yaml` / `config_xml`:** store as a single atomic chunk if ≤ 2000 tokens; for larger configs, split at top-level keys only — never mid-key
  - **`data_csv`:** row-level chunking with column headers repeated in each chunk (same principle as table continuation, already planned in Part 3.0)
  - File: `documents.py` → `_chunk_by_content_type()` dispatcher

- [ ] 🟠 **Extract code symbols per chunk** — for `content_type` in `{code_python, code_javascript, code_sql, code_generic}`:
  - **Python:** use `ast.parse()` to extract function names, class names, imported module names from each chunk — far more accurate than TF-IDF keywords for code
  - **JS/TS:** regex for `function\s+(\w+)`, `class\s+(\w+)`, `const\s+(\w+)\s*=\s*(async\s*)?(function|\()` 
  - **SQL:** regex for table names from `FROM`, `JOIN`, `INTO`, `UPDATE`, `CREATE TABLE`; operation type (`SELECT`/`INSERT`/`UPDATE`/`DELETE`/`CREATE`)
  - **Generic code:** function call extraction (same pattern as baseline's `extract_called_functions`)
  - Store as `symbols text[]` in `app_document_chunks` — separate from `keywords[]` (TF-IDF for prose)
  - **Schema:** `ALTER TABLE app_document_chunks ADD COLUMN symbols text[] DEFAULT '{}';`  
    `CREATE INDEX ON app_document_chunks USING GIN (symbols);`
  - File: `documents.py` → `_extract_code_symbols(content, content_type) -> List[str]`

- [ ] 🟠 **Store `start_line` / `end_line` per chunk** — for all content types:
  - The baseline tracks exact line ranges for every chunk. xqt5 currently tracks `page_number` for PDF chunks but nothing for text/code files
  - Adding `start_line int` and `end_line int` to `app_document_chunks` enables: precise citations ("line 42–67 of auth.py"), jump-to-source links in frontend, debugging of chunking quality
  - For PDFs: derive from the `<!-- page:N -->` markers already tracked
  - For text/code: track directly during chunking
  - **Schema:** `ALTER TABLE app_document_chunks ADD COLUMN start_line int, ADD COLUMN end_line int;`

---

### 4.7 Code Symbol Payload Search (extends 4.2 + 4.6)

**What baseline does:** Payload search on `entity_name`, `all_functions`, `all_classes` gives a strong exact-match signal when a query mentions a specific function or class name. This is the payload search's most powerful use case.

**What xqt5 gains from 4.6:** Once `symbols[]` exists per chunk (from 4.6 above), code files unlock the same capability.

- [ ] 🟡 **Extend payload search RPC to include `symbols[]`** — when `content_type` is a code type:
  - Add `symbols` to the `payload_search_chunks` RPC's search targets (alongside `keywords[]`)
  - Boost weight in RRF: code symbol exact match → same weight as `keywords` payload signal (0.15)
  - In reranker (4.3): add `+0.5` if any `symbols[]` entry appears verbatim in the query (highest boost — code symbol exact match is a very strong signal, equivalent to baseline's entity_name boost)
  - File: Supabase RPC update + `rag.py` → `_payload_search_chunks()`

- [ ] 🟡 **File name as retrieval signal for code files** — the baseline boosts chunks from files whose name matches query terms (e.g., query "authentication" hits `auth.py` with `+0.4`):
  - In reranker (4.3): add `+0.35` if `app_documents.filename` (without extension, lowercased) is a substring of the query or vice versa
  - This is code-type agnostic — works for any file type but is most useful for code
  - No schema change needed — `filename` already stored in `app_documents`

---

## Part 5: Article-Derived Improvements (not yet in TODO or code)

The following items come directly from the articles in `/articles/` and are not yet covered anywhere in the existing plan.

---

### 5.1 Chunking: Figure+Caption Cohesion

**Source:** `chatgpt_ocr_pipeline_recommendations.txt` Step 5

The articles explicitly call out that figures must be kept together with their captions during chunking. The current plan handles tables (Phase 5.1, done in dri) but not figure+caption pairs.

- [ ] 🟠 **Keep figure + caption as a single atomic chunk unit**
  - When Docling extracts a figure followed by a caption paragraph, treat them as one unit — do not split between them
  - Similarly: table + its immediately preceding/following title paragraph should stay together
  - Implementation: in the OCR abstraction layer (Phase 2), tag elements with `element_type` (figure, caption, table, table_title); chunker checks for figure→caption adjacency before splitting
  - This is the document equivalent of the baseline-code's `entity_name` cohesion for code blocks

---

### 5.2 Docling HierarchicalChunker as Drop-In Alternative

**Source:** `medium_ocr.txt` Stage 2

Docling ships its own `HierarchicalChunker` that splits at section boundaries and preserves structural metadata natively. The current custom chunker in `rag.py` reimplements similar logic manually.

- [ ] 🟡 **Evaluate Docling's HierarchicalChunker** when integrating Docling (Phase 2)
  - `HierarchicalChunker` from `docling_core.transforms.chunker` respects H1/H2/H3 boundaries, paragraph breaks, and list structures natively
  - Each chunk carries Docling provenance: page number, heading path, bounding box
  - If it replaces the custom chunker, we get: better heading metadata, provenance-based page numbers (no `<!-- page:N -->` parsing needed), formula/table awareness built-in
  - Trade-off: loses the German sentence-boundary logic and the custom table continuation header logic from Phase 5.1 (dri)
  - **Recommendation:** Use HierarchicalChunker as the base; post-process its output to add: table continuation headers (5.1), contextual retrieval prefix (4.2), and breadcrumb injection

---

### 5.3 Dynamic Vision Prompt Per Image Type

**Source:** `medium_ocr.txt` (VisionRagParser default prompt + enhancements section)

The current Phase 2 plan has a fixed `vision_interpretation_prompt` config. The article describes a structured prompt that adapts based on detected image type, and flags type-detection as a high-value enhancement.

- [ ] 🟡 **Implement image-type-aware vision prompting**
  - Use a structured prompt with conditional sections (already in article, copy-adaptable):
    ```
    If CHART/GRAPH: State title + subtitle, key insights sufficient to answer any question
    If DIAGRAM/INFOGRAPHIC: Interpretation + key insights
    If PHOTOGRAPH: Brief description only
    Format: [Type]: [Title]\n- Key insight 1\n- Key insight 2
    ```
  - First pass: ask VLM to classify image type, then use type-specific follow-up prompt
  - Or: single prompt with conditional format instructions (simpler, lower cost)
  - Admin-configurable `vision_interpretation_prompt` already planned — default to this structured prompt

- [ ] 🟡 **Skip vision inference for low-value images**
  - Before sending to VLM, run a quick size/aspect-ratio heuristic: images < 50×50px or with aspect ratio typical of logos (very wide and short, or tiny squares) can be skipped
  - Alternatively: first VLM call classifies as "logo/decorative" → skip expensive interpretation call
  - Saves cost and avoids polluting chunks with logo descriptions

- [ ] 🟡 **Merge multi-page figure interpretations**
  - When Docling detects that a figure or table continues across page boundaries (same `figure_id` or matching caption), merge the interpretations into a single coherent block before chunk embedding
  - Prevents: "continued from previous page" descriptions with no context
  - Docling provenance includes bounding box and page; use this to detect continuation candidates

---

### 5.4 Formula Extraction via Docling

**Source:** `medium_ocr.txt` (VisionRagParser constructor)

Docling supports `do_formula_enrichment=True` which extracts mathematical/chemical formulas as LaTeX or structured text rather than garbled OCR output. Currently not mentioned in the OCR plan.

- [ ] 🟡 **Enable formula enrichment in Docling pipeline**
  - Set `do_formula_enrichment=True` in `DocumentConverter` pipeline kwargs
  - Relevant for: technical reports, scientific papers, financial formulae
  - Formulas become searchable text rather than image artifacts
  - Low effort once Docling is integrated (single boolean flag); include in `OCRResult` schema as `has_formulas: bool`

---

### 5.5 Topic Shift Detection for Adaptive Chunk Boundaries

**Source:** `medium_rag.txt` Solution 3 — Adaptive Chunking

Neither xqt5 version detects semantic topic shifts within sections. Both split based on heading boundaries + sentence length limits. The article describes using sentence embedding cosine similarity to detect where topics change within a section, creating chunk boundaries at those natural transitions.

- [ ] 🟡 **Topic shift detection within long sections**
  - For sections exceeding ~800 tokens (well above chunk size), run an additional split pass:
    1. Generate sentence-level embeddings for the section (fast, local, e.g., `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`)
    2. Compute cosine similarity between consecutive sentences
    3. Mark positions where similarity drops below a threshold (e.g., < 0.4) as candidate split points
    4. Create sub-chunks at those boundaries
  - This is distinct from heading-based splitting — it catches topic shifts within a single heading section
  - **Cost:** requires a local sentence embedding model; can use the same embedding model already configured, but that may be too large for per-sentence inference. Alternative: use a lightweight local model only for boundary detection
  - **German support:** `paraphrase-multilingual-MiniLM-L12-v2` supports German natively

---

### 5.6 Prev/Next Chunk Context in Each Chunk

**Source:** `medium_rag.txt` Solution 3 — Context Preservation

The article describes embedding a "summary of previous chunk" and "preview of next chunk" into each chunk's context. This is different from the neighbor chunk retrieval (Phase 5.3, done in dri) which fetches neighbors at query time. This approach bakes context into the chunk at indexing time.

- [ ] 🟡 **Embed prev/next chunk preview at indexing time**
  - After chunking, post-process the chunk list: for each chunk, prepend a 1-sentence summary of the previous chunk and append a 1-sentence preview of the next chunk
  - Format:
    ```
    [Vorheriger Abschnitt: {prev_summary}]
    {chunk_content}
    [Nächster Abschnitt: {next_preview}]
    ```
  - `prev_summary` / `next_preview`: first sentence of the adjacent chunk (no LLM call needed, just text extraction)
  - **Trade-off:** increases chunk token count by ~30–50 tokens per chunk; increases embedding cost slightly
  - **Benefit:** retrieval of an isolated chunk always has directional context, even without neighbor enrichment
  - Complements Phase 5.3 (neighbor enrichment) rather than replacing it

---

### 5.7 Recency and Authority Scoring Signals

**Source:** `medium_rag.txt` Solution 4 — Intelligent Fusion

The article describes two additional scoring signals not yet in the TODO's reranker plan (Part 4.3):

- [ ] 🟡 **Recency bonus in reranker** (+10% for recent documents)
  - If `app_documents.created_at` (or extracted `document_date`) is within last 90 days → apply +0.10 boost in reranker
  - Configurable: admin toggle + recency window (days) + boost magnitude
  - Rationale: for queries without explicit date context, more recent documents are generally more relevant for policy/procedure docs

- [ ] 🟡 **Authority/source bonus** (+15% for official/authoritative documents)
  - Allow pool admins to tag documents as "authoritative" (e.g., official policy, signed contract, final version)
  - New column: `app_documents.is_authoritative bool DEFAULT false`
  - Apply +0.15 boost in reranker for authoritative documents
  - Admin/pool-owner UI: checkbox on document upload or in document list

---

### 5.8 Retrieval Quality Metrics / Evaluation Framework

**Source:** `medium_rag.txt` — Success Metrics section

There is currently no way to measure whether RAG improvements actually help. The article lists standard IR metrics.

- [ ] 🟢 **Add retrieval evaluation endpoint** (dev/admin only)
  - New admin endpoint `POST /api/admin/rag/evaluate` accepting: `query`, `expected_document_ids[]`, `expected_chunk_ids[]`
  - Returns: Precision@5, Recall@10, MRR (Mean Reciprocal Rank), NDCG
  - Precision@5: fraction of top-5 retrieved chunks that are in expected set
  - Recall@10: fraction of expected chunks found in top-10 results
  - MRR: `1 / rank_of_first_relevant_result`
  - NDCG: normalized discounted cumulative gain (accounts for ranking position)
  - Use case: before/after comparison when testing RAG parameter changes (chunk size, relevance gate threshold, RRF weights)

- [ ] 🟢 **RAG quality dashboard in admin panel**
  - Log `max_similarity`, `chunk_count_returned`, `gate_passed` (bool) for every RAG call to `app_audit_log`
  - Admin chart: average similarity scores over time, gate rejection rate, top queries with low similarity
  - Helps tune `RAG_RELEVANCE_GATE` threshold without guessing

---

### 5.9 Multilingual Embedding Model Evaluation

**Source:** `chatgpt_ocr_pipeline_recommendations.txt` Step 6

Current system presumably uses OpenAI `text-embedding-3-small`. The articles highlight `bge-m3` and `E5-Mistral` as superior for multilingual (specifically German) and long-context documents.

- [ ] 🟢 **Evaluate bge-m3 or E5-Mistral as embedding model**
  - `bge-m3`: supports 100+ languages including German, handles up to 8192 tokens per input, open-source (BAAI), can be self-hosted
  - `E5-Mistral-7B-Instruct`: state-of-the-art multilingual embeddings, much larger but highest quality
  - Current `text-embedding-3-small`: 8191 token limit, good English, acceptable German
  - **Test:** embed a set of German document chunks with each model, run standard retrieval queries, compare Precision@5
  - **Deployment consideration:** bge-m3 can run via Ollama or HuggingFace Inference API; no new infrastructure if already using those
  - **If switching:** all existing chunks must be re-embedded (full re-index); plan a migration window

---

## Part 6: Web Research — Latest Best Practices & Open WebUI Inspiration

Sourced from web research on RAG best practices 2025/2026, Open WebUI feature set, enterprise AI platform requirements, LLM observability, and AI security standards.

---

### 6.1 UX — Now Table-Stakes

- [ ] 🟠 **Follow-up prompt suggestions**
  - After each assistant response, auto-generate 2–3 suggested next questions rendered as clickable chips
  - Now standard across ChatGPT, Perplexity, Open WebUI
  - Implementation: one async LLM call after generation completes (non-blocking); store suggestions in SSE final event or separate field in response JSON
  - Cheap model (Haiku/Flash) is sufficient; prompt: "Given this Q&A, suggest 3 short follow-up questions"
  - File: `main.py` (post-generation async call) + `MessageBubble.jsx` (chip rendering)

- [ ] 🟠 **Persistent user memory across sessions**
  - Users accumulate a memory store over time: facts, preferences, project context, corrections
  - Injected as a `[Memory]` block into the system prompt on each turn
  - User can view/edit/delete their memories; admin can clear all
  - Reference: `mem0` open-source library, or a simple `app_user_memories` table: `id, user_id, content, created_at, source_conversation_id`
  - LLM extracts new memorable facts from each conversation turn asynchronously (background task, not blocking)
  - File: new `memory.py` module + `UserMemory.jsx` settings panel

- [ ] 🟠 **Chat branching / conversation tree**
  - Fork a conversation at *any* message node — not just from the start (distinct from "chat fork" in Part 3.0 which copies entire shared chats)
  - Creates a version tree: multiple branches from the same parent message
  - DB: `app_conversations` gets `parent_conversation_id` + `branch_point_message_id` FKs
  - UI: branch icon on each assistant message; sidebar shows branched conversations grouped under root
  - File: `storage.py`, `Sidebar.jsx`, `MessageBubble.jsx`

---

### 6.2 RAG — Emerging Techniques

- [ ] 🟠 **Corrective RAG (CRAG)**
  - After retrieval, a lightweight assessor scores overall chunk quality before sending to LLM
  - If quality below threshold (e.g. all chunks < 0.5 similarity): trigger fallback — either web search (if enabled) or query reformulation loop (one rewrite + re-retrieve)
  - Different from the relevance gate (Phase 1.1 — which only gates off/on): CRAG actively attempts to *improve* retrieval when it fails
  - New function: `_assess_retrieval_quality(chunks, query) -> float` in `rag.py`
  - New function: `_corrective_retrieve(query, failed_chunks) -> list` — rewrites query and retries
  - Config: `corrective_rag_enabled: bool` (default: false), `corrective_rag_threshold: float` (default: 0.4)

- [ ] 🟠 **Adaptive RAG routing** (query complexity classifier)
  - A fast classifier decides retrieval strategy per query:
    - **Simple/factual** → skip RAG entirely, answer from model knowledge (e.g. "What is 2+2?", "Who is the current chancellor?")
    - **Medium** → standard single-pass RAG
    - **Complex/multi-hop** → multi-step agentic retrieval (multiple retrieval rounds)
  - Classifier: extend existing `detect_query_intent()` with a complexity score; or use a dedicated small model
  - Reduces unnecessary retrieval overhead and latency for simple queries
  - File: `rag.py` → `detect_query_intent()` extension, `main.py` → routing logic

- [ ] 🟡 **GraphRAG — entity graph alongside vector search**
  - At document upload: extract entity triples (person, org, concept, date, amount + relationship) via LLM
  - Store as graph: can use PostgreSQL + Apache AGE extension (Cypher queries, no separate graph DB required)
  - At query time: extract entities from query → graph traversal (2–3 hops) → retrieve associated document chunks → combine with vector results
  - Massive accuracy improvement for multi-entity relational queries ("Wer hat das Q3-Budget genehmigt?")
  - Reference: Microsoft GraphRAG (open source), `postgres-graph-rag` Python library
  - Schema: `app_entities(id, name, type, doc_id)`, `app_entity_relations(source_id, relation, target_id, doc_id)`
  - **Effort:** Large — treat as a separate project phase after core RAG is stable

- [ ] 🟡 **Automated RAG evaluation — LLM-as-judge on live traffic**
  - Goes beyond the planned eval endpoint (Part 5.8): scores *every* production RAG response asynchronously
  - Metrics per response: **groundedness** (does answer follow from retrieved chunks?), **faithfulness** (no contradictions with source?), **answer relevance** (does it address the question?)
  - Use a small/cheap model as judge; runs as background task after response is delivered
  - Scores stored in `app_audit_log`; admin dashboard shows trends over time
  - Reference: RAGAS library for metric definitions
  - Config: `rag_auto_eval_enabled: bool` (default: false) — opt-in due to cost

---

### 6.3 Security — Enterprise Requirements

- [ ] 🟠 **Document-level access control in RAG**
  - Currently: any pool member retrieves from all documents in the pool
  - Add `allowed_group_ids text[]` column to `app_documents`; empty = accessible to all pool members
  - Extend `match_document_chunks` RPC to filter by user's group memberships before ranking
  - Pool owners/admins can set document-level restrictions on upload or in document list UI
  - Critical for mixed-sensitivity pools (e.g. HR documents only visible to HR group)
  - Schema: `ALTER TABLE app_documents ADD COLUMN allowed_group_ids text[] DEFAULT '{}';`

- [ ] 🟠 **Input guardrails — prompt injection detection**
  - A layer between user input and LLM call that checks for:
    - **Pattern matching**: blocklist of known injection phrases ("ignore previous instructions", "you are now DAN", "new system prompt:", etc.)
    - **Semantic anomaly**: embed the input and compare cosine similarity against a library of known attack embeddings; flag if similarity > 0.85
  - On detection: return 400 with a generic "Input policy violation" message; log to audit log
  - Implementation: `LLMGuard` Python library (MIT license) or custom pattern list in config
  - Config: `input_guardrails_enabled: bool` (default: true), `blocklist_patterns: list` (admin-configurable)
  - File: new `guardrails.py` module; called in `main.py` before every LLM dispatch

- [ ] 🟠 **Output guardrails — response filtering**
  - After LLM generation, before returning to user: scan response for:
    - PII that the model may have introduced (separate from input PII scrubbing)
    - Policy violation patterns (same blocklist as input guardrails)
    - Anomalous instruction-following (response contains directive-style text suggesting jailbreak)
  - On detection: either redact the offending section or return a fallback message
  - File: `guardrails.py` (shared module with input guardrails)

- [ ] 🟡 **MCP tool call authorization tokens**
  - When MCP is implemented: each tool invocation requires an explicit user-granted capability token
  - Per-session tool whitelist: user approves which tools the model may call at session start
  - Rate limit tool calls per session (configurable: max N tool calls per conversation)
  - Prevents the model from autonomously invoking sensitive tools without user awareness
  - File: `mcp.py` (when implemented)

- [ ] 🟡 **Sandboxed code execution** (for Canvas/Artifacts)
  - The Canvas feature (Part 3.0) plans iframe preview — but if actual code *execution* is supported, it must be sandboxed
  - Options: Pyodide (Python in WASM, runs in browser, no server access), or a server-side Docker sandbox with no network/filesystem access
  - Do not allow arbitrary code to run in the same process as the backend or with access to env vars
  - File: `Artifacts.jsx` (browser-side Pyodide), or new `sandbox.py` (server-side Docker)

---

### 6.4 Observability — Production Grade

- [ ] 🟠 **Langfuse / OpenTelemetry trace integration**
  - Full LLM observability: every request generates a structured trace exported to Langfuse (open-source, self-hostable) or any OTel backend
  - Trace hierarchy: **Session** → **Turn** → **Spans** (LLM call, embedding, retrieval, reranking, tool call)
  - Each span captures: latency ms, token counts, cost, model, RAG chunk scores, tool name/input/output
  - More granular than the audit log (which tracks metadata); traces capture the full content
  - Langfuse has a Supabase-compatible PostgreSQL backend — can run alongside the existing DB
  - Env var: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
  - File: new `observability.py` module; instrument `llm.py`, `rag.py`, `main.py`

- [ ] 🟠 **Prompt versioning registry**
  - System prompts are currently hardcoded in `main.py` (`_inject_document_policy()`, `_auto_name_conversation()`, etc.)
  - Move to a versioned DB table: `app_prompts(id, name, version, environment, content, author, created_at, eval_score)`
  - Environments: `dev`, `staging`, `prod` — promote via admin UI
  - Backend reads active `prod` version at runtime; can hot-swap without redeploy
  - Enables A/B testing between prompt versions (route x% of traffic to version B)
  - File: new `prompts.py` module, admin UI tab

- [ ] 🟡 **Cost observability dashboard**
  - `token_tracking.py` already tracks usage — surface it properly:
  - Admin charts: spend per user, per model, per day/week/month
  - Budget alerts: notify (email or in-app) when user/group approaches their token budget threshold
  - Token efficiency: track average context utilization (are long contexts actually being used?)
  - Export: CSV download of usage data per date range
  - File: `AdminDashboard.jsx` (new Usage tab), `token_tracking.py` (aggregation queries)

- [ ] 🟡 **SCIM 2.0 user provisioning**
  - Automatic user lifecycle management from enterprise IdP (Azure AD, Okta)
  - SCIM 2.0 endpoints: `POST /scim/v2/Users`, `PUT /scim/v2/Users/{id}`, `DELETE /scim/v2/Users/{id}`, `GET /scim/v2/Groups`
  - When IdP deactivates a user: their sessions are revoked, their JWT version incremented
  - Pairs with planned Entra SSO — SCIM handles provisioning, OIDC handles authentication
  - Reference: Open WebUI has a full SCIM 2.0 implementation to reference
  - File: new `scim.py` router

---

### 6.5 Infrastructure

- [ ] 🟡 **`/ready` readiness probe** (separate from `/health`)
  - `/health` = is the process alive? (already planned in Part 6/Platform Quality)
  - `/ready` = are all dependencies reachable? Returns 200 only when DB, Redis, and pgvector are confirmed responsive
  - Used by Kubernetes readiness probes to hold traffic until the app is fully initialized
  - File: `main.py` (two separate endpoints)

---

## Part 7: Platform Quality

- [ ] 🟡 **Streaming error recovery** — Partial content + error marker when SSE stream breaks mid-response
- [ ] 🟡 **Request deduplication** — Idempotency key on `POST /chat` to prevent double-submission
- [ ] 🟡 **Background job queue for document processing** — Move PDF parsing + embedding to Celery/ARQ; return job ID immediately with polling endpoint
- [ ] 🟡 **Health check endpoint — add dependency checks** — `/api/health` exists at `main.py:169` but is a stub (`{"status": "healthy"}`); extend it to actually probe DB, Redis, and pgvector connectivity and return per-dependency status
- [ ] 🟡 **Frontend: citation link rendering** — Render `section_path` as breadcrumb in source tooltip (Phase 1.2 adds the data, this surfaces it in UI)
- [ ] 🟡 **Frontend: upload progress indicator** — Show processing stages (uploading → OCR → chunking → embedding)
- [ ] 🟢 **Semantic caching** — Skip LLM call if cosine similarity of recent query > 0.97
- [ ] 🟢 **Frontend: model cost display** — Estimated cost of conversation from token usage
- [ ] 🟢 **Frontend: keyboard shortcuts** — Submit: Ctrl+Enter, new chat: Ctrl+N, toggle sidebar: Ctrl+B

---

## Implementation Order

**Immediate (this week): RAG merge — zero risk, high quality gain**
1. Merge Phase 1.1 (relevance gate + RRF bugfix) — critical correctness fix
2. Merge Phases 1.2, 5.1, 5.3, 7.1, 7.2 — all already tested in dri
3. Merge Phases 4.2, 4.3 — contextual retrieval + document summaries

**Week of 01–07.04: KVWL MUST-criteria**
4. Immutable global system prompts (1 day)
5. Azure Entra ID SSO (3–4 days)

**Week of 07–13.04: KVWL B-criteria for scoring threshold**
6. MCP support (4–5 days)
7. Audit log + token budgets + web search (parallel where possible)

**Post-tender: RAG quality depth (pure code, no schema)**
8. Phase 6.2 — Query expansion
9. Weighted RRF fusion (Part 4.1)
10. Prev/next chunk preview baked into chunks at indexing (Part 5.6)
11. Dynamic vision prompt per image type (Part 5.3)

**Post-tender: RAG quality depth (small schema migrations)**
12. Phase 4.1 — Metadata extraction (language, doc_type, page_count)
13. Content-type detection + `content_type` column (Part 4.6) — small migration, unlocks everything below
14. Type-specific chunking dispatch for code/config/markdown (Part 4.6) — code-only, no further schema
15. Code symbol extraction per chunk + `symbols[]` column + `start_line`/`end_line` (Part 4.6) — depends on 13
16. Per-chunk keyword extraction + GIN index for prose (Part 4.5) — parallel with 15
17. Payload search as third RRF signal (Part 4.2 — depends on 15 + 16)
18. Local reranker with boost signals (Part 4.3)
19. Code symbol payload search + filename boost in reranker (Part 4.7 — depends on 15 + 18)
20. Recency + authority scoring signals (Part 5.7) — implement inside reranker (step 18)
21. `is_authoritative` flag on documents (schema part of Part 5.7 — needed for step 20)

**Post-tender: larger RAG work**
18. Phase 6.1 — Summary embeddings
19. Topic shift detection for adaptive chunking (Part 5.5)
20. Figure+caption cohesion in chunker (Part 5.1)
21. Retrieval quality metrics / eval framework (Part 5.8) + LLM-as-judge auto-eval (Part 6.2)
22. Corrective RAG / CRAG (Part 6.2)
23. Adaptive RAG routing (Part 6.2)
24. Phase 3 — Image storage migration (when OCR parallel project ready)
25. Phase 2/8 — OCR abstraction + multimodality (incl. Docling HierarchicalChunker 5.2, formula enrichment 5.4, multi-page figure merging 5.3)
26. Multilingual embedding model evaluation (Part 5.9 — bge-m3 / E5-Mistral)

**Platform & observability (ongoing)**
27. Follow-up prompt suggestions (Part 6.1)
28. Persistent user memory (Part 6.1)
29. Input/output guardrails (Part 6.3)
30. Document-level RAG access control (Part 6.3)
31. Langfuse / OTel trace integration (Part 6.4)
32. Prompt versioning registry (Part 6.4)
33. Cost observability dashboard (Part 6.4)
34. Chat branching / conversation tree (Part 6.1)
35. SCIM 2.0 provisioning (Part 6.4)
36. GraphRAG — entity graph (Part 6.2, large effort, separate phase)

---

## Technical Notes

- `bcrypt` pinned at `==4.0.1` — do not upgrade; breaks passlib
- Azure GPT: no `temperature` param, use `max_completion_tokens` not `max_tokens`, auth via `api-key` header
- All new tables: `app_*` or `pool_*` prefix convention
- FastAPI streaming endpoints: always set `response_model=None`
- pgvector must be enabled in Supabase Dashboard before any RAG table creation
- Full RAG architecture rationale: see `xqt5-ai-plattform-dri/RAG-VERBESSERUNGSPLAN.md`
- Phase completion status: see `xqt5-ai-plattform-dri/RAG-STATUS.md`
