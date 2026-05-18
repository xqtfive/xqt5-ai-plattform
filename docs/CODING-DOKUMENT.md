# Coding-Dokument

## Ziel
Dieses Dokument hält Coding-Entscheidungen und Fehlerjournal fest, damit Fehler nicht wiederholt werden.

## Coding-Regeln (für dieses Projekt)
1. Frontend und Backend bleiben strikt getrennt deploybar.
2. Alle neuen APIs werden zuerst mit Request-/Response-Modellen typisiert.
3. Jede DB-Änderung erfolgt über versionierte Migrationen in `supabase/migrations/`.
4. Secrets werden nie in Code oder Commit gespeichert, nur via Env.
5. CORS und Security-Header werden für produktive Domains explizit gesetzt.
6. Keine Funktions- oder Codeübernahme aus `llm-council`; ausschließlich API-basierte Anbindung.
7. In Code und Dokumentation wird nicht auf externe Wettbewerbs-Produktnamen verwiesen.
8. **Provider-Namen-Konvention:** Provider-Identifier folgen der Liste in `backend/app/providers.py:KNOWN_PROVIDERS`. xAI = `"x-ai"` (mit Hyphen), niemals `"xai"`. Diese Namen werden 1:1 in `app_model_config.provider`, `app_provider_keys.provider`, `PROVIDER_KEYS` (config.py), und `PROVIDER_CONFIG` (llm.py) verwendet. Neue Code-Pfade müssen den kanonischen Namen aus `KNOWN_PROVIDERS` lesen oder darauf vergleichen — keine eigenen String-Literale erfinden. Hintergrund: Bug #230 (2026-05-18) zeigte einen kompletten Image-Gen-Pfad tot wegen `"xai"`-vs-`"x-ai"`-Mismatch.

## Fehlerjournal

### 2026-02-14
- Fehler: `python -m compileall` initial ohne `PYTHONPYCACHEPREFIX` ausgeführt.
  Ursache: In der Sandbox wurde in einen nicht erlaubten Standard-Cachepfad geschrieben.
  Korrektur: Compile-Checks künftig mit `PYTHONPYCACHEPREFIX=/tmp/pythoncache` ausführen.

### 2026-02-15 (Phase A)
- **Fehler: llm-council-Tabellen für Chat wiederverwendet.**
  Ursache: Die bestehenden `conversations`/`messages` Tabellen (mit stage1/stage2/stage3 Pipeline-Feldern) wurden fälschlicherweise für den direkten Chat mitbenutzt, statt eigene Tabellen anzulegen.
  Korrektur: Eigene Tabellen `chats` und `chat_messages` erstellt. **Regel: llm-council-Tabellen (conversations, messages, token_usage) nie für eigene Features nutzen. Immer eigene Tabellen anlegen.**

- **Fehler: Python 3.11 inkompatible Type-Annotation `StreamingResponse | dict`.**
  Ursache: Union-Syntax mit `|` in Return-Type ist in Python 3.11 kein valider Pydantic-Typ für FastAPI Response-Models. Docker-Image nutzt Python 3.11-slim.
  Korrektur: `response_model=None` im Decorator verwenden, Return-Type-Annotation weglassen. **Regel: Bei Endpoints die sowohl JSON als auch StreamingResponse zurückgeben, immer `response_model=None` setzen und keine Union-Type-Annotation verwenden.**

- **Fehler: stage3-Referenzen in neuem Code übernommen.**
  Ursache: Beim Bauen von storage.py und Frontend wurde aus dem bestehenden Code die `stage3.answer`-Logik kopiert, obwohl die neuen `chat_messages` keine stage-Felder haben.
  Korrektur: Alle stage1/stage2/stage3/metadata-Referenzen aus storage.py, main.py und ChatArea.jsx entfernt. **Regel: Neuen Code nicht blind aus bestehendem Code kopieren — immer prüfen ob die Felder in der Ziel-Tabelle existieren.**

### 2026-02-15 (Phase B)
- **Fehler: Shared `users` Tabelle mit llm-council verwendet.**
  Ursache: Die `users` Tabelle aus der initialen Migration wurde als "Shared" behandelt, obwohl beide Anwendungen komplett getrennt sein sollen. Register schlug fehl ("Email already exists") weil llm-council bereits Einträge hatte.
  Korrektur: Eigene `app_users` Tabelle erstellt, FKs von `chats` und `chat_token_usage` umgehängt. **Regel: KEINE shared Tabellen. Jede Anwendung nutzt ausschließlich eigene Tabellen.**

### 2026-02-16 (Phase D — Azure OpenAI + Provider-Keys)
- **Fehler: Azure GPT-5.x akzeptiert keine Temperature != 1.**
  Ursache: Azure's GPT-5.x Modelle unterstützen nur den Default-Wert `temperature=1`. Jeder andere Wert führt zu einem API-Fehler.
  Korrektur: Temperature-Parameter wird bei GPT-5.x Modellen nicht mitgesendet. **Regel: Bei neuen Azure-Modellen immer prüfen, welche Parameter unterstützt werden.**

- **Fehler: Azure Endpoint-URL enthielt Pfad-Komponenten.**
  Ursache: User gaben die volle Azure-URL inkl. `/openai/deployments/...` ein, aber der Code baut den Pfad selbst auf, was zu doppelten Pfaden führte.
  Korrektur: Auto-Strip von Pfad-Komponenten — nur Schema + Host werden aus der konfigurierten URL übernommen. **Regel: Endpoint-URLs immer normalisieren.**

- **Fehler: Azure verwendet `api-key` Header statt `Authorization: Bearer`.**
  Ursache: Azure OpenAI nutzt ein anderes Auth-Schema als Standard-OpenAI. Der generische Bearer-Token-Ansatz wurde fälschlicherweise verwendet.
  Korrektur: Eigene `_azure_headers()` Funktion mit `api-key` Header. **Regel: Provider-spezifische Auth immer in eigener Funktion kapseln.**

- **Fehler: `max_tokens` statt `max_completion_tokens` bei GPT-5.x.**
  Ursache: GPT-5.x Modelle akzeptieren nur `max_completion_tokens`, nicht das ältere `max_tokens` Feld.
  Korrektur: Für GPT-5.x wird `max_completion_tokens` verwendet. **Regel: Azure-Request-Body-Aufbau in eigener Funktion mit Modell-spezifischer Logik.**

- **Fehler: Azure Deployment-Name != Model-Name.**
  Ursache: Azure nutzt Deployment-Names (z.B. `gpt-4o-deployment`) statt Model-Names (z.B. `gpt-4o`) in der API-URL. Ohne Mapping schlug der Call fehl.
  Korrektur: Eigene `deployment_name` Spalte in `app_model_config` mit Lookup in `_azure_url()`. **Regel: Azure-Modelle immer mit deployment_name in app_model_config anlegen.**

### 2026-02-16 (Phase C Schritt 2 — RAG)
- **Hinweis: pgvector Extension muss vor Migration aktiviert werden.**
  Die `vector`-Extension wird per `CREATE EXTENSION IF NOT EXISTS vector` in der Migration aufgerufen, muss aber in Supabase unter Dashboard → Database → Extensions vorab aktiviert sein.
- **Hinweis: OpenAI API-Key für Embeddings zwingend erforderlich.**
  Embeddings laufen über OpenAI (text-embedding-3-small). Ohne konfigurierten OpenAI-Key schlägt der Upload fehl. Key kann via Env oder Admin-Provider-UI gesetzt werden.
- **Hinweis: Supabase RPC `match_document_chunks` benötigt pgvector-Operatoren.**
  Die Funktion nutzt `<=>` (Cosine Distance). Ohne pgvector Extension schlägt die Suche fehl.

### 2026-02-17 (Security Hardening)
- **Rate Limiting mit slowapi + Redis**: 7 kritische Endpoints mit per-User/per-IP Limits versehen (Register 5/min, Login 10/min, Refresh 30/min, Message 60/min, Upload 20/min, RAG-Search 60/min, Provider-Test 20/min). Fallback auf In-Memory wenn kein Redis konfiguriert.
- **Token Version Revocation**: Neue `token_version` Spalte in `app_users`. Bei User-Deaktivierung wird `bump_token_version()` aufgerufen, alle bestehenden Tokens werden sofort ungültig. Access- und Refresh-Token prüfen `token_version` bei jeder Validierung.
- **is_active Enforcement auf Refresh**: Deaktivierte User können nicht nur keine neuen Access-Tokens nutzen, sondern auch kein Refresh durchführen. Fehlermeldung: "Account is inactive".
- **Proxy-Headers**: Uvicorn mit `--proxy-headers` und `FORWARDED_ALLOW_IPS` für korrekte IP-Erkennung hinter Coolify-Proxy.

### 2026-02-17 (OCR für PDFs/Bilder)
- **OCR via Mistral OCR API**: `extract_text()`/`extract_text_and_assets()` sind async und nutzen für PDF/Bild den Mistral-OCR-Flow direkt.
- **Mistral OCR API**: `POST https://api.mistral.ai/v1/ocr` mit `mistral-ocr-latest` Modell. PDF wird als base64 data-URI gesendet, Antwort enthält Markdown pro Seite.
- **API-Key**: Via `providers.get_api_key("mistral")` (DB mit Env-Fallback). Ohne Key gibt es eine klare Fehlermeldung.
- **Keine System-Pakete**: Kein Tesseract/Poppler im Docker nötig — rein API-basiert.
- **Timeout**: 120s für große PDFs (httpx AsyncClient).
- **Env-Vars für OCR-Verhalten** (beide in `config.py`, Default `true`):
  - `MISTRAL_OCR_STRUCTURED` — Wenn `true`, wird die Mistral-OCR-API im strukturierten Modus aufgerufen (JSON-Output mit Seiten + Text). Auf `false` setzen für reinen Markdown-Output.
  - `MISTRAL_OCR_INCLUDE_IMAGE_BASE64` — Wenn `true`, werden extrahierte Seitenbilder als base64 mitgeliefert und in `app_document_assets` gespeichert (für Bild-RAG). Auf `false` setzen um Speicher/Bandbreite zu sparen.

### 2026-02-17 (Admin User Löschen + Default-Modell Fix)
- **Admin User Soft-Delete**: Neuer `DELETE /api/admin/users/{user_id}` Endpoint. Setzt `is_active=false` und ruft `bump_token_version()` auf. Selbstschutz: Admin kann sich nicht selbst löschen (400). Frontend: Löschen-Button pro Zeile, deaktiviert für eigenen User, `confirm()` Dialog.
- **Deaktivierte User ausblenden**: UsersTab zeigt standardmäßig nur aktive User. Checkbox "Deaktivierte anzeigen" blendet inaktive User grau ein (`.user-inactive td { opacity: 0.5 }`).
- **Fehler: Default-Modell aus Admin-Dashboard wurde ignoriert.**
  Ursache: Frontend hatte `const DEFAULT_MODEL = 'google/gemini-3-pro-preview'` hardcoded. Die `is_default`-Einstellung aus `app_model_config` wurde weder von der `/api/models`-API zurückgegeben noch vom Frontend abgefragt.
  Korrektur: `get_available_models()` gibt jetzt `is_default` mit. Frontend sucht zuerst ein `is_default && available` Modell, Fallback auf erstes verfügbares. **Regel: Admin-konfigurierbare Defaults immer aus der DB lesen, nie im Frontend hardcoden.**

- **Fehler: Default-Modell griff trotz Fix nicht bei neuen Chats (Frontend + Backend).**
  Ursache (Backend): `send_message()` nutzte `DEFAULT_MODEL` env-var als Fallback, ohne die DB nach `is_default` zu fragen.
  Ursache (Frontend): Bei "New Conversation" wurde `selectedModel` nicht auf den DB-Default zurückgesetzt. Neue Conversations haben `model=null`, das useEffect ignorierte diesen Fall und behielt den vorherigen Wert bei.
  Korrektur (Backend): Neue Funktion `admin.get_default_model_id()` liest `is_default=true && is_enabled=true` aus `app_model_config`. In `send_message()` wird diese vor `DEFAULT_MODEL` abgefragt.
  Korrektur (Frontend): Neuer State `defaultModelId` speichert das API-Default-Modell. Bei Conversation-Wechsel wird `selectedModel` immer gesetzt: `activeConversation.model || defaultModelId`.
  **Regel: Fallback-Ketten immer End-to-End durchdenken — sowohl Frontend-UI als auch Backend-Verarbeitung müssen den DB-Default kennen.**

### 2026-02-18 (Phase E — Pools)
- **Pools: Geteilte Dokumentensammlungen mit RAG implementiert.**
  5 neue Tabellen (`pool_pools`, `pool_members`, `pool_invite_links`, `pool_chats`, `pool_chat_messages`), `app_documents` erweitert um `pool_id`, `match_document_chunks()` RPC erweitert um `match_pool_id`.
- **Neues Backend-Modul** `pools.py`: Pool CRUD, Members, Invite Links, Pool Chats und Dokumentvorschau.
- **8 neue Frontend-Komponenten**: PoolList, CreatePoolDialog, PoolDetail, PoolDocuments, PoolChatList, PoolChatArea, PoolMembers, PoolShareDialog.
- **Design-Entscheidung**: `app_documents` wiederverwendet statt eigener `pool_documents` Tabelle — hält gesamte Embedding-Pipeline (Chunking, Embedding, Search) unverändert.
- **Design-Entscheidung**: Owner ist NICHT in `pool_members` — Ownership implizit über `pool_pools.owner_id`. Vereinfacht Ownership-Transfer und verhindert Inkonsistenzen.
- **Design-Entscheidung**: Pool-Chats sind separate Tabellen (`pool_chats`/`pool_chat_messages`), nicht die bestehenden `chats`/`chat_messages`, weil Pool-Chats Multi-User-Zugriff mit Username-Attribution brauchen.
- **Berechtigungsmodell**: 4 Stufen — Viewer (lesen + fragen), Editor (+ Dokumente), Admin (+ Mitglieder), Owner (implizit, Pool löschen). Role-Check via `require_pool_role()`.

### 2026-02-19 (RAG Bug-Fix — Conversations)

- **Fehler: `match_chat_id = NULL` in SQL (PostgreSQL NULL-Semantik).**
  Ursache: `_rpc_chunks()` sendete immer `"match_chat_id": chat_id`, auch wenn `chat_id=None`. PostgreSQL evaluiert `d.chat_id = NULL` zu UNKNOWN (nicht TRUE) → keine Conversation-Dokumente gefunden.
  Korrektur: Parameter nur inkludieren wenn `is not None` (analog zu `match_pool_id`). **Regel: Nullable RPC-Parameter nie als `null` senden — ganz weglassen wenn nicht relevant.**

- **Fehler: PGRST203 — Function Overload Ambiguity nach SQL-Migrationen.**
  Ursache: `CREATE OR REPLACE FUNCTION` mit geänderten Parametern erstellt eine **neue Überladung**, ersetzt die alte nicht. PostgREST konnte bei Aufruf ohne `match_pool_id` nicht zwischen der alten 5-Parameter-Version und der neuen 6-Parameter-Version (`match_pool_id DEFAULT NULL`) unterscheiden → Exception bei allen Conversation-RAG-Anfragen.
  Korrektur: Migration `20260219_drop_old_function_overloads.sql` droppt die alte Signatur explizit vor der neuen Erstellung. **Regel: Bei Parameteränderungen an SQL-Funktionen immer `DROP FUNCTION IF EXISTS old_signature` vor dem neuen `CREATE OR REPLACE`.**

- **Fehler: RAG-Injection Exception verhinderte Text-Fallback.**
  Ursache: Der gesamte RAG-Block (Vector-Suche + Context-Injection + Text-Fallback) lag in einem `try/except`. Eine Exception in der Vector-Suche verhinderte auch den Text-Fallback.
  Korrektur: Vector-Suche und Context-Injection in separate `try/except`-Blöcke aufgeteilt. Text-Fallback läuft jetzt unabhängig von der Vector-Suche.

- **Fehler: RAG_TOP_K=5 + threshold=0.3 verfehlte semantisch schwach rankende Kapitel.**
  Ursache: Listenbasierte Kapitel (z.B. "Projektrollen") haben niedrige Kosinus-Ähnlichkeit zu Fragebogen-Queries obwohl direkt relevant. Mit nur 5 Chunks wurden solche Kapitel nie geliefert.
  Korrektur: Conversations nutzen jetzt `top_k=50, threshold=0.0` — alle Chunks werden nach Ähnlichkeit sortiert, dann in Dokumentreihenfolge (`chunk_index`) ans LLM übergeben. Cohere Reranker (optional) selektiert beste Chunks aus dem breiten Kandidatenset.

- **Design-Entscheidung: globale Dokumente bleiben API-seitig möglich.**
  Scope-spezifische Retrieval-Pfade wurden bereinigt; globale Dokumente (`chat_id IS NULL`) sind weiterhin als eigener Scope vorhanden, während Hauptflüsse im UI auf Conversation/Pool fokussieren.

- **Hybrid Search: Vector + Keyword ILIKE.**
  Keyword-Supplement via `_keyword_supplement_chunks()` stellt sicher, dass Chunks mit spezifischen Begriffen auch bei niedrigem Vektor-Score im Kandidatenset landen. Stopwörter (DE+EN) werden gefiltert, min. 4 Zeichen. Keyword-Chunks werden vor Cohere-Reranking angehängt.

### 2026-02-19 (PoolsViewer — Dokumentvorschau)
- **Feature: Pool-Dokumentvorschau ergänzt.**
  Neuer Endpoint `GET /api/pools/{pool_id}/documents/{document_id}/preview` liefert Textvorschau für PDF/TXT sowie optional Bilddaten für Bild-Uploads.
- **Berechtigung:** Vorschau ist ab Rolle `viewer` verfügbar (`require_pool_role(..., "viewer")`).
- **Robustheit:** Asset-Lookup für Bildvorschau ist defensiv implementiert (Fehler beim Lookup brechen die Vorschau nicht komplett ab).
- **Frontend:** `PoolDocuments.jsx` hat einen `Vorschau`-Button pro Dokument plus Modal für Text-/Bildansicht; lange Texte werden gekürzt dargestellt (`truncated`, `text_length`).

### 2026-02-21 (RAGtext — Pool Text Paste Input)
- **Feature: Text direkt als RAG-Dokument in Pools einfügen.**
  Neuer Endpoint `POST /api/pools/{pool_id}/documents/text` nimmt `title` + `content` entgegen, konvertiert den Text in eine temporäre TXT-Datei und führt ihn durch dieselbe RAG-Pipeline (Chunking + Embedding) wie dateibasierte Uploads.
- **Pydantic-Model:** `UploadPoolTextRequest` (title: str, content: str).
- **Berechtigung:** Mindestrolle `editor`; Rate Limit 20/min analog zu `/documents/upload`.
- **Design-Entscheidung:** Kein separater Code-Pfad — Text wird mit `SpooledTemporaryFile` als `UploadFile` verpackt und über die vorhandene `process_document()`-Pipeline verarbeitet.

### 2026-02-22 (RAGplus — Verbesserte Chunking-Strategie + BM25 + UX)

- **Neues Chunking-System: Markdown-Section-aware + Token-basiert**
  - Ersetzt: Einfaches Paragraph-Splitting (character-basiert).
  - `chunk_text()` erkennt Markdown-Überschriften, respektiert Sektionsgrenzen, fügt Breadcrumb-Header in jeden Chunk ein (z. B. `## Kapitel > ### Unterkapitel`), damit Retrieval-Ergebnisse ohne Kontext verständlich sind.
  - Chunk-Größe und Overlap werden in **Tokens** (tiktoken, cl100k_base) gemessen, nicht mehr in Zeichen.
  - `CHUNK_SIZE`: 512 Tokens (war 1500 Zeichen), `CHUNK_OVERLAP`: 50 Tokens (war 200 Zeichen).
  - Neue Dependency: `tiktoken>=0.7.0`.

- **Fehler: `chunk_text()` erzeugte leere Chunks bei direkt aufeinander folgenden Überschriften.**
  Ursache: Wenn eine Parent-Heading direkt von einer Sub-Heading gefolgt wird (kein Inhalt dazwischen), wurde ein Chunk mit nur dem Breadcrumb-Header, aber ohne echten Inhalt erstellt.
  Korrektur: Flush-Bedingung von `if current_lines or heading_stack` auf `if any(line.strip() for line in current_lines)` geändert. **Regel: Chunks ohne echten Inhalt nie emittieren.**

- **BM25 via PostgreSQL Full-Text Search — Ersetzt ILIKE-Keyword-Supplement**
  - Migration `supabase/migrations/20260222_bm25_fts.sql`:
    - `content_fts tsvector GENERATED ALWAYS AS (...) STORED` in `app_document_chunks`
    - GIN-Index für schnelle FTS-Queries
    - `keyword_search_chunks()` RPC: `websearch_to_tsquery('german', ...)` + `ts_rank_cd(content_fts, query, 32)`, scope-isoliert (conversation/pool/global)
  - Hybrid Search: Vector-Suche + BM25 werden per **Reciprocal Rank Fusion (RRF, k=60)** gemergt.
  - Entfernt: `_extract_query_keywords()`, `_keyword_supplement_chunks()`, `_GERMAN_STOPWORDS`.
  - Hinweis: `DROP FUNCTION IF EXISTS keyword_search_chunks(text, uuid, int, uuid, uuid)` vor der neuen RPC-Erstellung ausführen, um PGRST203 zu vermeiden (→ Präventiv-Maßnahme aus 2026-02-19).

- **Fehler: Rechunk-Polling — `useState` statt `useRef` für `setInterval`-ID.**
  Ursache: `setRechunkPolling(interval)` mit React `useState` löste bei jedem State-Update ein Re-Render aus, was in React StrictMode's `useEffect`-Cleanup-Phase das Interval vorzeitig löschte (clearInterval).
  Korrektur: `rechunkIntervalRef = useRef(null)` — direkte Mutation ohne Render-Zyklus.
  **Regel: Interval-IDs und Timeout-IDs immer in `useRef` speichern, nie in `useState`.**

- **Upload-Fortschrittsanzeige mit XHR statt fetch**
  `fetch` kennt keinen Upload-Fortschritt-Callback. Für Upload-Endpoints wird jetzt `XMLHttpRequest` verwendet:
  - `xhr.upload.addEventListener('progress', ...)` → Bytes-Fortschritt 0-100% während File-Transfer
  - `xhr.upload.addEventListener('load', ...)` → Datei gesendet, Server verarbeitet → `onProgress(-1)` (Indeterminate-Phase)
  - `uploadWithXhr()` Helper in `api.js` kapselt Auth-Header-Handling (liest Token aus localStorage).
  **Regel: Für Upload-Progress immer XHR verwenden, nicht fetch.**

### 2026-02-22 (RAGplus — Embedding-Provider, Auto-Summary, Bugfixes)

- **Fehler: Embedding-Provider-Auswahl — UI sprang nach Speichern auf OpenAI zurück.**
  Ursache: `UpdateRagSettingsRequest` in `models.py` fehlten die Felder `embedding_provider` und `embedding_deployment`. Pydantic ignorierte die eingehenden Werte beim Deserialisieren (kein Validierungsfehler — stille Verdrängung), `model_dump(exclude_none=True)` lieferte nur die bekannten Felder zurück.
  Korrektur: Beide Felder als `Optional[str] = None` in `UpdateRagSettingsRequest` ergänzt.
  **Regel: Bei neuen Settings-Feldern immer auch das Pydantic-Request-Model aktualisieren — sonst werden Felder vom Client still ignoriert.**

- **Fehler: `logger.info()` Aufrufe wurden nicht ausgegeben.**
  Ursache: Ohne expliziten `logging.basicConfig()`-Aufruf nutzt Python den "Last Resort Handler", der nur `WARNING` und höher ausgibt. `logger.info(...)` in `rag.py` und `main.py` verschwanden lautlos.
  Korrektur: `logging.basicConfig(level=logging.INFO)` am Anfang von `main.py` ergänzt.
  **Regel: In FastAPI-Apps immer explizit `logging.basicConfig(level=logging.INFO)` setzen, sonst sind INFO-Logs unsichtbar.**

- **Fehler: Audit-Log-Aufruf mit `target_id="rag_settings"` — kein valides UUID.**
  Ursache: `audit.log_event(..., target_id="rag_settings")` übergab einen String wo ein UUID erwartet wurde, was zu einem DB-Insert-Fehler führte.
  Korrektur: `target_id=None` für Settings-Änderungen ohne konkretes Datenobjekt.
  **Regel: `target_id` in Audit-Logs ist ein UUID — bei Systemkonfigurationen `None` übergeben.**

- **Fehler: Kosten-Dashboard zeigte Azure OpenAI Embeddings unter "openai".**
  Ursache: `get_detailed_usage()` in `admin.py` gruppierte Einträge nur nach `model`-Name. Zwei Einträge mit gleichem Modellnamen aber unterschiedlichen Providern (z. B. `text-embedding-3-small` via OpenAI vs. Azure) wurden zusammengefasst.
  Korrektur: Gruppierungsschlüssel auf `(model, provider)` Tuple geändert.
  **Regel: Kosten-Gruppierung immer nach `(model, provider)` — gleiche Modellnamen bei verschiedenen Providern sind unterschiedliche Kostenstellen.**

- **Fehler: Provider-Spalte im Kosten-Tracking zeigte immer "openai" für Embeddings.**
  Ursache: `process_document()` in `rag.py` rief `record_usage(..., provider="openai")` mit hardcoded Provider auf, unabhängig vom konfigurierten Embedding-Provider.
  Korrektur: Provider wird aus `admin_crud.get_rag_settings()["embedding_provider"]` gelesen und dynamisch übergeben.
  **Regel: Provider für Usage-Tracking nie hardcoden — immer aus der aktuellen Konfiguration lesen.**

- **Fehler: `name 're' is not defined` bei Auto-Summary.**
  Ursache: `_summarize_document()` in `main.py` nutzte `re.sub()` zum Entfernen von `<!-- page:N -->`-Markern, aber `import re` fehlte in der Datei.
  Korrektur: `import re` zu den Imports in `main.py` ergänzt.
  **Regel: Beim Hinzufügen neuer Funktionen die Import-Liste der Datei prüfen.**

- **Fehler: RAG-Zitate verschwanden nach Navigation weg und zurück.**
  Ursache: `rag_sources` wurden nur im SSE-Stream (`done`-Event) an das Frontend gesendet, aber nie in der Datenbank gespeichert. `storage.add_assistant_message()` und `pools.add_pool_chat_message()` hatten keinen `rag_sources`-Parameter. Beim erneuten Laden einer Konversation aus der API kamen Nachrichten ohne `sources`-Feld zurück — alle Zitate fehlten.
  Korrektur:
  - Migration `20260226_rag_sources_persistence.sql`: `rag_sources JSONB` Spalte in `chat_messages` und `pool_chat_messages`
  - `storage.add_assistant_message()`: neuer Parameter `rag_sources`, wird bei Vorhandensein in DB gespeichert
  - `storage.get_conversation()`: `sources: msg.get("rag_sources")` in Message-Dict aufgenommen
  - `pools.add_pool_chat_message()`: analog, `rag_sources` Spalte befüllt
  - `pools.get_pool_chat()`: DB-Feld `rag_sources` → `sources` gemappt (Frontend-Konvention)
  - `main._stream_response()` und `_stream_pool_response()`: `rag_sources` an die jeweilige Speicher-Funktion übergeben
  **Regel: Alle Daten, die nach einem Session-Reload oder einer Navigation sichtbar sein sollen, müssen in der DB persistiert werden — SSE-Events sind flüchtig.**

### 2026-03-21/22 (UI Redesign + Mammouth.ai)

- **Fehler: Doppelte Padding-Kompensation bei Pool-Chat-Bubbles.**
  Ursache: `.pool-content` und `.pool-messages` hatten beide `calc(220px + 80px)`-Kompensation, weil `PoolChatArea` innerhalb von `.pool-content` gerendert wurde.
  Korrektur: `PoolChatArea` aus `.pool-content` herausgezogen (sibling, nicht child). **Regel: Layout-Kompensation nur auf dem tatsächlichen Wrapper, nie doppelt.**

- **Fehler: `document.addEventListener` in Wrapper-`<div>` mit `overflow: hidden` brach Scrolling.**
  Ursache: Wrapper-Div mit `overflow: hidden` blockierte das Scrollen der Message-Liste.
  Korrektur: Wrapper-Div entfernt, Click-Outside-Handler direkt auf `document`-Ebene mit `mousedown`. **Regel: Für globale Klick-Listener immer `document`-Level verwenden, nie Container mit overflow-Beschränkung als Trap nutzen.**

- **Fehler: Mammouth API error 400 — `temperature` wird nicht unterstützt.**
  Ursache: Mammouth's OpenAI-kompatibler Endpoint akzeptiert nur den Default-Wert (1) für `temperature`. Jeder explizit gesendete Wert (auch 1.0) führt zu `ContentPolicyViolationError`.
  Korrektur: `skip_temperature: True` in `PROVIDER_CONFIG["mammouth"]`; `_build_openai_compatible_request()` lässt den Parameter komplett weg. **Regel: Bei neuen Providern immer prüfen, welche Parameter unterstützt werden — insbesondere `temperature`, `stream_options`, `max_tokens` vs. `max_completion_tokens`.**

- **Fehler: Default-Modell springt nach Aktion auf falsches Modell.**
  Ursache (1): `.eq("is_default", True)` in Supabase Python-Client schlug bei Boolean-Filtern still fehl — mehrere Modelle blieben `is_default=True`.
  Ursache (2): Identischer `sort_order=0` bei allen Modellen → Supabase gibt Zeilen in nicht-deterministischer Reihenfolge zurück → Default-Badge erschien in falscher Zeile.
  Korrektur: Reset via `.neq("id", config_id)` (unconditional); sekundärer Sort `.order("model_id")` für stabile Reihenfolge.
  **Regel: Nie auf Boolean-Filter in Supabase Python-Client verlassen wenn ein positives Ergebnis kritisch ist — stattdessen negativ-Bedingung oder ID-Exclude verwenden.**

- **Fehler: Radio-Button für Default-Modell zeigte falschen Zustand.**
  Ursache: React `checked`-Prop auf `<input type="radio">` kollidiert mit nativer Browser-Radio-Gruppe-Logik (`name="default_model"` shared) bei async State-Updates.
  Korrektur: Radio-Button durch expliziten "Setzen"-Button + "✓ Default"-Badge ersetzt. **Regel: Controlled Radio-Buttons mit async Updates in React immer durch explizite Button-Actions ersetzen.**

### 2026-03-26 (RAGplus — Listing-Intent + Metadaten-Filter)

- **Design-Entscheidung: Targeted Retrieval bypasses Vektorsuche.**
  Bei Metadaten-gefilterten Queries (`summary`/`listing` + Datum/Typ-Filter) werden Chunks direkt aus der Tabelle geladen statt per RPC. Das ergibt vollständige Dokumentabdeckung, verzichtet aber auf Ähnlichkeits-Ranking. `similarity=1.0` wird gesetzt (alle Chunks gleich relevant — der Filter hat die Relevanzdefinition übernommen). Chunks kommen in Dokumentreihenfolge (document_id, chunk_index), damit das LLM jedes Dokument linear liest.

- **Design-Entscheidung: Kein RPC-Update für document_ids-Filter.**
  Statt die Supabase RPCs (`match_document_chunks`, `keyword_search_chunks`) um einen `match_document_ids UUID[]` Parameter zu erweitern (hätte `DROP FUNCTION + CREATE` + Migration erfordert), wird bei Targeted Retrieval die Tabelle direkt abgefragt. Vorteil: keine Migration, keine PGRST203-Gefahr. Nachteil: kein BM25/Vektor-Ranking innerhalb der gefilterten Dokumente — für zukünftige Map-Reduce-Erweiterung ist das akzeptabel.

- **Design-Entscheidung: Datums-Filter auf `created_at` (Upload-Datum), nicht Inhaltsdatum.**
  `app_documents` hat kein semantisches Datum-Feld — nur `created_at` (Zeitpunkt des Uploads). "Protokolle vom März 2026" trifft also Dokumente, die im März 2026 hochgeladen wurden. Dokumente, die im April hochgeladen aber inhaltlich aus März datieren, werden nicht getroffen. Akzeptabler Kompromiss bis zur Einführung von Dokument-Tagging.

- **Design-Entscheidung: `_MAX_TARGETED_CHUNKS = 80`.**
  80 Chunks × ~512 Tokens ≈ 40k Tokens Dokumentkontext. Bleibt komfortabel unter dem Limit gängiger Modelle (128k+). Verhindert Context-Overflow bei Pools mit vielen Dokumenten. Bei 15 Dokumenten werden die ersten ~5 Chunks pro Dokument geliefert (hängt von der SQL-ORDER ab).

- **Design-Entscheidung: `listing`-Intent injiziert Dokumentliste zusätzlich zu RAG-Chunks.**
  Für "welche Dokumente kennst du aus März 2026?" werden sowohl die Targeted-Chunks als auch die vollständige Dokumentnamen-Liste in den LLM-Kontext gegeben. Das LLM kann so exakt beantworten welche Dokumente es gibt — auch wenn ein Dokument keine relevanten Chunks hat (z. B. leerer Inhalt oder Fehler beim Chunking).

### Offene Risiken
1. Supabase RLS-Policies sind noch nicht aktiviert.
2. ~~Kein Rate-Limiting auf LLM-Endpoints~~ — **Gelöst (2026-02-17)**: slowapi Rate Limiting mit Redis-Backend auf allen kritischen Endpoints (siehe Fehlerjournal 2026-02-17).
3. Provider-API-Keys in DB sind Fernet-verschlüsselt mit von JWT_SECRET abgeleitetem Key — bei JWT_SECRET-Rotation werden alle gespeicherten Keys unlesbar.

## Präventionsmaßnahmen
1. Vor jedem Merge: API-Smoketest, Frontend-Build, Datenbankschema-Check.
2. Jede Produktionsänderung erhält eine kurze Post-Deploy-Checkliste.
3. Bei neu gefundenen Fehlern wird hier ein Eintrag mit Ursache und Fix ergänzt.
4. **KEINE shared Tabellen** — jede Anwendung nutzt nur eigene Tabellen. llm-council-Tabellen (users, conversations, messages, token_usage, app_settings, api_keys, provider_api_keys) nie anfassen.
5. **Python-Version im Docker-Image prüfen** bevor neue Syntax-Features verwendet werden (aktuell: 3.11).
6. **Bei neuen Tabellen: kein Copy-Paste aus altem Storage-Code** ohne Feldprüfung.
7. **Azure-Modelle immer mit `deployment_name` in `app_model_config` anlegen.**
8. **Token-Invalidierung**: Bei sicherheitskritischen User-Änderungen (Deaktivierung, Passwort-Reset) immer `bump_token_version()` aufrufen, damit alle bestehenden Tokens sofort ungültig werden.
9. **SQL-Funktionsänderungen**: Bei Parameteränderungen immer `DROP FUNCTION IF EXISTS old_signature` vor `CREATE OR REPLACE`. Sonst PGRST203 Function Overload Ambiguity.
10. **Nullable RPC-Parameter**: Nie als `null` senden — komplett weglassen wenn nicht relevant (PostgreSQL `col = NULL` → UNKNOWN, nicht TRUE).
11. **SSE-Daten sind flüchtig**: Alle Daten, die nach Navigation/Reload sichtbar bleiben sollen (Quellen, Zitate, Metadaten), müssen in der DB gespeichert werden — nicht nur im Stream-Event.
12. **Pydantic-Request-Models vollständig halten**: Bei neuen Settings-Feldern sofort auch das zugehörige Request-Model aktualisieren. Fehlende Felder werden still ignoriert, kein Validierungsfehler tritt auf.
13. **Logging immer initialisieren**: `logging.basicConfig(level=logging.INFO)` am Anfang von `main.py` — ohne das sind alle `logger.info()`-Aufrufe im gesamten Projekt unsichtbar.

### 2026-05-11 — Build-System: uv + uv.lock (Coolify)

- **Fehler: Hartkodierte `pip install`-Liste im `backend/Dockerfile` ignorierte `pyproject.toml`.**
  Ursache: Der vorherige Dockerfile listete Pakete inline auf (`pip install fastapi uvicorn ...`). Neue Deps die in `pyproject.toml` ergänzt wurden (z. B. `python-docx`, `openpyxl`, `xlrd`) wurden bei jedem Coolify-Build still verworfen. Nach dem Deploy meldete der Upload-Pfad `ModuleNotFoundError: No module named 'openpyxl'` obwohl die Dep deklariert war.
  Korrektur: Dockerfile auf `uv sync --frozen --no-dev --no-install-project` umgestellt. **Regel: Runtime-Deps sind in `backend/uv.lock` festgepinnt — Lockfile gewinnt gegenüber `pyproject.toml`-Bereichen. Neue Deps werden in `pyproject.toml` ergänzt UND danach mit `uv lock` in `uv.lock` überführt; beide Dateien wandern im selben Commit.**

- **Design-Entscheidung: `pyproject.toml`-Versionsobergrenzen als Defense-in-Depth.**
  `fastapi<1.0`, `pydantic<3.0`, `supabase<3.0`, `bcrypt==4.0.1` (exakt) verhindern dass eine spätere `uv lock`-Regeneration versehentlich einen Breaking-Major einzieht. `uv.lock` pinnt die exakten Versionen heute; die Obergrenzen schützen den Zustand sechs Monate später, wenn jemand "mal eben" das Lockfile aktualisiert.

- **Design-Entscheidung: `--no-install-project` im Dockerfile.**
  Die Runtime importiert `app.main:app` aus dem Filesystem-Pfad `/app/app`, nicht aus einem pip-installierten Package. `uv sync` installiert deshalb nur Drittabhängigkeiten ins `/app/.venv`, nicht das Projekt selbst. `PATH` ist auf `/app/.venv/bin` vorangestellt damit `uvicorn` aus dem venv resolved wird. **Regel: Wenn die App-Quelle per `COPY` reinkommt und nicht über einen Wheel-Install läuft, immer `--no-install-project` setzen — sonst doppelte Installation und Konfusion über welche Version aktiv ist.**

- **Optionale Deps-Gruppe `[corpus]`.**
  `reportlab` und `xlwt` werden ausschließlich zur Generierung der Test-Fixtures unter `docs/tests/phase3/corpus/` gebraucht (siehe `scripts/build_corpus.py`). Sie landen nicht im Production-Image — `uv sync --no-dev --no-install-project` installiert sie nicht. Wer lokal Fixtures regenerieren will: `uv pip install -e backend[corpus]`.

### 2026-05-11 — RRF-Sortier-Reihenfolge wird ohne Cohere-Rerank zerschossen

- **Fehler: Der Multi-Dok-Bias-Fix vom 2026-05-07 funktioniert nicht im Default-Pfad.**
  Ursache: `_bm25_search_chunks()` mappt den BM25-Score in das `similarity`-Feld der Chunk-Dicts — dasselbe Feld in dem Vektorhits ihre Cosine-Similarity tragen, aber auf einer komplett anderen Skala (BM25 0–~5,0 vs. Cosine 0–1). `_reciprocal_rank_fusion()` schreibt anschließend einen sauberen `rrf_score`. Aber `_apply_optional_rerank()` sortiert wieder nach `similarity` — was die RRF-Reihenfolge ruiniert, sobald BM25-Hits dabei sind (deren `similarity`-Werte sind nach BM25-Skala kleiner als Vektor-Cosine-Werte und sinken in der Sortierung nach unten, obwohl sie laut RRF oben stehen sollten).
  Korrektur: Sortier-Key in `rag.py:949` von `-float(c.get("similarity", 0.0))` auf `-float(c.get("rrf_score") or c.get("rerank_score") or c.get("similarity", 0.0) or 0.0)` geändert. RRF gewinnt wenn vorhanden, sonst Rerank-Score, sonst Similarity-Fallback. **Regel: Wenn mehrere Score-Felder verschiedene Skalen tragen, die Sortier-Key explizit das spätere/zusammengeführte Feld bevorzugen lassen. Niemals die Skala-Ambiguität in einem einzelnen Feld dulden.**

- **Lasttragend** weil kein Cohere-Rerank-Key konfiguriert ist (Decision 2026-05-11: no-rerank ist akzeptierte aktuelle Design; siehe Memory `project_xqt5_todo.md`). Ohne Rerank-Stage ist diese Sortierung der einzige Re-Ordering-Mechanismus nach der Hybrid-Retrieval-Fusion. Vor dem Fix wurde RRF im Default-Pfad jedes Mal eingeebnet — der vermeintliche Multi-Dok-Bias-Fix war für den Großteil der echten Anfragen wirkungslos.

### 2026-05-12 — Geteilte Modal- und Confirm-Primitiven

- **Konvention: Neue Modale verwenden `<Modal>` aus `frontend/src/components/Modal.jsx`** statt rohes `.modal-overlay`-Markup. Der Wrapper liefert `role="dialog"` / `aria-modal` / Esc-Handler / Fokus-Trap / Fokus-Rückkehr ohne Boilerplate. Props: `title`, `onClose`, optional `closeOnBackdropClick` (Default `true`; auf `false` setzen, wenn der Dialog State trägt, dessen Verlust ärgerlich wäre — siehe `PoolShareDialog`). **Ausnahme bewusst gelassen:** `AssistantManager` und `TemplateManager` behalten ihr `.modal-overlay`-Markup, weil ihre Zwei-Panel-Layout (List ↔ Edit) nicht in die deklarative Children-API passt. Sie auf `<Modal>` zu zwingen, würde die State-Machine durch die Wrapper-Schicht zerflusen. Wer diese Komponenten künftig refactort, sollte zuerst List + Edit in zwei kleinere Komponenten zerlegen und jede einzeln in ein `<Modal>` einsetzen.

- **Konvention: Bestätigungsdialoge laufen über `useConfirm()`** aus `frontend/src/components/ConfirmDialog.jsx`. **Kein `window.confirm()` mehr im Codebase** — der ist 2026-05-12 vollständig entfernt worden. Pattern: `const confirm = useConfirm()` am Hook-Top der Komponente, dann `if (!await confirm({ title, message, confirmLabel, destructive })) return`. Destruktive Aktionen markieren `destructive: true` (Confirm-Button bekommt `btn-danger`, Default-Fokus auf Cancel). Strings sind deutsch mit echten Umlauten. Der `<ConfirmProvider>` ist in `main.jsx` *außerhalb* von `<App />` montiert, damit auch Pre-Auth-Flows den Hook nutzen könnten.

- **Anti-Pattern: `window.confirm()`, `window.alert()`, `window.prompt()`.** Native Browser-Dialoge brechen das XQT5-Designsystem und entziehen sich der i18n-Pipeline. Wenn ein neuer Code-Pfad bestätigen muss, immer `useConfirm()`. Wenn ein Hinweis (kein Ja/Nein-Choice) gebraucht wird, momentan inline rendern; ein `useAlert`-Hook würde sich auf demselben Provider-Pattern aufsetzen lassen, ist aber noch nicht implementiert.

- **Inline-Arrow-Handler dürfen `async` sein**, müssen aber synchrone Seiteneffekte (`e.stopPropagation()`, `e.preventDefault()`) **vor** dem ersten `await` ausführen. Beispiel in `PoolChatList.jsx`: `onClick={(e) => handleDelete(e, chat.id)}` ruft eine externe `async handleDelete(e, id)`-Funktion, die zuerst `e.stopPropagation()` macht und dann `await confirm(...)`. Das verhindert, dass der Parent-Container-Click feuert, während die Promise auf Userentscheidung wartet.

- **i18n-Keys nicht an Komponentennamen koppeln.** Beispiel aus 2026-05-12: Keys für die Pool-Chat-Liste wurden auf `pool.chat.*` statt `pool.chatlist.*` benannt, damit eine künftige Umbenennung der Komponente die Keys nicht obsolet macht. Existierende `pool.header.role.*`-Keys werden über `t(\`pool.header.role.${role || 'viewer'}\`)` mit Fallback gegen `undefined` referenziert — ohne Fallback rendert `t()` den Key wörtlich (`pool.header.role.undefined`), was als sichtbarer Müll auf der UI auftaucht.

### 2026-05-12 — Persistente Seitenleiste, Layout-Konventionen

- **Konvention: Die sekundäre Seitenleiste (`Sidebar.jsx` / `.content-panel`) ist eine Layout-Spalte, kein Overlay.** Sie sitzt als Flex-Item in `.app` zwischen `NavRail` und Hauptinhalt (`ChatArea`/`PoolDetail`/`AdminDashboard`) und drückt den Hauptinhalt zur Seite, statt ihn zu überlagern. Wer neue Render-Pfade einbaut: nicht annehmen, dass Hauptinhalt immer volle Breite hat, wenn die Seitenleiste sichtbar ist.

- **Anti-Pattern: `setSidebarOpen(false)` nach Navigation.** Die Seitenleiste schließt sich nicht mehr automatisch, wenn die Nutzer:in einen Chat öffnet, einen Pool wählt oder einen Pool-Tab wechselt. Das war die alte Auto-Close-UX, die zerrissene Navigationsflüsse erzeugte. Wenn ein neuer Handler die Versuchung hat, die Seitenleiste „aufzuräumen", widerstehen — die Schließ-Affordanzen (NavRail-Toggle, X-Button, Home-Logo) gehören der Nutzer:in. **Eine bewusste Ausnahme bleibt:** der Wechsel in die Admin-Section schließt die Seitenleiste, weil `AdminDashboard` voll-Breite gerendert wird.

- **Konvention: Mobile-Drawer-Fallback per Media-Query.** `@media (max-width: 768px)` revertet `.content-panel` zu `position: absolute` + Drawer-Overlay-Animation. Das `useEffect` für Outside-Click-Close in `App.jsx` ist mit `window.matchMedia('(max-width: 768px)').matches` gegated — der Handler feuert nur auf Mobil. CSS und JS sind explizit auf 768 px koordiniert; bei Änderung der Mobile-Schwelle beide Stellen anpassen.

- **Section-Switch räumt Hauptinhalt:** Wenn `handleSectionChange` zwischen den Chat- und Pool-Sections wechselt, räumt jeder Zweig den Hauptinhalt der jeweils anderen Seite (`displayedPool`/`activePool`/`activePoolChatId` im chat-Branch, `activeConversation` im pools-Branch). Verhindert „Seitenleiste zeigt X, Hauptinhalt zeigt Y"-Mismatches, die im alten Overlay-Modell durch das Auto-Close-Verhalten maskiert waren.

- **Bekannte Edge Case (für späteren Fixer):** `api.sendMessageStream` in `App.jsx:onSendMessage` hat keinen `AbortController`. Wenn die Nutzer:in mitten in einem streamenden Response die Section wechselt, feuert der Stream-Completion-Callback später noch `setActiveConversation(updated)` und überschreibt den Section-Wechsel. Saubere Lösung: `AbortController` + Conversation-ID in `useRef` capturen, im Cleanup abort()en. Bewusst nicht in diesem PR gelöst (eigenes Scope).

### 2026-05-12 — Pool-Chat-Öffnen aus gemischter Liste

- **Konvention: `displayedPool` ist der „Was zeigt der Hauptbereich"-Indikator, `activePool` ist der „Was zeigt die Seitenleiste"-Indikator.** Sie können auseinanderlaufen. Konkret: ein Pool-Chat aus der unifizierten Chat-Liste setzt `displayedPool=pool` aber lässt `activePool=null`, damit die Seitenleiste auf der Chat-Liste bleibt. Wer neue Handler schreibt, die einen Pool öffnen, muss bewusst entscheiden, ob beide oder nur einer gesetzt wird. **Faustregel:** Aus der gemischten Chat-Liste geöffnete Pool-Chats setzen nur `displayedPool`; explizite Pool-Auswahl in der Pool-Seitenleiste (`handleSelectPool`) und das neue „Pool öffnen"-Button (`handleOpenPoolSidebar`) setzen beide.

- **Cross-Modus-Aufräumen ist Pflicht:** Wenn ein Handler den Main-Bereich auf etwas Neues setzt (z. B. `onOpenConversation` öffnet ChatArea), muss er auch `displayedPool` und `activePoolChatId` räumen — sonst rendert das Konditional `displayedPool ? <PoolDetail> : <ChatArea>` falsch (PoolDetail bleibt sichtbar während die Seitenleiste schon einen persönlichen Chat zeigt). Dieselbe Regel gilt umgekehrt: wer einen Pool öffnet, sollte `activeConversation` räumen.

- **`<PoolDetail key={displayedPool.id}>`** — die Key-Prop erzwingt Re-Mount beim Pool-Wechsel. Wer PoolDetail anfasst, sollte sich darauf verlassen: interner State (`activeChat`, `chats`, `documents`, `members`) ist beim ersten Render für einen neuen Pool garantiert leer und wird via `useEffect` neu geladen. Kein State-Carry-Over zwischen verschiedenen Pools.

- **`consumedChatIdRef`-Dedup-Pattern und der zweite Klick:** Wenn ein Effekt eine externe ID „konsumiert" und einen Ref setzt, um Doppel-Aufrufe zu verhindern, **muss der Ref auch zurückgesetzt werden**, wenn die externe ID auf null/leer geht. Sonst blockiert ein erneutes Setzen derselben ID den Re-Aufruf, weil der Ref noch den alten Wert hält und React's Effect-Dep-Array keinen Change sieht. Lehrstück aus diesem PR: `PoolDetail.jsx:53-55` resettet `consumedChatIdRef.current = null`, wenn `initialChatId` null wird. Die Reset-Effect-Dep ist `[initialChatId]`, NICHT `[activeChat]` — die externe ID ist die Wahrheit, der interne `activeChat`-State ist nur Folge davon.

### 2026-05-12 — Counter-Signal-Pattern für Parent-zu-Child-Imperative

- **Konvention: Wenn der Parent einen Child-internen State imperativ resetten muss, benutze ein Counter-Signal**, das via Prop durchgereicht und in einem `useEffect` mit `[signal]`-Dep beobachtet wird. Beispiel aus diesem PR (`App.jsx`/`PoolDetail.jsx`): `chatListResetSignal` (Integer, beginnt bei 0). Parent inkrementiert via `setChatListResetSignal(s => s + 1)`, Child beobachtet via `useEffect(() => { setActiveChat(null) }, [chatListResetSignal])`. Funktionaler Updater im Setter ist wichtig — bei React-18-Batching gehen Inkremente sonst verloren.
- **Wann dieses Pattern, wann State liften?** Counter-Signal: wenn der Child-State pool-/komponentenspezifisch ist und es kein Verständigungsproblem ist, ob der Reset „verloren geht" (idempotent). State liften: wenn der Parent den Child-State ohnehin schon kennen muss, oder wenn mehrere Geschwister-Komponenten auf den gleichen State zugreifen. In diesem PR wäre das Liften von `activeChat` nach App.jsx ein Major-Refactor gewesen — der Counter ist die kleinere, lokalisierte Lösung.
- **Selektive Verdrahtung von Handler-Wrappern:** Wenn ein neuer Handler-Wrapper (z. B. `handlePoolTabChange` mit Re-Click-Erkennung) nicht überall den ursprünglichen Setter ersetzen darf, **muss der Code dokumentieren warum**. In `App.jsx` ist `handlePoolTabChange` nur an die Sidebar verdrahtet; `PoolDetail.onTabChange` bleibt direkt am `setPoolTab`, weil PoolDetail intern `onTabChange('chats')` aufruft, BEVOR es `setActiveChat` setzt — eine Routing durch den Wrapper würde den Signal-Effect feuern und den frisch gesetzten Chat sofort wieder schließen. Solche „Sieht-aus-wie-Inkonsistenz, ist-aber-bewusst"-Stellen brauchen einen Inline-Kommentar.

### 2026-05-12 — CSS-Scoping über Parent-Modifier statt Klassen-Multiplikation

**Konvention:** Wenn eine visuelle Änderung nur für *eine bestimmte Verwendung* von `.panel-item` gelten soll, aber nicht für alle, wird ein Parent-List-Modifier eingeführt statt einer neuen Item-Level-Klasse.

Konkretes Beispiel aus Request 3 v2 (Chat-Differenzierung): Die neuen Border- und Farbregeln für Chat-Einträge sollen nur in der Chat-Section greifen, nicht in der Pool-Listenansicht, die dasselbe `.panel-item`-Markup verwendet. Lösung: Der umschließende `div.panel-list` der Chat-Section erhält den Modifier `panel-list--chats`. Alle neuen Regeln lauten `.panel-list--chats .panel-item`, `.panel-list--chats .panel-item.active` usw. — Scoping über den Kontext, nicht über das Element selbst.

Der Alternativentwurf wäre gewesen, jedes Chat-Item mit `.panel-item--chat` zu markieren. Das hätte jedoch jede Render-Stelle in `Sidebar.jsx` angefasst und eine neue semantische Klasse auf Item-Ebene eingeführt, die keine eigene Bedeutung trägt, sondern nur Kontext kodiert. Der Parent-Modifier-Ansatz hält den Base-Kontrakt von `.panel-item` intakt und vermeidet Klassen-Proliferation.

**Faustregel:** Modifier auf der *Liste*, wenn der Kontext die Regel definiert. Modifier auf dem *Item*, wenn das Item selbst eine andere Semantik hat (z. B. `.panel-item--disabled`).

**Lektion — Icon vs. absolut positionierter Button:** Das neue `.panel-item-icon`-Element (rechts im Row) benötigt `margin-right: 32px`, nicht 20 px. Der Hover-Delete-Button ist absolut positioniert und reicht bis ca. 28 px vom rechten Rand. Bei 20 px überlagert der Button das Icon, sobald Hover den Button einblendet. Wann immer ein inline liegendes Element neben einem absolut positionierten Hover-Control platziert wird, muss der `margin-right`-Wert die maximale Ausdehnung des Controls im Hover-Zustand abdecken — nicht nur den ruhenden Zustand.

### 2026-05-13 — Konventionen für Bildgenerierung

**`app_model_config.model_type` — erweiterbare Typkennung.**
`model_type` ist `varchar`, kein Postgres-Enum. Zulässige Werte in v1: `'chat'`, `'image'`, `'embedding'`. Neue Typen (z. B. `'tts'`, `'video'`) können in der DB registriert werden, ohne eine Schema-Migration zu erfordern. Code, der `model_type` auswertet, muss unbekannte Werte defensiv behandeln (Logging + Fehler, kein Silent-Ignore). Der `is_default`-Reset in `admin.py` (Zeilen 204-205) filtert immer auf `WHERE model_type = :model_type`, sodass Chat- und Bild-Defaults unabhängig bleiben. **Dieses Filter-Muster muss bei jedem zukünftigen `is_default`-Reset eingehalten werden.**

**Storage-Abstraktion — `image_storage.resolve_image_url()`.**
`backend/app/image_storage.py:resolve_image_url(record: dict) -> str` ist der einzige Ort, der den physischen Speicherort eines Bilds kennt. Er liest das Feld `storage_kind` aus dem DB-Record:
- `'provider_url'` → gibt `record["image_url"]` unverändert zurück (v1; OpenAI/xAI-CDN-URL, ca. 60 Min. gültig)
- `'data_uri'` → gibt die `data:image/png;base64,…`-URI unverändert zurück (v1; aus `b64_json`-Antworten wie `gpt-image-1`)
- `'supabase'` → baut eine Supabase-Storage-Signed-URL (v2, noch nicht implementiert)

**Provider-Response-Shape-Routing:** `image_gen.py` muss in jedem Provider-Adapter beide Response-Shapes prüfen — `url` → `'provider_url'`, `b64_json` → `'data_uri'`. Neue Provider folgen demselben Pattern. Der Discriminator `storage_kind` ist der einzige Ort, an dem die Shape im Code sichtbar wird; alle Aufrufer behandeln `image_url` als opake URL.

**`provider_url_expires_at`-Bedingung:** `mark_image_succeeded()` setzt das Ablaufdatum nur, wenn `storage_kind == 'provider_url'`. `data_uri` und `supabase` haben keinen Ablauf.

Kein anderer Code darf `record["image_url"]` direkt auslesen und als finale URL behandeln. Die Abstraktion stellt sicher, dass der v1→v2-Speicherwechsel ausschließlich in dieser Funktion stattfindet — ohne API-Kontrakt- oder Frontend-Änderung.

**Stil-Präfix — Unsichtbarkeit für Nutzer.**
Der globale Stil-Präfix aus `app_image_style_presets` wird ausschließlich serverseitig in `images.py` vor den Nutzer-Prompt konkateniert. Er wird niemals im API-Response zurückgegeben. Der vollständige Prompt (inkl. Präfix) wird nicht geloggt — nur die Prompt-Länge. Wenn zukünftiger Code den finalen Prompt zurückgeben oder loggen muss, ist das eine bewusste Entscheidung, die in SECURITY.md dokumentiert werden muss.

**Status-Spalte als Finanz-Integritätsmuster — insert-before-provider-call.**
Immer wenn ein externer Provider-Call Kosten verursachen kann, wird ein Stub-Record mit `status='pending'` **vor** dem Call in die DB geschrieben. Nach dem Call: `status='succeeded'` + Kosten eintragen, oder `status='failed'` (keine Kosten). Nur `succeeded`-Records zählen in Kostensummen und gegen Limits. Dieses Muster gilt für Bildgenerierung und sollte auf alle zukünftigen kostenpflichtigen Provider-Calls ausgeweitet werden.

**Slash-Command-Konvention (v2 — nicht aktiv in v1).**
Der `/bild`-Slash-Command wurde aus v1 herausgenommen (Frontend-Parser entfernt). Die Konvention bleibt für v2 gültig: Slash-Commands werden mit case-insensitiver Regex erkannt (`/i`-Flag). Das Muster erfordert mindestens ein Nicht-Leerzeichen nach dem Command-Wort: `^\/bild\s+\S` / `^\/image\s+\S`. Ein Command ohne Inhalt löst keinen API-Call aus, sondern zeigt einen Tooltip-Hinweis. Neue Slash-Commands müssen dasselbe case-insensitive + Mindest-Inhalt-Pattern verwenden.

### 2026-05-12 — Supabase-Pattern: count + last-row in einer Query

**Problem:** Wenn man für eine Liste von Eltern-Datensätzen gleichzeitig die Anzahl der Kind-Datensätze und den neuesten Kind-Datensatz braucht, liegt die naive Lösung bei zwei separaten Queries — oder bei `select("id", count="exact")`, das alle IDs überträgt, nur um `len(result.data)` aufzurufen.

**Pattern:** `.select("col", count="exact").order("col", desc=True).limit(1).execute()` — eine einzige Query liefert beides. Der Supabase-Python-Client berechnet `.count` für das vollständige Filter-Prädikat, **unabhängig von `.limit`**. `.data` enthält nur die durch `.limit` begrenzten Zeilen. Für den Chat-Use-Case: `.select("created_at", count="exact").order("created_at", desc=True).limit(1)` liefert Gesamtanzahl per `result.count` und den jüngsten Timestamp per `result.data[0]["created_at"]` (falls `result.data` nicht leer).

**Vorteil gegenüber bisherigem Ansatz:** `select("id", count="exact")` ohne Limit transferiert bei einem Chat mit 500 Nachrichten 500 UUID-Strings über das Netzwerk. Mit `.limit(1)` ist die Payload genau eine Zeile — unabhängig von der Gesamtzahl.

**Präzedenzfall im Codebase:** `pools.py:382–388` (`has_ready_pool_documents`) nutzt dasselbe `.select(..., count="exact").limit(1)`-Pattern bereits, um zu prüfen ob mindestens ein fertiges Dokument vorliegt. Dieses Muster ist damit eine etablierte Konvention im Projekt.

**Anti-Pattern — `len(msg_count.data)` als Zähler:** Sobald `.limit(1)` eingeführt wird, gibt `len(result.data)` immer 0 oder 1 zurück, nicht die echte Gesamtzahl. Das scheitert lautlos — kein Fehler, falsche Zahl. Korrekte Nutzung ist stets `result.count` (Integer, vom Client gesetzt). Niemals `len(result.data)` für Zählzwecke verwenden, wenn `.limit` gesetzt sein könnte.
