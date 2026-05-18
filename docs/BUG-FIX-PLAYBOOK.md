# Bug-Fix-Playbook (abgeleitet aus BUG-AUDIT-2026-05-13)

**Erstellt 2026-05-13** als action-orientierter Begleiter zu `docs/BUG-AUDIT-2026-05-13.md`. Das Audit-Doc bleibt historisches Record (12 Sweep-Runden); dieses Doc ist das Working-Doc für Fix-Sessions.

Stable IDs sind die **Finding-Nummern aus BUG-AUDIT** (#1–#277). Keine Re-Numerierung — beide Docs sprechen die gleiche Sprache.

---

## 1. Fix-Workflow (pro Session)

Jeder einzelne Fix-Zyklus läuft strikt nach diesem Protokoll. **Listen-Vertrauen ist verboten** — jeder Bug wird vor dem Fix nochmal von Agenten geprüft.

### Phase A — Re-Verifikation (BEVOR Fix-Vorschlag)

User sagt z. B. „fixe #178" oder „fixe Gruppe G-Atomicity Bug 1".

Ich dispatche **drei Agenten parallel**:

| Agent | Rolle |
|---|---|
| **Informierter Verifizierer** | bekommt die Audit-Eintrag-Beschreibung + Code-Pfad; soll bestätigen ob Bug **heute noch** real ist (Code könnte sich geändert haben) |
| **Impartial-Verifizierer** | bekommt nur file:line ohne Framing; soll unabhängig urteilen |
| **Blast-Radius-Analyst** | grep-driven, kartiert ALLE Stellen die der Fix touchen würde — andere Caller, Tests, Doku, abhängige Bugs |

Output: **Re-Verifikations-Report** mit:
- Bug ist heute noch real? Y/N/Teilweise
- Schwere unverändert?
- Welche anderen Dateien sind im Fix-Scope?
- Welche anderen Bugs aus dem Audit hängen davon ab (Reihenfolge-Constraints)?
- Welche Doku-Touches sind nötig (per `feedback_doc_maintenance.md`)?

### Phase B — Bug-Erklärung + Fix-Vorschlag (BEVOR Code-Änderung)

Ich liefere User auf einer Seite:

1. **Bug in einem Satz** (was ist es)
2. **User-sichtbare Auswirkung** (was bricht heute / könnte morgen brechen)
3. **Welcher Code betroffen** (file:line)
4. **Was der Fix tut** (eine Mini-Diff-Skizze)
5. **Welche Dateien zusätzlich angefasst werden** (Doku, andere Caller)
6. **Risiken / Edge-Cases**
7. **Test-Plan** (was der User nach dem Deploy auf DEV verifizieren kann)

User entscheidet → Go / No-Go / Anpassung.

### Phase C — Fix-Execution

Bei Go:
- TaskCreate für jeden Sub-Task wenn > 2 Dateien
- Edits gemäß Plan
- Doku-Sweep (TODO/IMPLEMENTIERT/CODING/UMSETZUNGS/SECURITY/PROD-PLAYBOOK wenn relevant)

### Phase D — Self-Verifikation

Ich dispatche **einen Verifikations-Agenten**:
- Liest die geänderten Dateien
- Prüft ob der Fix den Bug tatsächlich behebt
- Prüft ob Side-Effects (was sich auch geändert haben sollte aber nicht hat)

### Phase E — Hand-back

User bekommt:
- **Was wurde geändert** (file:line + 1-Zeilen-Summary pro Datei)
- **Was der User auf DEV testen kann** (Schritt-für-Schritt: welche UI-Aktion / welche curl / welche Coolify-Log-Zeile)
- **Edge-Cases zum Beobachten**
- **Commit-Message-Block** im 3–4-Worte-Stil

User commitet und pushed selbst. Coolify zieht und rebuilded.

---

## 2. Verifikations-Status-Legende

Jeder Bug-Eintrag unten trägt einen Status. Status reflektiert die Sweep-Runden, **nicht den Code-Status** (das macht Phase A).

| Status | Bedeutung |
|---|---|
| **VERIFIED-MULTI** | von ≥2 unabhängigen Agenten über ≥2 Runden bestätigt |
| **VERIFIED-SINGLE** | nur 1 Agent — re-verify in Phase A zwingend |
| **VERIFIED-NUANCE** | bestätigt mit wichtigem Detail-Refinement |
| **DISPUTED** | Verifizierer uneinig — Phase A muss klären |
| **DOWNGRADED** | war als kritisch eingetragen, in Verifikation auf LOW gefallen |
| **REFUTED** | nicht bestätigt — bleibt für Nachvollziehbarkeit, **NICHT FIXEN** |
| **ALREADY-FIXED** | wurde in den frühen Doku-Cleanup-Sessions adressiert |

---

## 3. DEV-vs-PROD Migrations-State (Reminder)

Vor jedem Fix-Schritt der Schema- oder Daten-Modell-Wirkung hat: **Memory `project_xqt5_dev_prod_state.md` checken**.

- DEV: alle 2026-05-* Migrationen angewendet (A1, A2-vollständig, Image-Gen v1)
- PROD: keine 2026-05-* Migration; 37 Commits Lag → Prod-Catchup ist separater Track
- Migrationen via `supabase-meta /pg/query` oder Studio-Paste
- `to_regclass` nur für Tabellen/Views; Funktionen mit `pg_proc` + `pg_get_functiondef` prüfen

---

## 4. Refutations-Register — **NICHT FIXEN**

Findings die in späteren Runden refutiert wurden. Bleiben für Nachvollziehbarkeit dokumentiert:

| # | Was Round-N behauptete | Round-M widerlegte mit |
|---|---|---|
| #231 | `match_document_assets` PGRST203-Ambiguität | Beide Funktionen haben identische 6-arg-Signatur; `CREATE OR REPLACE` ersetzt sauber. Drop-Migration handhabt 5-arg-Legacy korrekt |
| #232 | Cross-Pool-Chat-IDOR via `get_pool_chat` | `main.py:2016, 2037, 2281` enforcen alle `chat["pool_id"] != pool_id` 404 |
| #233 | Admin-Edit globaler Asset wrong user_id | `allowed`-Set in `assistants.py:59` + `templates.py:52` excludet `user_id`; List-Query nutzt `.neq("user_id", user_id)` |
| #254 | `build_rag_context` `continue` vs `break` | Greedy bin-packing ist korrekt — `break` würde Budget verschwenden |
| #258 | Invite-Expiry TZ-Fragility | `.replace("Z","+00:00")` produziert tz-aware datetime; Vergleich korrekt |
| #261 | `decode_token` JWTError-Swallow | Catch-all ist intentional Security-Practice |

Falls Phase A ergibt dass einer dieser nochmal als „Bug" auftaucht: **prüfen ob R11/R12-Begründung noch gilt** bevor neuer Eintrag.

---

## 5. Already-Fixed (in frühen Doku-Cleanup-Sessions)

Diese wurden bereits adressiert. Re-Verifikation in Phase A würde "ALREADY-FIXED" liefern.

- TODO.md drift entries (3 Admin-UI-Toggles + A1 Content-Hash + A2 Bild-pHash) — als `[x]` gemarkt mit IMPLEMENTIERT-Referenz
- IMPLEMENTIERT.md:762–773 "Berührte Dateien" Pfade korrigiert (`backend/app/images.py`, `BilderTab.jsx`, `styles/images.css`)
- data_uri storage_kind in IMPLEMENTIERT, UMSETZUNGS, CODING, SECURITY ergänzt
- Stand-Stempel auf 13.05.2026 (ADMIN-, ANWENDER-, ANWENDER-QUICKSTART-DOKUMENT)
- FEATURE-DOKUMENT.md:411–432 obsoleter Block gelöscht
- IMPLEMENTIERT.md A2-Status präzisiert auf „dev-vollständig"
- Phase 3.1 Matrix-Track geparkt in `PHASE3-MATRIX-SHELVED.md`
- **#1 + #24 (2026-05-18)** — `main.py:77` Modul-Scope-Import `from .database import supabase` ergänzt (POST `/api/images/generate` chat-anchored + DELETE `/api/images/{id}` wiederhergestellt); `main.py:2382` (post-fix; audit-Zeitstand L2381) DELETE-Statement um `.eq("user_id", current_user["id"])` erweitert (TOCTOU-Window geschlossen). Phase-A-Re-Verifikation mit 4 parallelen Opus-Agenten 2026-05-18 — Audit-Scope für #1 war unterschätzt (POST-Pfad ebenfalls betroffen). Details: `IMPLEMENTIERT.md` „Bugfix #1 + #24 (2026-05-18)".

---

## 6. Critical Bug Catalog — gruppiert nach Fix-Pattern

**62 kritische Bugs** in 11 Fix-Gruppen. Jeder Bug: stable ID, file:line, status, blast-radius-hint.

### Gruppe G1 — Atomicity & Race Conditions (Pattern P1)

**Fix-Strategie:** RPC mit transaction-scoped Advisory-Lock + Partial-Unique-Indexes + Atomic-Conditional-UPDATE-RETURNING. Siehe `BEST-PRACTICES-DRAFT.md` §1.

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #2 | Daily-Cost-Cap Race (parallel Requests passieren beide) | `image_gen.py:341–349` | VERIFIED-MULTI | image_gen, image_storage, evtl. neue RPC |
| #18 / #76 | `use_invite_link` TOCTOU + lost-write | `pools.py:268–294` | VERIFIED-MULTI | pools, main.py, möglicherweise neue RPC, member-add |
| #28 | `is_default` Toggle non-atomic | `admin.py:218–221` | VERIFIED-MULTI | admin.py, model_config table; partial unique index möglich |
| #77 | `update_model_config` "no default" Window | `admin.py:218–223` | VERIFIED-MULTI | gleicher Code-Bereich wie #28 — vermutlich gemeinsam fixbar |
| #96 / #190 / #274 | `update_rag_settings` Read-Merge-Upsert Race | `admin.py:271–297` | VERIFIED-MULTI | admin.py, app_runtime_config JSONB-merge |
| #110 / #214 | Background-Rechunk-Race + Multi-Worker `_rechunk_status` | `main.py:1326–1340, 1299` | VERIFIED-MULTI | main.py, evtl. DB-State statt module-global |
| #127 / #236 | `delete_model_config` ohne `is_default`-Guard | `admin.py:242–244` | VERIFIED-MULTI | admin.py — könnte zu #28/#77 gehören |
| #128 | `add_*_message` ohne Idempotenz | `storage.py:106–112` + `pools.py:495` | VERIFIED-MULTI | storage, pools, schema (UNIQUE-Constraint + client_request_id-Header), api.js |
| #211 | `bump_token_version` Read-Modify-Write | `auth.py:171–177` | VERIFIED-MULTI | auth.py — einzelne UPDATE-Statement |
| #269 | `audit.target_id` UUID reject String-Literals | Schema `20260216_phase_d_admin_audit.sql:35` + `main.py:1338, 1447, 1464` | VERIFIED-MULTI | Migration `target_id TEXT` + audit.py + alle Caller |

### Gruppe G2 — Auth / Token Lifecycle (Pattern P11 + Backend-Auth)

**Fix-Strategie:** AuthContext mit Token-Lifecycle-Coordinator (Refresh-Mutex, Storage-Event-Sync, visibilitychange-Re-Auth) + Backend-side Refresh-Token-Rotation + Cookie-basierte Speicherung. Siehe `BEST-PRACTICES-DRAFT.md` §2 + §4.

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #20 / #222 | Refresh-Token wird nicht rotiert | `main.py:248–270` | VERIFIED-MULTI | main.py, neue `app_refresh_tokens`-Tabelle, jti-Tracking |
| #21 | JWT ohne `leeway` | `auth.py:53–60` | VERIFIED-MULTI | auth.py — Single-line-Fix |
| #54 | XFF-Rate-Limit-Bypass | `Dockerfile:48` + `main.py:157–168` | VERIFIED-MULTI | Coolify Env-Config — `FORWARDED_ALLOW_IPS` pinnen |
| #80 / #69 | `AUTH_LOGIN_FAILED` audit logged Username wortwörtlich → Password-Leak | `main.py:228–232` | VERIFIED-MULTI | main.py — username hashen oder length-only |
| #207 | Kein AuthContext im Frontend | `frontend/src/auth.jsx` (existiert nicht) + `App.jsx` + `api.js` | VERIFIED-MULTI | Große Refaktorierung — neue auth.jsx, App.jsx, alle Komponenten die User lesen |
| #208 | `tryRefresh` clearet Tokens auf JEDEM non-2xx | `api.js:68–71` | VERIFIED-MULTI | api.js — distinguish 401/403 vs transient |
| #209 | Long-Stream + Token-Ablauf, kein mid-stream-Refresh | `api.js:998–1042, 712–756` | VERIFIED-MULTI | api.js — mid-stream-Refresh-Pattern |
| #210 | Kein `token_version`-Check im Frontend | Frontend gesamt | VERIFIED-MULTI | api.js, auth.jsx — Polling oder Visibility-Re-Auth |
| #197 | Concurrent-Refresh-Storms self-throttle | `api.js:35–49` | VERIFIED-MULTI | api.js — Mutex/Singleton-Promise |
| #198 | Multi-Tab-Sync fehlt | `App.jsx:78–83` | VERIFIED-MULTI | App.jsx — `storage`-Event + `visibilitychange` |
| #212 | Username-Enumeration Timing-Oracle | `auth.py:142–150` | VERIFIED-MULTI | auth.py — Dummy-bcrypt in nicht-gefunden-Pfad |

### Gruppe G3 — Provider-Layer Hygiene (Pattern P5 + Provider-Konsistenz)

**Fix-Strategie:** Generic-Error-Taxonomy + Server-Side-Log-with-Scrub + Provider-Auth via Header + finish_reason-Normalisierung. Siehe `BEST-PRACTICES-DRAFT.md` §3.

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #9 / #263 | Fernet-Key abgeleitet aus `JWT_SECRET` — JWT-Rotation killt Provider-Keys | `encryption.py:13–15` | VERIFIED-MULTI | encryption.py, neue `ENCRYPTION_KEY` env, evtl. HKDF + Migration-Path |
| #57 / #255 | Provider-Error-Body wortwörtlich in `LLMError` → bubble an Client | `llm.py:251, 278, 301, 382, 411, 455, 498, 539` + `main.py:783, 2192` | VERIFIED-MULTI | llm.py alle 8 Call-Sites, main.py Error-Path |
| #58 / #83 | `stop_reason`/`finish_reason` ignored in ALL 4 streamers | `llm.py:_stream_anthropic/_stream_google/_stream_openai_compatible/_stream_azure` | VERIFIED-MULTI | llm.py alle 4 Streamer + messages.finish_reason-Spalte + Frontend |
| #82 / #235 | Google API-Key in URL-Query (kein Header) + Leak via Error-Body | `llm.py:296, 532` | VERIFIED-MULTI | llm.py 2 Stellen — `x-goog-api-key`-Header umstellen |
| #87 | `_call_anthropic` KeyError bei missing `text`-Field | `llm.py:282` | VERIFIED-MULTI | llm.py — `.get("text", "")` |
| #111 | Google SAFETY-Block silent empty Content | `llm.py:307, 554–560` | VERIFIED-MULTI | llm.py — finishReason/blockReason-Check + Error-Raise |
| #125 | Anthropic non-text-Block (thinking, tool_use) → empty content persisted | `llm.py:_call_anthropic`/`_stream_anthropic` | VERIFIED-MULTI | llm.py — Block-Type-Handling |
| #230 | xAI-Provider-Name-Mismatch (`xai` vs `x-ai`) | `image_gen.py:203, 254` | VERIFIED-MULTI | image_gen.py — Renaming auf `x-ai` |
| #247 | Kein Retry/Backoff anywhere in `llm.py` | `llm.py` gesamt | VERIFIED-MULTI | llm.py — Tenacity oder eigenes Backoff-Pattern |
| #274 | Cohere half-wired (`KNOWN_PROVIDERS` aber kein `PROVIDER_CONFIG`-Eintrag) | `providers.py:13` + `llm.py:18–58` | VERIFIED-MULTI | Entweder Cohere implementieren oder aus KNOWN_PROVIDERS entfernen |

### Gruppe G4 — RAG-Pipeline-Korrektheit

**Fix-Strategie:** Mix aus Code-Pfad-Fixes + Schema-Aware-Logik. Kein einzelnes Pattern, sondern punktuelle Korrekturen.

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #51 | `chunk_text` Infinite-Loop bei breadcrumb prefix ≥ chunk_size-overlap | `rag.py:298–308` + `:103` `_table_to_atoms` | VERIFIED-MULTI | rag.py 2 Stellen — Budget-Guard |
| #53 | Prompt-Injection via OCR-Content im XML | `rag.py:1329–1334` (content, filename, section) | VERIFIED-MULTI | rag.py — XML-Escape + Salted-Tags (siehe BEST-PRACTICES §5) |
| #56 | Embedding-Provider Race during Upload | `rag.py:579, 627, 667` | VERIFIED-MULTI | rag.py — settings einmal laden + durchreichen |
| #59 | Targeted Retrieval bypasst Reranker | `rag.py:861` | VERIFIED-MULTI | rag.py — `_apply_optional_rerank` auch in Targeted-Branch aufrufen |
| #79 / #130 | Unbounded `asyncio.gather` in `_apply_contextual_retrieval` + uneven embedding space | `rag.py:1228–1250` | VERIFIED-MULTI | rag.py — Semaphore + return_exceptions=True + Per-Chunk-Success-Flag |
| #268 | `enrich_with_neighbors` re-sortiert by raw `similarity` → bricht RRF + Cohere-Rerank | `rag.py:1194–1201` | VERIFIED-SINGLE | rag.py — Sort-Key spiegeln aus `_apply_optional_rerank:949–953` |
| #270 | `apply_relevance_gate` ignoriert `rerank_score` + mixt BM25/Cosinus-Skalen | `rag.py:1282` | VERIFIED-SINGLE | rag.py — separater Gate für BM25 vs Vector, oder skip wenn rerank an |

### Gruppe G5 — Streaming & Stream-Lifecycle (Pattern P8)

**Fix-Strategie:** Try/finally für Persistierung; AbortController; Status-Spalte `streaming`/`completed`/`truncated`/`failed`. Siehe `BEST-PRACTICES-DRAFT.md` §3.1.

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #10 / #131 / #234 | Stream Partial-Write-Orphan (Persistierung im try-Block) | `main.py:836–884, 2233–2270` | VERIFIED-MULTI | main.py 2 Streamer + storage.py Status-Spalte |
| #179 | `asyncio.CancelledError` leaks pending Image-Rows | `image_gen.py:392–419` | VERIFIED-MULTI | image_gen.py + möglicherweise rechunk-equivalent |
| #200 | Streaming-SSE keine AbortController | `api.js:998–1042, 712–756` | VERIFIED-MULTI | api.js — AbortController-Pattern |
| #150 | `asyncio.create_task` Referenz nicht retained | `main.py:811, 878, 2197, 2264` | VERIFIED-MULTI | main.py — `_BG_TASKS`-Set + add_done_callback |

### Gruppe G6 — File-Upload / OCR / Documents

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #52 | Concurrent same-file Upload bypassed Dedup | `documents.py:863–900` + `main.py:1056` | VERIFIED-MULTI | documents.py + neue Partial-Unique-Indexes + RPC |
| #107 / #126 | `file.read()` vor Size-Check → OOM-Vektor | `main.py:1043, 1791` | VERIFIED-MULTI | main.py 2 Stellen + Streaming-Read |
| #124 | CSV-Datenkorruption via `splitlines()` vor `csv.reader` | `documents.py:149` | VERIFIED-MULTI | documents.py — `io.StringIO(text)` |
| #132 | `_extract_docx_text` dropt Headers/Footers/Footnotes silent | `documents.py:163` | VERIFIED-MULTI | documents.py — broader docx-walking |
| #133 | Kein ZIP-Bomb/XML-Bomb-Schutz in `.docx`/`.xlsx` | `documents.py:161, 194` | VERIFIED-MULTI | documents.py + defusedxml + zipfile-Size-Cap |
| #114 | xlrd 1.2.0 unmaintained | `documents.py:223` + `uv.lock` | VERIFIED-MULTI | Migration zu python-calamine oder xls-Support droppen |

### Gruppe G7 — Pool / Member Operations

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #4 / #142 | Pool-Admin-Actions komplett unauditiert | `main.py:1564–1745, 2273` | VERIFIED-MULTI | main.py viele Stellen + audit.py-Konstanten |
| #5 | Pool-Chat `record_usage(chat_id=None)` | `main.py:2202–2208, 2247–2253` | VERIFIED-MULTI | main.py — chat_id durchreichen |
| #106 | Owner-Bypass auf `is_global=true`-Assets nach Admin-Demotion | `assistants.py:50–65` + `templates.py:43–58` | VERIFIED-MULTI | assistants.py + templates.py |
| #108 / #220 | `admin_delete_user` lying — returnt `deleted:True` aber nur deactivate | `main.py:1241–1258` | VERIFIED-MULTI | main.py + Doku — GDPR-relevant |
| #109 | Pool ohne Owner-Transfer-Endpoint + admin-delete leaves orphan | `main.py:1672–1693` + Migration | VERIFIED-MULTI | main.py + pools.py + neuer Transfer-Endpoint + UI |
| #143 | Image-Gen `parameters`-Bypass (`payload.update(parameters)`) | `image_gen.py:154–155, 207–208` + `models.py:221` | VERIFIED-MULTI | image_gen.py + models.py Allowlist |
| #149 | Pool-Chat-Write erlaubt für viewer | `main.py:2034` | VERIFIED-MULTI | main.py — Role-Bump auf editor |
| #185 | Pool-Chat Assistant-Turn ohne `user_id` | `main.py:2194, 2243` | VERIFIED-MULTI | main.py — user_id durchreichen |

### Gruppe G8 — SQL / Migration / DB-Schema

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #13 | `is_global=true` Assets `ON DELETE CASCADE` mit User-ID-FK | `20260216_phase_c_assistants_templates.sql:7,22` | VERIFIED-MULTI | Neue Migration für ON DELETE SET NULL (mit Trigger oder Schema-Split) |
| #180 | Pool-Scope-RAG-RPCs ohne `pool_members`-Check | `20260221_rag_scoped_search.sql:36–53` + `20260222_bm25_fts.sql:60–66` | VERIFIED-MULTI | Migration für 3 RPCs + SECURITY DEFINER + search_path |
| #257 | `app_image_style_presets.scope_id` keine FK | `20260513_a_image_generation.sql:46` | VERIFIED-SINGLE | Migration |
| #256 | `app_image_style_presets` Global-Uniqueness via Partial-Index NULL-distinct | `20260513_a_image_generation.sql:55–57` | VERIFIED-SINGLE | Migration — `NULLS NOT DISTINCT` oder COALESCE-Sentinel |

### Gruppe G9 — Audit & Logging Coverage (Pattern P9)

**Fix-Strategie:** Audit-Wrapper an Endpoint-Boundary + Audit-Konstanten erweitern + `target_id TEXT`. Siehe `BEST-PRACTICES-DRAFT.md` §2.5 (P9).

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #4 / #142 | (oben in Gruppe G7) | | | |
| #67 | OCR-Error wortwörtlich zum Client | `main.py:1081, 1827` | VERIFIED-MULTI | main.py 2 Stellen — generische Message + Server-side-Log |
| #80 / #69 | (oben in G2) | | | |
| #113 / #146 | Assistants/Templates CRUD unaudited | `main.py:895–953, 964–1020` | VERIFIED-MULTI | audit.py-Konstanten + main.py Wrapper |
| #187 / #269 | (oben in G1) | | | |

### Gruppe G10 — Frontend-UX & State

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #6 | Stream-Race überschreibt aktive Konversation | `App.jsx:418–437` + `PoolDetail.jsx:209–220` | VERIFIED-MULTI | App.jsx + PoolDetail.jsx — conv-id ref-pattern |
| #7 | Sidebar zeigt Chat-Liste in Bilder-View | `App.jsx:689` + Section-Handling | VERIFIED-MULTI | App.jsx — Section-Routing |
| #144 | Errors silent außerhalb Chat-View | `App.jsx:736–756` | VERIFIED-MULTI | App.jsx — globaler Error-Banner-Slot |
| #145 | ConfirmDialog Promise-Leak bei rapid second confirm | `ConfirmDialog.jsx:22–29` | VERIFIED-SINGLE | ConfirmDialog.jsx — Queue oder reject-prev |

### Gruppe G11 — Security-Headers / CORS / Misc

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #17 | Keine Security-Headers (HSTS/CSP/X-Frame/X-Content-Type) | `main.py:175–181` | VERIFIED-MULTI | main.py — neue Middleware (siehe BEST-PRACTICES §2.1) |
| #213 | CORS-Default-Origin localhost in PROD + `allow_credentials=True` | `config.py:10` + `main.py:175–181` | VERIFIED-MULTI | config.py — fail-loud bei missing env in prod |

### Gruppe G12 — Lifecycle / Startup (außerhalb Pattern-Klassen)

| # | Bug | File:Line | Status | Blast |
|---|---|---|---|---|
| #178 | Kein Admin-Bootstrap on Startup | `main.py` (Absence) | VERIFIED-MULTI | main.py — `lifespan`-Handler + `admin_user/admin_pw`-env-Lese |
| #181 | `process_document` Partial-Failure lässt Row `status='processing'` für immer | `main.py:1101–1144, 1846–1888` | VERIFIED-MULTI | main.py — try/except mit update_document_status |
| #184 | `JWT_SECRET="x"` akzeptiert | `config.py:51–52` | VERIFIED-MULTI | config.py — `len >= 32` Check |
| #182 | `pricing`-Feld silent gedroppt bei PATCH model_config | `models.py:141–146` + `admin.py:210` | VERIFIED-MULTI | models.py + admin.py — `pricing` in allowed + Field |
| #183 | `LoginRequest` ohne Length-Bounds | `models.py:57–59` | VERIFIED-MULTI | models.py — Field-Bounds |

---

## 7. Hoch / Doku-Drift (8 Findings)

Schneller Sweep, größtenteils Doku-Updates ohne Code-Risiko.

| # | Was | Datei | Status |
|---|---|---|---|
| #14 | Kein IMPLEMENTIERT-Eintrag für `20260513_b_widen_source_check.sql` | `docs/IMPLEMENTIERT.md` | VERIFIED |
| #15 | ANWENDER:55 Sidebar-Behavior-Beschreibung stale | `docs/ANWENDER-DOKUMENT.md:55` | VERIFIED-NUANCE (Mobile-only-Caveat fehlt) |
| #16 | ANWENDER:26 Flowchart sagt nur „PDF/TXT/Bild" | `docs/ANWENDER-DOKUMENT.md:26` | VERIFIED |
| #18 | (Atomicity-Gruppe G1) | | |
| #19 | Hartkodierte deutsche Strings in AdminDashboard TABS + 6 Stats-Labels | `frontend/src/components/AdminDashboard.jsx:7–15, 477–482` | VERIFIED |
| #8 | PROD-PLAYBOOK Section 3 listet nur A1+A2 als ausstehend (fehlen `20260512`, `20260513_a/b`) | `docs/PROD-UPGRADE-PLAYBOOK.md:99–106, 292–311` | VERIFIED |
| #58 / #83 | (Provider-Gruppe G3) | | |

---

## 8. Worth-fixing — Bucket-Summary (139 Findings)

**Nicht einzeln aufgelistet** — siehe `docs/BUG-AUDIT-2026-05-13.md` für jede Detail-Position. Buckets als Orientierung für Gruppen-Fix-Sessions:

| Bucket | Typischer Count | Beispiel-Findings | Empfohlene Fix-Strategie |
|---|---|---|---|
| **i18n-Sweep** (mechanisch) | ~15 | #19, #157, #168, #262 + viele hartkodierte deutsche Strings in NavRail, Sidebar, PoolList, PoolChatList, PoolChatArea, ConfirmDialog, SourceDisplay | react-i18next + ICU adoption, gradueller Sweep |
| **Pydantic `extra='forbid'`** | ~8 | #115, #134, #135, #136, #137 + LoginRequest, alle Update-Models | `model_config = ConfigDict(extra='forbid')` global + Field-Bounds |
| **N+1 Database** | ~6 | #12, #30, #41, #62, #71 + storage.list_conversations, pool_chats aggregator, list_members | Single-Query mit IN(...) oder RPC |
| **Audit-Coverage-Gaps** | ~10 | #4, #80, #113, #146, #189, #269 + Doc-Delete, Conv-PATCH, audit-logs-read | audit.py-Konstanten + Endpoint-Wrapper |
| **Provider-Error-Body / Secret-Leak** | ~6 | #57, #67, #82, #90, #235, #255 + embedding-error | generic 502 + scrub-regex + server-log |
| **Frontend-Auth-Edges** | ~10 | (siehe G2 oben — bereits in kritisch) | gleicher Fix wie G2 |
| **SECURITY DEFINER + search_path fehlt überall** | ~3 | #219, #N3/#N4 aus späten Runden | Migration für alle PL/pgSQL-Funktionen |
| **Frontend Forms / Validation** | ~12 | #64, #93, #94, #95, #112, #115, #143, #156, #166 + maxLength-Lücken in MessageInput, AssistantManager, TemplateManager, CreatePoolDialog | Backend-Field-Bounds + Frontend maxLength + extractDetail-Konsistenz |
| **Stream-Edge-Cases** | ~5 | #61, #86, #88, #131, #200 | Stream-Error-Handler-Pattern aus BEST-PRACTICES §3 |
| **Misc Cleanup** | ~50 | Inline-Styles, Modal-Stacking, dead-code, MIME-Sniffing, etc. | Punktuell |

---

## 9. File-Cross-Reference-Index

Welche Dateien werden von wie vielen Bugs touched? Hilft Sequenzierung wenn mehrere Bugs gemeinsam fixbar.

| Datei | Bug-Anzahl | Hauptcluster |
|---|---|---|
| `backend/app/main.py` | 30+ | Audit-Coverage, Atomicity, Stream-Handler, OOM, Pool-Admin |
| `backend/app/llm.py` | 12 | Provider-Layer komplette Gruppe G3 |
| `backend/app/rag.py` | 10 | RAG-Pipeline G4 + chunking-loop + prompt-injection |
| `backend/app/image_gen.py` | 8 | Cost-Cap, Params-Bypass, CancelledError, xAI-Mismatch |
| `backend/app/admin.py` | 7 | Atomicity-Gruppe G1 |
| `backend/app/auth.py` | 6 | Auth-Lifecycle G2 |
| `backend/app/audit.py` | 4 | target_id-Cast, sync-async, truthiness, retention |
| `backend/app/storage.py` | 5 | Idempotency, get_conversation, cascade |
| `backend/app/pools.py` | 5 | use_invite_link, get_pool_chat, list_members, role-validation |
| `backend/app/documents.py` | 6 | OCR-Edges, ZIP-Bomb, CSV, docx, content-hash |
| `frontend/src/api.js` | 10 | Auth-Flow G2 + Stream-Auth + Error-Handling |
| `frontend/src/App.jsx` | 8 | Stream-Race, Section-Handling, ErrorBoundary, Multi-Tab |
| `frontend/src/components/AdminDashboard.jsx` | 8 | i18n, Tabs, Polling, Form-State |
| `supabase/migrations/*.sql` | 12 | SECURITY DEFINER, partial-indexes, FK-Cascades, Pool-RPC-Membership |
| `backend/app/models.py` | 9 | Pydantic-extra-forbid, Field-Bounds (temperature, length, etc.) |

---

## 10. Known Dependencies / Sequencing

Manche Bugs hängen voneinander ab — Reihenfolge matters:

- **G2 Frontend-Auth** muss VOR G1-Atomicity-Token-Bumps gefixt werden — sonst rotiert Backend Token aber Frontend kommt damit nicht klar
- **#9 Fernet-Key-Coupling** und **#178 Admin-Bootstrap** sollten gemeinsam — falls Admin-Bootstrap mal kommt, sollte Encryption-Key bereits sauber sein
- **#180 Pool-RPC-Membership** ist Defense-in-Depth; wirklich blockierend nur wenn RLS aktiviert wird (Roadmap-Item)
- **#178 Admin-Bootstrap** sollte vor Prod-Catchup-Merge stehen — sonst hat PROD weiter keinen Admin
- **#269 audit.target_id UUID** sollte vor allen anderen Audit-Coverage-Fixes — sonst landen neue Audits ebenfalls im UUID-Reject

---

## 11. Pattern-Fix-Reihenfolge (Empfehlung)

Wenn der User „mach mal Pattern-Fix P1" sagt, hier die empfohlene Reihenfolge der Pattern:

1. **P5 Provider-Error-Body** (1 Tag, ~8 Findings) — kleinster Scope, höchste Security-Wirkung
2. **#1 supabase NameError** (1 Zeile) — sofort als Quick-Win
3. **#230 xAI-Provider-Mismatch** (1 Zeile)
4. **#54 XFF Rate-Limit** (Coolify-Env-Var-Change)
5. **P9 Missing-Audit** (~2 Tage, ~10 Findings) — inkl. #269 target_id TEXT zuerst
6. **P1 Atomicity** (~3–5 Tage, ~12 Findings) — vor allem #110 Rechunk, #2 Cost-Cap, #128 Idempotency
7. **G6 File-Upload-Hardening** (~1–2 Tage)
8. **P11 Frontend-Auth** (~4–6 Tage) — größte Refaktorierung, AuthContext-Migration
9. **G3 Provider-Layer rest** — stop_reason, Anthropic non-text, retry-backoff
10. **G4 RAG-Pipeline-Korrektheit** — #51 Loop, #53 Injection, #268 re-sort
11. **G10 Frontend-UX** — Stream-Race, Section-Handling, Error-Banner
12. **i18n-Sweep** zum Schluss — mechanisch, kann jederzeit

---

## 12. Was zu tun wenn ein Bug-Fix einen Neuen aufdeckt

In jeder Fix-Session ist es möglich dass beim Untersuchen eines Bugs **ein neuer auftaucht**. Dann:

1. Den neuen Bug stoppen — nicht im gleichen Fix mit machen
2. Nummer >277 zuweisen (nächste freie ID)
3. Eintrag in BUG-AUDIT-2026-05-13.md unter „Spätere Findings" anhängen
4. In dieses Playbook in passende Gruppe einsortieren
5. Status: VERIFIED-SINGLE (entdeckt durch Code-Read, nicht durch Sweep)
6. Phase-A-Re-Verifikation in der **nächsten** Session wo der User ihn explizit anpackt

---

## 13. Verweise

- **Source-of-Truth für Findings:** `docs/BUG-AUDIT-2026-05-13.md` (12 Sweep-Runden, ~249 Findings dokumentiert)
- **Fix-Pattern-Best-Practices:** `docs/BEST-PRACTICES-DRAFT.md` (11 Pattern-Klassen mit Code-Beispielen + Online-Quellen)
- **DEV/PROD-State:** `~/.claude/projects/-home-dri-code/memory/project_xqt5_dev_prod_state.md`
- **Doku-Disziplin:** `~/.claude/projects/-home-dri-code/memory/feedback_doc_maintenance.md`
- **Commit-Message-Format:** `~/.claude/projects/-home-dri-code/memory/feedback_git_and_commits.md`
- **Phase-3-Track-Status:** `docs/PHASE3-MATRIX-SHELVED.md`
