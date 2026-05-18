# Implementierte Features

Dieses Dokument hält abgeschlossene Implementierungen aus dem Feature-Backlog fest. Wenn ein Punkt aus `TODO.md` umgesetzt wird, wird er dort entfernt und hierher verschoben — vollständig mit allen technischen Details, sodass keine Information verloren geht.

---

## RAG-Backend — Cherry-picks aus dri-Branch (2026-04-07)

Die folgenden RAG-Verbesserungen wurden aus `xqt5-ai-plattform-dri` in `xqt5-ai-plattform` portiert. Die Portierung erfolgte als gezielte Einzeländerungen, nicht als Bulk-Überschreibung — der dri-Branch hatte UI- und Strukturänderungen (Sidebar-Redesign, NavRail-Entfernung, Provider-Entfernungen, Welcome.jsx-Vereinfachung), die Regressionen darstellen oder keinen Mehrwert für das aktive Repo haben und daher bewusst ausgeschlossen wurden.

> **Kritischer Bugfix enthalten:** Der dri-Branch hat `_reciprocal_rank_fusion()` korrigiert, das den Kosinus-`similarity`-Score mit dem winzigen RRF-Score (0.008–0.016) überschrieben hatte. Dies führte dazu, dass das Relevanzfilter immer `False` auswertete und RAG im Hybrid-Modus still deaktiviert war.

---

### Phase 1.1 — Relevanzfilter (`apply_relevance_gate()`)

- `apply_relevance_gate()` verwirft alle Chunks, wenn `max(similarity) < RAG_RELEVANCE_GATE` (Standard: 0.35)
- Enthält den RRF-Score-Bugfix: separates `rrf_score`-Feld; `similarity` enthält immer den rohen Kosinus-Score
- Dateien: `rag.py`, `config.py` (neues `RAG_RELEVANCE_GATE` Env-Var)

---

### Phase 1.2 — Vollständige Quellenangaben

- `build_rag_context()` gibt Seitenzahl + Abschnitts-Breadcrumb-Pfad im Quell-Header aus
- Format: `datei.pdf | Seite 12 | §3.1 Titel (Relevanz: 87%)`
- `rag_sources`-Array ans Frontend enthält `page_number`, `section_path`, `chunk_index`
- Dateien: `rag.py`, `main.py`

---

### Phase 4.2 — Kontextuelles Retrieval (Anthropic-Technik, opt-in)

- `_generate_chunk_context()` stellt jedem Chunk vor dem Embedding einen per LLM generierten 1-Satz-Kontext voran
- Parallele Batch-Verarbeitung via `asyncio.gather` pro Dokument
- Opt-in: Admin-Toggle `contextual_retrieval_enabled` + konfigurierbares Modell (`contextual_retrieval_model`)
- Gilt nur für neu hochgeladene Dokumente; bestehende Docs benötigen Re-Chunking
- Dateien: `rag.py`, `admin.py`, `models.py`

> **Ausstehend:** `AdminDashboard.jsx` Frontend-Toggles noch nicht hinzugefügt — siehe Backlog.

---

### Phase 4.3 — Dokument-Zusammenfassung beim Upload

- `_summarize_document()` in `main.py` vorhanden, in beiden Upload-Endpunkten eingebunden, befüllt `app_documents.summary`
- Dateien: `main.py`, `documents.py`

---

### Phase 5.1 — Tabellen-bewusstes Chunking

- `_table_to_atoms()` behandelt Markdown-Tabellenblöcke als atomare Einheiten
- Zu große Tabellen werden nur an Zeilengrenzen aufgeteilt; jeder Fortsetzungs-Chunk beginnt mit `[Tabellenfortsetzung — Spalten: …]`
- `_units_with_table_awareness()` ersetzt `_split_into_units()` in der Abschnitts-Splitting-Schleife
- Dateien: `rag.py`

---

### Phase 5.3 — Nachbar-Chunk-Abruf

- `enrich_with_neighbors()` ruft `chunk_index ± 1` für die Top-3-Ergebnisse nach dem Relevanzfilter ab
- Nachbar-Chunks erhalten `similarity = parent_similarity × 0.85` und `is_neighbor = true`
- Ergebnisse sortiert nach `document_id + chunk_index` für sequenzielles Lesen
- Opt-in: Admin-Toggle `neighbor_chunks_enabled` (Standard: true)
- Dateien: `rag.py`, `main.py`, `admin.py`, `models.py`

> **Ausstehend:** `AdminDashboard.jsx` Frontend-Toggle noch nicht hinzugefügt — siehe Backlog.

---

### Phase 7.1 — Token-Budget-Kontextzusammenstellung

- `build_rag_context(max_tokens=6000)` befüllt Chunks nach Relevanz bis das Budget erschöpft ist
- Übersprungene Chunks werden geloggt; verhindert, dass 50-Chunk-Kontext das LLM-Fenster dominiert
- `max_context_tokens` bis 32.000 in den Admin-Einstellungen konfigurierbar
- Dateien: `rag.py`, `main.py`, `admin.py`, `models.py`

> **Ausstehend:** `AdminDashboard.jsx` Frontend-Slider noch nicht hinzugefügt — siehe Backlog.

---

### Phase 7.2 — XML-Kontext-Format

- `build_rag_context()` gibt nun XML-getaggte Blöcke statt `--- Source N ---` aus
- Format gemäß Anthropic-Prompting-Best-Practices:
  ```xml
  <documents>
    <document index="1">
      <source>datei.pdf | Seite 12 | §3.1 Titel (Relevanz: 87%)</source>
      <content>…</content>
    </document>
  </documents>
  ```
- Dateien: `rag.py`

---

### `_apply_document_access_policy()` — Aktualisierte Dokumentzugriffs-Richtlinie

- Vorher (2-teilig): kein Zugriff behaupten + Antwort auf Kontext basieren
- Neu (3-teilig):
  1. Dokumentkontext NUR verwenden, wenn direkt relevant für die Frage des Nutzers
  2. Falls der Nutzer etwas fragt, das nichts mit den Dokumenten zu tun hat, aus eigenem Wissen antworten — Dokumente nicht referenzieren
  3. Antworten auf bereitgestellten Kontext basieren, klar kommunizieren wenn Information fehlt
- Datei: `main.py` → `_apply_document_access_policy()`

---

## Admin-UI Frontend-Toggles (2026-05-06)

Drei Backend-RAG-Settings (Phase 4.2 Contextual Retrieval, Phase 5.3 Nachbar-Chunks, Phase 7.1 Token-Budget) waren am Backend bereits aktiv, aber ohne UI nur über manuelle Bearbeitung der `app_runtime_config.rag_settings`-JSONB-Zeile zu ändern. Die Toggles wurden im `RetrievalTab` von `AdminDashboard.jsx` ergänzt: Neue `<hr>`-getrennte Sektionen "Kontextzusammenstellung" und "Kontextuelles Retrieval", form-state + GET/PUT-Mappings + footer-Zusammenfassung, alle vier neuen Felder (`contextual_retrieval_enabled`, `contextual_retrieval_model`, `neighbor_chunks_enabled`, `max_context_tokens`) verwenden snake_case wie das Backend-Pydantic-Modell.

**i18n-Vorbereitung:** Erstmaliger Einsatz eines minimalen i18n-Helpers `frontend/src/i18n/strings.js` mit `t(key)`-Funktion und Deutsch-Default-Dict. Alle neuen UI-Strings laufen darüber statt hartcodiert in JSX zu landen — bestehende hartcodierte deutsche Strings bleiben unverändert (Refactor wäre eigene Aufgabe).

Dateien: `frontend/src/components/AdminDashboard.jsx`, `frontend/src/i18n/strings.js` (neu)

---

## Content-Hash Upload-Deduplikation (A1, 2026-05-06)

Verhindert OCR + Embedding-Recompute, wenn ein Nutzer dieselbe Datei zweimal hochlädt.

- SHA-256-Hex der hochgeladenen Bytes wird beim Upload berechnet (`compute_file_hash()` in `documents.py`)
- Vor OCR wird in `app_documents` gegen den Hash geprüft (`find_existing_document_by_hash()`); Match → bestehender Datensatz wird zurückgegeben, Audit-Log-Event `document.upload.dedup_skipped` geschrieben
- Scope-Regeln: pool-weit wenn `pool_id` gegeben, sonst per-User mit `chat_id` als zusätzlichem Filter wenn vorhanden
- Migration `supabase/migrations/20260506_a_content_hash.sql`: `content_hash TEXT` Spalte plus zwei partielle composite indexes (`(pool_id, content_hash)` und `(user_id, content_hash)`, jeweils `WHERE content_hash IS NOT NULL`)
- `create_document()` Signatur um `content_hash: Optional[str] = None` erweitert; bestehende Aufrufer unverändert
- Audit-Konstante `DOCUMENT_UPLOAD_DEDUP_SKIPPED` in `audit.py`
- Wiring in beiden Upload-Routen (`upload_document` und `upload_pool_document` in `main.py`)
- **Status:** Code deployed und Migration auf dev angewendet 2026-05-06; prod-Migration noch ausstehend bis bewusste Freigabe

Dateien: `supabase/migrations/20260506_a_content_hash.sql`, `backend/app/documents.py`, `backend/app/audit.py`, `backend/app/main.py`

---

## DB-Sicherheits-Härtung — Anon + Authenticated Rolle revoked (2026-05-06)

Supabase Studio Security Advisor meldete ~30 Warnungen, die meisten "RLS not enabled" auf `public`-Tabellen. Verifikation per curl mit dem Anon-JWT auf prod ergab: Anon hatte tatsächlich Lesezugriff auf alle `app_*` und `pool_*` Tabellen inklusive `app_users.password_hash` und `pool_invite_links.token`. Da der Anon-Key bei Supabase als „öffentlich teilbar" konzipiert ist, war das eine reale Datenexposition.

- Migration `20260506_b_revoke_anon_public.sql`: `REVOKE ALL` auf TABLES/SEQUENCES/FUNCTIONS in `public` für `anon`, plus `ALTER DEFAULT PRIVILEGES FOR ROLE postgres, supabase_admin` analog für künftige Objekte
- Migration `20260507_revoke_authenticated_public.sql`: identische Behandlung für die `authenticated`-Rolle, da dieselbe Bug-Klasse via JWT mit `role: authenticated` ausnutzbar wäre
- `service_role` blieb unangetastet — der Backend hängt davon ab
- Verifikation: nach Anwendung liefert dieselbe curl auf alle 6 getesteten Tabellen `HTTP 401 42501 permission denied`. App funktioniert unverändert (Backend nutzt service-role)
- **Status:** beide Migrationen auf prod angewendet 2026-05-06; dev hat aktuell keine Anon/Authenticated-Rollen exponiert, dort idempotent ausstehend

Vollständiges Bedrohungsmodell, offene Lücken und Verifikationsbefehle: `docs/SECURITY.md` (neu, kanonischer Sicherheits-Track-Record).

Dateien: `supabase/migrations/20260506_b_revoke_anon_public.sql`, `supabase/migrations/20260507_revoke_authenticated_public.sql`, `docs/SECURITY.md`

---

## Bild-pHash Deduplikation (A2, 2026-05-06)

Verhindert, dass dasselbe Logo, der Briefkopf oder ein wiederkehrendes Header-Bild eines mehrseitigen PDFs als N separate Asset-Zeilen abgelegt und N-mal aus RAG zurückgegeben wird.

- `compute_phash()` in `documents.py` berechnet 64-bit perzeptuellen Hash via `imagehash.phash()` über `PIL.Image`. Schutz gegen Decompression-Bombs: `Image.MAX_IMAGE_PIXELS = 50_000_000` auf Modulebene + 20-MB Byte-Cap im Helper + try/except auf `DecompressionBombError` und `UnidentifiedImageError`
- `_mark_recurring_by_phash()` läuft am Ende von `_extract_image_assets_from_pages()` über die gesammelten `embedded_image`-Assets, dekodiert die Data-URI, vergleicht jeden Hash gegen alle bisher als „Canonical" markierten via Hamming-Distanz. Threshold = 4 (innerhalb desselben Dokuments hashen Logo-Crops typisch bei 0–2; 4 ist eng genug um verschiedene Diagramme nicht fälschlich zu mergen)
- Erste Vorkommen pro Cluster bleiben mit `recurring=False` als kanonisch erhalten; nachfolgende werden `recurring=True` markiert
- `upload_image`-Assets werden übersprungen (Einzelnutzer-Upload, kein Dedup-Ziel); `page_image` wird vom Code derzeit nicht geschrieben
- `create_document_assets()` erweitert die Insert-Zeile um `phash` und `recurring`
- Migration `supabase/migrations/20260506_c_asset_phash_recurring.sql`: `phash TEXT` und `recurring BOOLEAN NOT NULL DEFAULT FALSE` auf `app_document_assets`, plus partieller Index `(document_id, phash) WHERE phash IS NOT NULL`. `match_document_assets`-RPC mit unverändertem Signaturen-Layout neu definiert (3-Branch IF/ELSIF/ELSE pool/chat/global), in jedem Branch Filter `AND a.recurring = FALSE`
- Neue Python-Dependencies `Pillow>=10.0.0` und `imagehash>=4.3.1` in `pyproject.toml` und `Dockerfile` pip-install-Zeile (manylinux-wheels verfügbar, kein apt-get nötig auf python:3.11-slim)
- **Cross-Document-Dedup ist ausdrücklich nicht implementiert** — würde tenant-scoped phash-Index oder kanonische Asset-Tabelle benötigen, ist als Future-Work in `docs/TODO.md` zu vermerken
- **Status (verifiziert 2026-05-13):** Code geliefert; Migration **vollständig auf DEV angewendet** — Spalten `phash` und `recurring` existieren, partieller Index `idx_app_document_assets_doc_phash` aktiv, RPC `match_document_assets` enthält den `AND a.recurring = FALSE`-Filter in allen drei Branches (Pool/Chat/Global) per `pg_get_functiondef`-Probe verifiziert. PROD: nichts angewendet, wartet auf prod-catchup-Track.

Dateien: `supabase/migrations/20260506_c_asset_phash_recurring.sql`, `backend/app/documents.py`, `backend/pyproject.toml`, `backend/Dockerfile`

---

## Pool-UI: Persistenter Header + Übersichts-Seite (2026-05-06)

Bisher musste man Tabs (Dokumente / Chats / Mitglieder) wechseln um zu sehen wer im Pool ist oder welche Chats existieren. Beim Öffnen eines Chats verlor man auch jeglichen Pool-Kontext. Zwei UI-Verbesserungen, frontend-only, kein Backend nötig (alle Endpunkte existieren bereits):

**Persistenter Pool-Header** — `frontend/src/components/PoolHeader.jsx` (neu): kompakter Streifen über jedem Pool-Inhalt (auch in offenen Chats), zeigt Pool-Icon, Name, Beschreibung, Avatar-Reihe der ersten 5 Mitglieder mit `+N`-Overflow, sowie klickbare Counts für Dokumente/Chats/Mitglieder. Klick auf Avatar oder Count → `onTabChange()`. Die Komponente hat null-safety für fehlendes Icon, fehlende Beschreibung und kürzere Mitgliederlisten.

**Übersichts-Tab als neuer Default** — `frontend/src/components/PoolOverview.jsx` (neu): Landing-Seite beim Öffnen eines Pools mit vier Karten-Sektionen: Pool-Zusammenfassung, Mitglieder-Vorschau (5 + „Alle anzeigen"), zuletzt erstellte Chats (5), zuletzt hochgeladene Dokumente (5). Jede Sektion hat Empty-State und „Alle anzeigen"-Button der zum entsprechenden Tab wechselt.

Wiring: `Sidebar.jsx` bekommt eine neue `IconOverview`-Komponente und einen vierten Tab-Button (vor Documents/Chats/Members) ohne Count-Badge. `App.jsx` setzt `setPoolTab('overview')` beim Pool-Öffnen statt vorher `'chats'`. `PoolDetail.jsx` rendert `PoolHeader` immer als ersten Flex-Child von `.pool-detail` und `PoolOverview` wenn `activeTab === 'overview'`. `.pool-detail` ist bereits `display: flex; flex-direction: column; overflow: hidden` — keine CSS-Anpassung am Layout nötig, der Chat-Bereich flext sich korrekt unter dem Header ein.

i18n: 19 neue Keys unter `pool.header.*`, `pool.overview.*`, `pool.tab.overview` in `frontend/src/i18n/strings.js`. Alle UI-Strings laufen durch den `t()`-Helper, kein hartcodierter Text in JSX.

Dateien: `frontend/src/components/PoolHeader.jsx` (neu), `frontend/src/components/PoolOverview.jsx` (neu), `frontend/src/components/PoolDetail.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/App.jsx`, `frontend/src/styles.css`, `frontend/src/i18n/strings.js`

---

## RAG-Mehrdokumenten-Bias behoben + Upload-Verarbeitungs-UI (2026-05-07)

### Bug-Befund (verifiziert per 4-Agent-Audit)

Bei einem Chat mit mehreren angehängten Dokumenten (A, B, C) hat das LLM nur Inhalte aus dem Dokument mit der niedrigsten UUID gesehen. Die anderen Dokumente wurden namentlich erwähnt, aber ihr Inhalt war für die Antwort nicht zugänglich. Quellenangaben listeten ebenfalls nur das erste Dokument.

**Ursache:** `_apply_optional_rerank()` und `enrich_with_neighbors()` haben Chunks deterministisch nach `(document_id, chunk_index)` sortiert — alle Chunks von Dokument A zuerst, dann B, dann C. `build_rag_context()` packt anschließend gierig in ein 6000-Token-Budget. Bei ~50 abgerufenen Chunks à ~512 Tokens passten nur ~11–12 ins Budget, und die kamen alle aus dem ersten Dokument. Der Rest wurde stillschweigend verworfen. Existiert seit Commit 3924a41 vom 2026-04-07 (Phase 7.1 Token-Budget-Cherry-Pick).

**Sekundärer Bug:** `rag_sources` (für Quellenangaben im Frontend) wurde aus der vollen Chunk-Liste vor Budget-Pruning gebaut. Citations konnten daher Dokumente listen, deren Inhalt das LLM nie gesehen hat.

**Tertiärer Bug:** `find_existing_document_by_hash()` (A1) hat bei Re-Upload einer Datei das vorhandene Dokument zurückgegeben, unabhängig vom Status. Wenn ein vorheriger Upload `status='error'` oder `status='processing'` hängenblieb, hat jeder erneute Upload derselben Bytes auf dieser kaputten Zeile gepinnt — dauerhafter "neue Uploads werden nicht erkannt"-Fehler.

### Behebung

- **`backend/app/rag.py`** — `_apply_optional_rerank()` und `enrich_with_neighbors()` sortieren jetzt nach `(-similarity, document_id, chunk_index)`. Höchstrelevante Chunks aus beliebigem Dokument kommen zuerst → Token-Budget verteilt sich fair über mehrere Dokumente. Tiebreaker macht Sortierung deterministisch.
- **`backend/app/rag.py`** — `build_rag_context()` gibt jetzt `Tuple[str, List[chunk]]` zurück. Die Surviving-Liste enthält nur Chunks, die ins Token-Budget gepasst haben — Aufrufer bauen Quellenangaben daraus.
- **`backend/app/main.py`** — beide Aufrufstellen (Chat-Path Zeile 626, Pool-Path Zeile 2057) entpacken das Tupel und bauen `rag_sources` aus `surviving_chunks`. Citations spiegeln jetzt exakt wider, was das LLM gesehen hat.
- **`backend/app/documents.py`** — `find_existing_document_by_hash()` filtert jetzt zusätzlich auf `status='ready'`. Re-Uploads nach fehlgeschlagenen Versuchen verarbeiten von Grund auf neu.

### Upload-Verarbeitungs-UI

Neue UX um zu signalisieren, dass ein hochgeladenes Dokument noch nicht RAG-bereit ist:

- **`DocumentList.jsx`** und **`PoolDocuments.jsx`** zeigen einen Verarbeitungs-Badge (Spinner + „Wird verarbeitet"-Text in Orange) statt der vorherigen schwachen `...`-Andeutung
- **Polling-Mechanismus** in `App.jsx` und `PoolDetail.jsx` — wenn die Doc-Liste irgendein Dokument im `processing`-Status enthält, wird ein 5-Sekunden-Timer geschedult, der `loadDocuments()` erneut aufruft. Badge verschwindet automatisch sobald OCR + Embedding fertig sind. Timer wird beim Unmount/Konversationswechsel abgeräumt.
- Neue i18n-Keys `doc.status.processing` und `doc.status.processing.long`. Zwei neue CSS-Klassen `.doc-badge--processing` und `.doc-spinner` mit Keyframe-Animation.

### Caveat zur synchronen Upload-Route

Die Upload-Endpunkte in `main.py` sind synchron — der HTTP-Request blockiert bis OCR + Embedding fertig sind. Der Uploader selbst sieht sein Dokument daher nie im `processing`-Status (es ist `ready` oder `error` wenn der Response zurückkommt). Der Verarbeitungs-Badge ist primär für **Multi-Client-Szenarien** (Pool-Kollaboration, mehrere Tabs) und für den Fall, dass ein Browser-Timeout den Request abbricht während der Server weiterarbeitet. In dem Fall sieht der User beim nächsten Refresh ein „processing"-Dokument und kann auf das automatische Auto-Refresh warten.

Längerfristig wäre ein async-Background-Worker mit Status-Poll-Endpunkt der saubere Fix (in TODO als Folge-Aufgabe).

Dateien: `backend/app/rag.py`, `backend/app/main.py`, `backend/app/documents.py`, `frontend/src/components/DocumentList.jsx`, `frontend/src/components/PoolDocuments.jsx`, `frontend/src/components/PoolDetail.jsx`, `frontend/src/App.jsx`, `frontend/src/styles.css`, `frontend/src/i18n/strings.js`

---

## Line-Art-Icon-System für Pool- und Datei-Icons (2026-05-07)

Ablösung der bisherigen Emoji-Icons (📚, 📖, 🗂️, 📁, 🚀, ⭐, 💡, 🎯 für Pools; 📄, 🖼️, 📝 für Datei-Typen) durch konsistente Line-Art-SVGs im Stil der nav-rail-Icons. Begründung: die bunten Emoji-Icons passten nicht zum sonstigen Design (sauber, monochrom, single-stroke).

**Komponente:** `frontend/src/components/Icon.jsx` (neu) — exportiert zwei React-Komponenten `<PoolIcon emoji="..." />` und `<FileTypeIcon type="..." />`, plus 11 interne SVG-Komponenten (8 Pool-Icons + 3 Datei-Typen).

**Designvorgaben:**
- 24x24 viewBox, `stroke="currentColor"` damit Farbe über Container-CSS vererbt
- Stiftbreite 1.6 (gleich wie nav-rail)
- Pool-Default („Bücher") = drei stehende Bücher in gestaffelten Höhen (höchstes links, kleinstes Mitte, mittleres rechts) mit vertikalen Titel-Linien im unteren Drittel jedes Buchrückens
- Datei-Typ „PDF" = blanke Dokument-Silhouette mit Eckfalz (keine Inhaltszeilen)
- Datei-Typ „Text/Notiz" = Dokument-Silhouette + zwei Schreibzeilen + Stift (Rechteck-Körper mit Dreieck-Spitze, weiße Füllung deckt Doc-Inhalt darunter ab, Spitze endet exakt am Ende der zweiten Zeile)

**Einfacher Rückweg:** in `Icon.jsx` ist die Konstante `LINE_ICONS_ENABLED = true` ganz oben definiert. Auf `false` setzen → die gesamte UI rendert wieder Emojis, ohne DB-Migration. Datenbank-Werte (Pool-Icon-Spalte) bleiben unverändert — der Toggle ist rein render-seitig.

**Verdrahtung in 7 bestehenden Komponenten:**
- `Sidebar.jsx` — 2 Stellen (Pool-Identity-Bereich + Pool-Liste-Items)
- `PoolList.jsx`, `PoolHeader.jsx`, `PoolOverview.jsx` — jeweils 1 Pool-Icon
- `CreatePoolDialog.jsx` — Icon-Picker rendert SVGs für die 8 Auswahloptionen (DB-Werte bleiben Emoji-Strings)
- `DocumentList.jsx`, `PoolDocuments.jsx` — Datei-Typ-Icons in Dokument-Zeilen

**Vorschau-Datei:** `frontend/dev-tools/icon-preview.html` zeigt alle Icons in 15px/28px/48px nebeneinander mit Emoji-Vergleich. Reines Dev-Tool, wird nicht ausgeliefert.

Dateien: `frontend/src/components/Icon.jsx` (neu), `frontend/src/components/Sidebar.jsx`, `frontend/src/components/PoolList.jsx`, `frontend/src/components/PoolHeader.jsx`, `frontend/src/components/PoolOverview.jsx`, `frontend/src/components/CreatePoolDialog.jsx`, `frontend/src/components/DocumentList.jsx`, `frontend/src/components/PoolDocuments.jsx`, `frontend/dev-tools/icon-preview.html` (neu)

---

## Pool-Chats in Hauptliste der Chats (Phase 2, 2026-05-07)

Bisher waren Pool-Chats nur erreichbar nachdem man explizit in den jeweiligen Pool navigiert und dort den Chats-Tab geöffnet hatte. Persönliche und Pool-Chats waren visuell getrennt in unterschiedlichen Sidebar-Bereichen.

Mit Phase 2: persönliche Chats und alle Pool-Chats erscheinen gemeinsam in der Hauptliste der Chats im Sidebar-Panel, chronologisch nach `created_at` sortiert. Pool-Chats sind durch einen farbigen linken Rahmen (Pool-Farbe) und eine Sub-Zeile mit Pool-Icon + „Pool: <Name>" eindeutig als solche markiert. Klick auf einen Pool-Chat-Eintrag navigiert direkt in den Pool und öffnet den Chat (über einen `initialChatId`-Seed an `PoolDetail`).

**Backend (kein Schema-Eingriff):**
- Neues Modul `backend/app/pool_chats.py` mit `list_all_pool_chats_for_user(user_id)`, das über `pools_mod.list_pools_for_user` × `pools_mod.list_pool_chats` aggregiert und jeden Chat mit Pool-Metadaten (`pool_id`, `pool_name`, `pool_icon`, `pool_color`, `pool_role`) anreichert. `message_count` wird im Aggregator ausdrücklich nicht mit zurückgegeben — die zugrundeliegende N+1-Count-Query in `list_pool_chats` würde sich pro Pool multiplizieren; die Sidebar-Liste braucht den Count nicht (er bleibt in der Pool-internen Ansicht).
- Neuer Endpunkt `GET /api/pools/me/chats` in `main.py`, **vor** der parametrischen Route `/api/pools/{pool_id}/chats` registriert, damit FastAPI `me` als Literal-Pfadsegment matched, nicht als Pool-ID.
- Mitgliedschaft ist implizit erzwungen: nur Pools aus `list_pools_for_user(user_id)` werden iteriert, daher braucht der Aggregator keinen separaten Authz-Check pro Pool.
- Kein Audit-Log, keine Rate-Limit (folgt Konvention der bestehenden Read-Endpunkte unter `/api/pools/...`).

**Frontend:**
- `App.jsx`: neue States `poolChats` + `activePoolChatId`. `loadPoolChats` als `useCallback` parallel zu `loadConversations`. `mergedChatItems` via `useMemo` mischt persönliche (`kind: 'personal'`) und Pool-Chats (`kind: 'pool'`), sortiert nach `created_at` desc. Neue Handler `handleOpenChatItem(item)` und `handleDeleteChatItem(item)` verzweigen nach `item.kind`. Wenn ein Pool-Chat geöffnet wird, setzt der Handler synchron `activeSection='pools'`, `activePool`, `displayedPool`, `poolTab='chats'` und `activePoolChatId`, damit `PoolDetail` den Seed-Wert direkt aufnehmen kann.
- `Sidebar.jsx`: neue Props `chatItems`, `activePoolChatId`, `onOpenChatItem`, `onDeleteChatItem`. List-Keys sind `${kind}:${id}` (vermeidet Kollisionsrisiko). Pool-Items bekommen die CSS-Klasse `panel-item--pool` plus inline `borderLeftColor` aus `pool_color`. Sub-Zeile mit `<PoolIcon>` + `t('pool.tag.prefix')` + `pool_name`.
- `PoolDetail.jsx`: neuer Prop `initialChatId`. `useRef('consumedChatIdRef')` verhindert Mehrfach-Konsum bei Re-Renders. Effect-Abhängigkeiten `[initialChatId, activeTab]` — feuert nur, wenn der Tab auf `chats` steht und die ID noch nicht konsumiert wurde. Lokales `activeChat`-State bleibt für die In-Pool-Navigation erhalten.
- `styles.css`: neue Klassen `.panel-item--pool` (linker Rahmen) und `.panel-item-pool-tag` (kleine Schrift in `var(--color-text-light)` mit Inline-Flex für Icon).
- `i18n/strings.js`: neuer Key `pool.tag.prefix` = „Pool: ". Bestehende `pool.overview.chat.shared` / `.private` werden bei Bedarf wiederverwendet.

**Lösch-Bestätigung:** Der `confirm()`-Dialog vor dem Löschen lebt jetzt in `App.jsx handleDeleteChatItem`, mit unterschiedlichen Texten für persönliche Konversationen und Pool-Chats. Das vereinheitlicht das Pre-Phase-2-Verhalten (das die Bestätigung im Sidebar hatte) für beide Chat-Typen.

**Edge Cases:**
- Nutzer ist in 0 Pools → Endpunkt liefert `[]`, `mergedChatItems` enthält nur persönliche Chats (keine Regression zur bisherigen UI).
- Pool wird in einem anderen Tab gelöscht → Click auf den verwaisten Eintrag wirft 403, Handler fängt ab und ruft `loadPoolChats()` zur Bereinigung.
- Nutzer öffnet denselben Pool-Chat zweimal hintereinander aus der Sidebar → `consumedChatIdRef` verhindert nicht den zweiten Aufruf, weil `setActivePoolChatId` denselben Wert setzt; der Effekt feuert dann nicht erneut. Kein Refetch-Loop.

**Bekannte Einschränkungen für später:**
- Kein Polling auf den Aggregator — neue Pool-Chats von Kollegen erscheinen erst beim Reload. Für die Phase-2-Iteration akzeptiert.
- Aggregator inheritiert die N+1-`message_count`-Query aus `list_pool_chats` (Counts werden geholt und dann wieder verworfen). Eine Optimierung wäre eine `list_pool_chats_no_count`-Variante in `pools.py` — bewusst out-of-scope hier um den Touch klein zu halten.

Dateien: `backend/app/pool_chats.py` (neu), `backend/app/main.py`, `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/components/PoolDetail.jsx`, `frontend/src/styles.css`, `frontend/src/i18n/strings.js`

---

## Browser-Favicon (2026-05-07)

Bisher kein Favicon — der Browser-Tab zeigte das generische Standard-Icon. Neues SVG-Favicon im XQT5-Branding: navy „X" + orange „5" als Subscript, also „X₅". Verwendet die Brand-Tokens `#213452` (navy) und `#ee7f00` (orange) direkt im SVG (Inline, da Favicons nicht durch CSS-Token aufgelöst werden können).

Datei `frontend/public/favicon.svg` wird von Vite automatisch unter `/favicon.svg` ausgeliefert; Verlinkung in `frontend/index.html` per `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`. Moderne Browser unterstützen SVG-Favicons direkt; ältere Browser zeigen das Standard-Icon, was akzeptabel ist.

Dateien: `frontend/public/favicon.svg` (neu), `frontend/index.html`

---

## Phase 3.0 — Observability-Log in `build_rag_context()` (2026-05-08)

Temporäres Logging zur Verifikation der Multi-Dok-Bias- und RRF-Sortier-Fixes. Nach jedem erfolgreich gepackten Chunk schreibt `build_rag_context()` einen `phase3=true`-Eintrag mit `{id, doc, idx, sim, rrf, rerank, tok, neighbor}` für jeden Chunk, der ins Token-Budget gepasst hat. Dadurch ist post-hoc nachweisbar, ob die Sortierung tatsächlich Chunks aus mehreren Dokumenten ins Budget bringt und welcher Score (vektor-similarity, RRF, oder Cohere-Rerank) die Reihenfolge bestimmt hat.

**Status (2026-05-13):** Verifikationsmatrix geparkt — siehe `docs/PHASE3-MATRIX-SHELVED.md`. Der Log bleibt unverändert als stehende RAG-Beobachtungs-Telemetrie für manuelle Inspektion via Coolify-Log-Filter `phase3=true`. Ehemals geplante Entfernung „nach Matrix-Sign-off" entfällt; Entfernung erst bei späterem strukturiertem Replacement-Logging.

Dateien: `backend/app/rag.py` (Zeilen 1354–1378)

---

## Phase 3.5 — Filetype-Erweiterung csv/docx/md/xlsx (2026-05-08)

Der Upload-Pfad unterstützte bisher nur PDF (via Mistral OCR), TXT und Bilder. Erweitert auf vier weitere Formate, alle als reine Datei-Lese-Pfade ohne OCR-Roundtrip:

- **`.csv`** — stdlib `csv` mit Sniffer für den Delimiter (komma/semikolon/tab/pipe); Output ist eine Markdown-Tabelle damit der Chunker die Tabellenstruktur sieht.
- **`.md`** — UTF-8-Decode (identisch zu `.txt`); existierende Heading-Hierarchie wird vom Chunker via `extract_section_path()` automatisch genutzt.
- **`.docx`** — `python-docx`, walkt `doc.iter_inner_content()` in Dokumentenreihenfolge. Heading-Style-Paragraphen werden zu Markdown-Headings (`Heading 1` → `#`, `Title` → `#`); Tabellen werden über das `_rows_to_md_table`-Helper als Markdown-Pipe-Tabellen serialisiert.
- **`.xlsx`** — `openpyxl` im read-only/data-only-Modus. Pro Sheet wird ein `## SheetName`-Heading plus eine Markdown-Tabelle emittiert; trailing-empty-rows werden gestrippt.

Wiring:
- `backend/app/main.py:77-81` — `SUPPORTED_UPLOAD_EXTENSIONS` um `.md`, `.csv`, `.docx`, `.xlsx` erweitert.
- `backend/app/main.py:93-101` — neue `_FILE_TYPE_BY_EXT`-Map ersetzt die alte `if/elif`-Kaskade in `_resolve_file_type()`; treibt das `file_type`-Label in der Datenbank und damit die FileTypeIcon-Auswahl im Frontend.
- `backend/pyproject.toml` — neue Deps `python-docx>=1.1.0` und `openpyxl>=3.1.0`.
- Frontend `accept`-Attribute in `FileUpload.jsx` und `PoolDocuments.jsx` synchron erweitert.

Keine Asset-Extraktion aus Office-Formaten in diesem Schritt — `_extract_*_text`-Funktionen geben `[]` für `assets`. Bild-Extraktion aus DOCX/PPTX-Formaten kommt mit OCR-Pipeline v2 (Docling, Roadmap-Priorität #6).

Dateien: `backend/app/documents.py`, `backend/app/main.py`, `backend/pyproject.toml`, `frontend/src/components/FileUpload.jsx`, `frontend/src/components/PoolDocuments.jsx`

---

## Phase 3.5 — Musterbau-Testkorpus + Build-Skript (2026-05-08)

Aufbau eines reproduzierbaren Test-Korpus für manuelles RAG-Testing unter `docs/tests/phase3/corpus/`. Ursprünglich für eine formalisierte Phase-3.1-Verifikationsmatrix angelegt; Matrix selbst ist 2026-05-13 geparkt (siehe `PHASE3-MATRIX-SHELVED.md`), der Korpus bleibt aktiv für Ad-hoc-Prüfungen. Source-of-Truth ist `MUSTERBAU.md` (374 Zeilen) mit gefrorenen Werten für eine fiktive Musterbau GmbH (Dortmund, NRW, 127 FTE, 18,45 M € Umsatz 2025, 30 Mitarbeitende, 50 Kunden, 5 PIMS-Produktlinien, 8 Schlüsselereignisse 2025, 10 BM25-Begriffe mit exklusiver Datei-Zuweisung).

Fixture-Verzeichnis `corpus/musterbau/` mit den aktiven Dateitypen: `geschaeftsbericht_2025.pdf` (12 KB, 7 Seiten, Logo auf jeder Seite identisch für pHash-Test), `finanzen_2025.xlsx` (8 KB, 3 Sheets Bilanz/GuV/Kapitalflussrechnung — Aktiva = Passiva = 9 050 000 €), `memo_strategieklausur.docx` (38 KB), `kunden.csv` (51 Zeilen), `techspec_pims.md` (230 Zeilen), `protokoll_qmeeting.txt` (172 Zeilen), plus `finanzen_legacy.xls` (5,6 KB, 2026-05-11 nachgereicht).

Plus Subset-Ordner für spezifische Tests: `multidoc_a/` (Test A — Multi-Dok-Bias), `long/handbuch_lang.pdf` (50 Seiten, Test B — Token-Budget-Overflow), `dedup/sample.pdf` (Test C), `phash/logo_repeating.pdf` (Test D), `rrf/` (Test F — 1 BM25-starker Anker + 4 Vektor-ähnliche Decoys).

Build-Skript `scripts/build_corpus.py` regeneriert alle Binär-Fixtures (xlsx via openpyxl, docx via python-docx, pdf via reportlab, xls via xlwt). Optionale Deps-Gruppe `corpus = ["reportlab>=4.0", "xlwt>=1.3.0"]` in `pyproject.toml`; Aufruf via `uv pip install -e backend[corpus] && python scripts/build_corpus.py`. Text-Fixtures (md/txt/csv) sind handgeschrieben und werden vom Skript nicht überschrieben. Sanity-Check am Ende von `main()` validiert dass jedes Output existiert und > 1 KB ist.

Dateien: `docs/tests/phase3/corpus/MUSTERBAU.md` (neu), `docs/tests/phase3/corpus/musterbau/*`, `docs/tests/phase3/corpus/{multidoc_a,long,dedup,phash,rrf}/*`, `scripts/build_corpus.py` (neu)

---

## Globe-/Lock-Icon-System + Pool-Übersicht-Rework + Chat-Navigation-Fix (2026-05-08 bis 2026-05-11)

Drei zusammenhängende UI-Iterationen am Pool-Flow.

**Globe + Lock als Line-Art-Icons (toggle-aware).** Frühere Versionen nutzten die bunten Emojis `🌍` (shared chat) und `🔒` (privater chat) — sowohl in `PoolChatList.jsx` als auch im Header von `PoolChatArea.jsx`. Migriert auf `<GlobeIcon>` / `<LockIcon>` in `Icon.jsx`, beide nach dem gleichen Muster wie die bestehenden `LINE_ICONS_ENABLED`-Toggle-Komponenten — bei `false` rendern sie die Emojis als Fallback, bei `true` (default) die Line-Art-SVGs. Mehrere Design-Iterationen (User wählte aus 20+20 Vorschlägen für die finale Form von Globe + Lock).

**Pool-Übersicht Summary-Karte vereinfacht.** Die Summary-Sektion in `PoolOverview.jsx` zeigte bisher `<PoolIcon size={32}>` + Name + Beschreibung + `<RoleBadge>` („Eigentümer:in"). Neu: nur noch `Name: "{pool.name}"` plus eine Zeile mit Zählern `{N} Dokumente · {M} Chats · {K} Mitglieder` plus optionale Beschreibung. PoolIcon und RoleBadge gestrichen — das große Icon bleibt nur noch in `PoolHeader.jsx` (Bar darüber). Vier neue i18n-Keys: `pool.overview.summary.{name_label, docs, chats_count, members_count}`.

**Chat-Navigation aus der Übersicht repariert.** Klick auf einen Chat-Eintrag in der Übersicht hat das Chat-Fenster nicht geöffnet — `handleOpenChat()` in `PoolDetail.jsx` setzte zwar `activeChat`, ließ aber `activeTab` auf `'overview'`. Die Render-Bedingung in `PoolDetail.jsx:227` ist `activeTab === 'chats' && activeChat` — also blieb die Übersicht sichtbar. Fix: `onTabChange('chats')` vor der async-Chat-Fetch in `handleOpenChat`, damit Tab und Chat synchron umgeschaltet werden.

Dateien: `frontend/src/components/Icon.jsx`, `frontend/src/components/PoolChatList.jsx`, `frontend/src/components/PoolChatArea.jsx`, `frontend/src/components/PoolOverview.jsx`, `frontend/src/components/PoolDetail.jsx`, `frontend/src/i18n/strings.js`, `frontend/src/styles.css`

---

## Favicon-Iteration: typographic redesign + Firefox-Fix (2026-05-08 bis 2026-05-11)

Drei Iterationen am Favicon nach dem initialen Wurf vom 2026-05-07:

1. **Stroke-Verdickung** (2026-05-08) — X-Stroke 4.6 → 5.5, „5"-Path-Stroke 2.3 → 3.0 für bessere Lesbarkeit bei 16×16. Plus 32×32- und 16×16-PNG-Fallbacks über Pillow gerendert, eingebunden in `index.html` mit `?v=2`-Cache-Bust.
2. **`.ico`-Fallback** (2026-05-10) — Firefox triggert beim Tab-Wechsel teils eine implizite `/favicon.ico`-Anfrage, die ohne tatsächliche `.ico`-Datei 404 lieferte und auf das Browser-Default-Globe-Icon zurückfiel. Neue Datei `frontend/public/favicon.ico` + `<link rel="icon" href="/favicon.ico" sizes="any">` in `index.html` (Priorität vor den PNGs/SVG).
3. **Typografische Neugestaltung** (2026-05-10/11) — `favicon.svg` komplett gestrichen, durch hochauflösendere `.ico` + PNGs ersetzt. User wählte das finale Design aus 20 Vorschlägen. Cache-Bust auf `?v=5`.

Dateien: `frontend/public/favicon.ico` (neu), `frontend/public/favicon-32.png`, `frontend/public/favicon-16.png`, `frontend/index.html` — `frontend/public/favicon.svg` entfernt.

---

## RRF-Sortier-Bug behoben (Finding 2, 2026-05-11)

Während der Phase-3-Code-Audit fiel auf: der Multi-Dok-Bias-Fix vom 2026-05-07 (Sortierung nach `(-similarity, document_id, chunk_index)` in `_apply_optional_rerank()`) wird im hybriden Retrieval-Pfad (Vektor + BM25 → RRF) **stillschweigend unterminiert**, sobald die No-Rerank-Branch genommen wird.

**Mechanismus:** `_bm25_search_chunks()` in `rag.py:751` mappt den BM25-Score (0–~5,0-Skala) in das `similarity`-Feld — derselbe Slot, in dem Vektorhits ihre Cosine-Similarity (0–1-Skala) tragen. `_reciprocal_rank_fusion()` merged beide Listen korrekt nach RRF und schreibt jedem überlebenden Chunk einen sauberen `rrf_score`. `_apply_optional_rerank()` sortiert dann aber wieder nach `similarity` — was die RRF-Reihenfolge zerschießt, sobald BM25-Hits beitragen, da deren `similarity`-Werte (BM25-Skala) signifikant kleiner sind als Vektor-Cosine-Werte.

**Fix:** Sortier-Key in `_apply_optional_rerank()` (rag.py:949–953) ändert von `-float(c.get("similarity", 0.0))` auf `-float(c.get("rrf_score") or c.get("rerank_score") or c.get("similarity", 0.0) or 0.0)`. RRF gewinnt wenn vorhanden, sonst Cohere-Rerank-Score (falls anwesend), sonst Fallback auf Similarity. Tiebreaker (document_id, chunk_index) bleibt unverändert.

**Lasttragend** weil kein Cohere-API-Key konfiguriert ist (Decision 2026-05-11: no-rerank ist akzeptierte aktuelle Design). Ohne Rerank-Stage ist diese Sortierung der einzige Re-Ordering-Mechanismus nach der Hybrid-Retrieval-Fusion. Vor dem Fix wurde RRF im Default-Pfad praktisch jedes Mal eingeebnet.

Dateien: `backend/app/rag.py` (Zeilen 940–955)

---

## Dockerfile-Umbau auf `uv sync --frozen` + `pyproject.toml`-Härtung (2026-05-11)

**Anlass:** Beim Test von DOCX- und XLSX-Upload nach dem 2026-05-08-Deploy lieferte das Backend `ModuleNotFoundError: No module named 'openpyxl'` bzw. `'docx'` — obwohl beide Deps seit 2026-05-08 in `backend/pyproject.toml` standen. Befund: der bisherige `backend/Dockerfile` hatte eine hardcoded `pip install`-Liste, die `pyproject.toml` ignorierte. Jede seit Initial-Setup ergänzte Dep wurde beim Coolify-Build still verworfen.

**Korrektur:**
- Dockerfile installiert jetzt `uv` (`pip install --no-cache-dir uv`) und ruft `uv sync --frozen --no-dev --no-install-project` gegen `backend/uv.lock` auf. Lockfile-getrieben, mit SHA-256-Hash-Verifikation. `pyproject.toml` deklariert das Dep-Set + Versions-Obergrenzen; `uv.lock` pinnt die exakten Versionen, die ausgeliefert werden. Lockfile gewinnt bei Konflikt.
- `--no-install-project` weil die Runtime den App-Quellcode aus dem Filesystem-Pfad `/app/app` importiert (per `COPY app /app/app`), nicht über ein installiertes Wheel. Das venv unter `/app/.venv` hält nur die Drittabhängigkeiten.
- `pyproject.toml` mit Defense-in-Depth-Obergrenzen gehärtet: `fastapi>=0.115.0,<1.0`, `pydantic>=2.9.0,<3.0`, `supabase>=2.0.0,<3.0`, `bcrypt==4.0.1` (exakt — Projektregel CLAUDE.md). Verhindert dass ein späteres `uv lock` versehentlich einen Breaking-Major einzieht.
- `uv.lock` regeneriert. bcrypt 5.0.0 → 4.0.1 (downgrade), xlrd + xlwt neu hinzugefügt. 88 Pakete final, keine transitiven Konflikte.

**Dokumentation:** Neuer Abschnitt „Build & deploy" in `xqt5-ai-plattform/CLAUDE.md`, Fehlerjournal-Eintrag in `docs/CODING-DOKUMENT.md`, Inline-Header-Kommentar im Dockerfile.

Dateien: `backend/Dockerfile`, `backend/pyproject.toml`, `backend/uv.lock`, `CLAUDE.md`, `docs/CODING-DOKUMENT.md`

---

## `.xls`-Support + Legacy-Fixture (2026-05-11)

Erweiterung des Upload-Pfads um das Legacy-BIFF8-Excel-Format `.xls`. Dep `xlrd>=1.2,<2.0` (xlrd ≥ 2.0 hat die `.xls`-Unterstützung absichtlich entfernt; das Format ist seit 1997 eingefroren, daher ist die Wartungsunsicherheit hier vertretbar). Extractor `_extract_xls_text` in `documents.py:213` spiegelt die XLSX-Logik: pro Sheet ein `## SheetName`-Heading + Markdown-Tabelle. `.xls` im `SUPPORTED_UPLOAD_EXTENSIONS`-Tupel und `_FILE_TYPE_BY_EXT`-Map ergänzt; Frontend-`accept`-Attribute synchron.

Build-Skript erweitert: neue Funktion `build_finanzen_legacy_xls()` in `scripts/build_corpus.py` schreibt eine einzelne `Bilanz_Alt`-Sheet im BIFF8-Format via xlwt. Produkt: `docs/tests/phase3/corpus/musterbau/finanzen_legacy.xls` (5,6 KB, 14 Zeilen × 2 Spalten). Wiederverwendet die gefrorenen MUSTERBAU.md-Konstanten. xlwt ist nicht in den Production-Deps, sondern im optionalen `corpus`-Extra in `pyproject.toml` — wird nur für Fixture-Regenerierung gebraucht.

**`.doc` und `.ppt` bewusst geschoben.** Diese Legacy-Binärformate benötigen System-Tool-Subprozesse (`antiword`, `catdoc`) als Nixpkgs-Einträge. Würde das Coolify-Image um ~15 MB aufblähen. `.pptx` wurde nach detailliertem Audit ebenfalls geschoben (siehe nächster Abschnitt). Revisit bei OCR-Pipeline-v2-Adoption (Roadmap #6, Docling unterstützt `.pptx`/`.docx`/`.xlsx` nativ).

Dateien: `backend/app/documents.py`, `backend/app/main.py`, `backend/pyproject.toml`, `backend/uv.lock`, `frontend/src/components/FileUpload.jsx`, `frontend/src/components/PoolDocuments.jsx`, `scripts/build_corpus.py`, `docs/tests/phase3/corpus/musterbau/finanzen_legacy.xls` (neu)

---

## `.pptx`-Fixture nach `_shelved/` verschoben (2026-05-11)

Eine adversarielle Code-Review von `python-pptx` (PyPI 1.0.2, MIT, einziger pure-Python-Pfad für PPTX-Extraktion) ergab drei stille Datenverluste: (1) Bilder auf Folien werden komplett verworfen, (2) Text innerhalb von Group-Shapes wird nicht rekursiv erreicht, (3) Notes-Slides (Sprechernotizen) werden standardmäßig nicht geliefert. Eine echte Strategiepräsentation würde damit ihre substanzielle Diagramm- und Notiz-Inhalte verlieren, ohne dass das System einen Warning ausgibt — der Worst-Case bei Retrieval, da der Index dann selbstüberzeugend unvollständig ist.

Die bereits generierte Test-Fixture `strategieklausur_2025.pptx` (44 KB, 11 Folien, rein textbasiert) hätte einen Smoke-Test problemlos passiert und das Real-World-Problem verdeckt. Entscheidung: PPTX zusammen mit `.ppt` und `.doc` parken bis OCR-Pipeline v2 (Docling) verfügbar ist — Docling liest `.pptx`/`.docx`/`.xlsx` mit Layout-Bewusstsein inklusive Bilder und Charts.

Die Fixture wurde nach `docs/tests/phase3/corpus/_shelved/` verschoben (nicht gelöscht — soll mit dem Extractor reaktiviert werden). Plus neue Datei `_shelved/README.md` mit dem Begründungsblock + Reaktivierungs-Checkliste für die spätere Wiederbelebung.

Dateien: `docs/tests/phase3/corpus/_shelved/strategieklausur_2025.pptx` (verschoben aus `corpus/musterbau/`), `docs/tests/phase3/corpus/_shelved/README.md` (neu)

---

## Multi-Datei-Upload mit Concurrency=2 + 401-Retry-Fix (2026-05-11)

**User-Wunsch:** mehrere Dateien gleichzeitig hochladen, gemischte Filetypes. Vorher: Single-File-Picker, Single-File-XHR, kein Batch-Konzept.

**Frontend (`FileUpload.jsx` + `PoolDocuments.jsx`):**
- `<input type="file" multiple>` aktiviert die OS-Multi-Select-UI.
- Per-Datei-State-Array `{ file, name, status: 'pending'|'uploading'|'done'|'error', pct: 0-100|-1, error: string|null }` lebt lokal in der jeweiligen Komponente (nicht in App.jsx — der bisherige `setError`-String-Blob hätte vorhergehende Fehler beim nächsten File überschrieben).
- Worker-Pool-Semaphore mit `MAX_CONCURRENT = 2`: zwei Worker ziehen sequentiell den nächsten verfügbaren Index aus der Queue, bis sie leer ist. Worst-Case-Zeit für eine 8-PDF-Batch halbiert ohne die Rate-Limit-Wand zu rammen.
- Warning-Dialog wenn Auswahl > 20 Dateien — informiert über das Backend-Rate-Limit von 20 Uploads/Minute.
- Per-Datei-Status-Liste unter dem Upload-Button; Fehler stehen pro Zeile (Tooltip enthält Detail). „Liste leeren"-Button nach Abschluss räumt erledigte/fehlerhafte Einträge weg.

**`api.js` `uploadWithXhr` 401-Retry (gleichzeitiger Bugfix):** Die XHR-Upload-Funktion liest das Access-Token einmal bei XHR-Open und retried nicht. Bei langen Batches (8 PDFs × 5–15 s OCR = 40–120 s) konnte das Token mid-Batch ablaufen → silent 401 → restliche Dateien starben unbemerkt. Fix: `xhr.onload` prüft auf `status === 401 && !_isRetry`, ruft `tryRefresh()`, retried die Anfrage genau einmal mit dem neuen Token. War ein pre-existing Bug, der auch Single-File-Uploads betraf, aber im neuen Multi-File-Kontext erst sichtbar geworden ist.

**Rate-Limit unverändert bei 20/min** (User-Entscheidung): Files jenseits davon zeigen `HTTP 429` als Per-Datei-Fehler — der Batch crasht nicht, andere Dateien fließen weiter.

**App.jsx + PoolDetail.jsx `handleUploadDocument`-Handler:** früher wurden Errors gefangen und in `setError()` gepackt, was die Per-Datei-Fehlerinfo zerstörte. Jetzt propagieren die Handler die Errors — FileUpload/PoolDocuments fangen sie in `processOne()` und schreiben sie in den Per-Datei-State-Array.

CSS für die neuen Batch-Listen in `styles.css` (`.file-upload-list`, `.file-upload-item--{pending,uploading,done,error}`, `.pool-upload-batch`).

Dateien: `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/components/FileUpload.jsx`, `frontend/src/components/PoolDocuments.jsx`, `frontend/src/components/PoolDetail.jsx`, `frontend/src/styles.css`

---

## Rheintal — Zweiter Testkorpus (Kunstakademie e. V., 2026-05-11)

Aufbau eines zweiten, von Musterbau **bewusst disjunkten** Testkorpus, um Vielfalt in den RAG-Tests zu schaffen. Domäne, Vokabular, Entitäten, ID-Namensräume, Standort und Rechtsform haben null Überschneidung mit Musterbau.

**Fiktive Organisation:** Kunstakademie Rheintal e. V. (Vereinsregister VR 4312 Freiburg im Breisgau, gegründet 1997, gemeinnützig nach §52 AO) mit 100%-Tochter Rheintal Akademie gemeinnützige GmbH. Sitz Freiburg, drei Standorte. 21 Festangestellte (PER-001…PER-021), 34 Honorar-Kursleiter (KL-01…KL-34), 87 Kurse (KU-001…KU-087), 318 Vereinsmitglieder, 10 Schlüsselereignisse 2025 (EV-01…EV-10), 1,24 Mio. € balancierter Jahreshaushalt (gemeinnützig, kein Jahresüberschuss).

**Spec:** `docs/tests/phase3/corpus/rheintal/RHEINTAL.md` (330 Zeilen) — alle Werte gefroren, dient als Source-of-Truth für die Fixture-Agenten.

**7 Fixtures unter `corpus/rheintal/`:** `taetigkeitsbericht_2025.pdf` (10,7 KB, 4 Seiten; rare terms `Werkförderverfahren`, `Druckgrafik-Residenz`); `honorarvertrag_gruber.docx` (40 KB, 42 Absätze + 2 Tabellen, 6 nummerierte §-Klauseln + Unterschriftenblock + Anhang; rare term `Atelierüberlassung`); `haushaltsplan_2025.xlsx` (9,7 KB, 3 Sheets, Einnahmen = Ausgaben = 1 240 000 €; rare terms `Satzungsklausel-7`, `Verwendungsnachweis-Frist`); `kursbelegung_legacy.xls` (9,7 KB, BIFF8, 33 historische Zeilen; rare term `Trimesterauslastungsindex`); `kursleiter.csv` (35 Zeilen, 7 Spalten); `akademieprogramm_t3.md` (320 Zeilen, 3-stufige Heading-Hierarchie; rare terms `Residenzstipendium`, `Atelierausleihe-Protokoll`); `protokoll_jhv_2025.txt` (394 Zeilen, drei kombinierte Sitzungsprotokolle; rare terms `Kursgruppenrotationsverfahren`, `Beitragsordnungsbeschluss`).

**Cross-Datei-Anker (Multi-Doc-Retrieval-Test):** 5 Schlüsselfiguren tauchen in 4+ Fixtures auf (Dr. Margit Feuerbach Geschäftsführerin, Lukas Endres Programmdirektor, Prof. Anita Gruber KL-01, Urte Hamann Förderanträge, Franziska Oppelt Ausstellungskoordination). 10 BM25-Rare-Terms je exklusiv einer Datei zugewiesen — keine Überlappung mit Musterbau's Rare-Terms (Drewermann-Verfahren, OBELISK-7, etc.).

`scripts/build_corpus.py` erweitert um vier neue Builder-Funktionen (`build_taetigkeitsbericht`, `build_honorarvertrag`, `build_haushaltsplan`, `build_kursbelegung_legacy`); `main()`-Output-Liste wuchs von 8 auf 12 Einträge. Sanity-Check bleibt dynamisch via `len(outputs)`.

**Garantie keine Musterbau-Berührung:** Während der Generierung wurden ausschließlich Dateien unter `corpus/rheintal/` neu angelegt und `scripts/build_corpus.py` modifiziert; `git status` bestätigte dass weder `corpus/musterbau/` noch die anderen Subset-Ordner angefasst wurden.

Dateien: `docs/tests/phase3/corpus/rheintal/RHEINTAL.md` (neu), `docs/tests/phase3/corpus/rheintal/*` (7 Fixtures, neu), `scripts/build_corpus.py`

---

## i18n-Drift-Bereinigung an Pool-Komponenten (2026-05-12)

**Anlass:** UI-Audit fand drei englisch-in-deutscher-UI-Regressionen: `PoolChatList.jsx` mischte "Shared Chats" (englisch) mit "Meine privaten Chats" (deutsch); `DocumentList.jsx` hatte einen englischen Tooltip `title="Remove document"` plus einen englischen Chunk-Count-Fallback `${n} chunks`; `Sidebar.jsx`, `PoolList.jsx`, `PoolMembers.jsx` und `PoolShareDialog.jsx` rendern die Pool-Rolle als rohen Backend-Wert (`viewer`/`editor`/`admin`/`owner`) statt über die existierenden `pool.header.role.*`-i18n-Keys, während `PoolOverview.jsx` bereits korrekt routete — Inkonsistenz für Nutzer:innen, die zwischen Ansichten wechseln.

**Drei separate Commits, drei kleine Patches:**

1. **PoolChatList** — 5 hartkodierte Strings durch 5 neue `pool.chat.*`-Keys ersetzt (`button.shared`, `button.private`, `section.shared`, `section.private`, `empty`). Namespace bewusst auf `pool.chat.*` statt `pool.chatlist.*` gesetzt, damit die Keys nicht an einen Komponentennamen gebunden sind (überdauert Refactorings). Das verbleibende `confirm('Chat löschen?')` blieb für den späteren ConfirmDialog-Refactor.

2. **DocumentList** — `title="Remove document"` → `title={t('doc.action.delete')}` (Wert `Dokument löschen` — passt zu PoolDocuments-Konvention; Codebase nutzt „löschen" für destruktive Aktionen, „entfernen" nur für Mitglieds-Entfernungen aus Pools). Zusätzlich der englische Fallback `${chunk_count} chunks` → `${chunk_count} ${t('doc.chunks')}` mit neuem Key `doc.chunks: 'Chunks'`. Zwei neue Keys, zwei Zeilen Code geändert.

3. **Pool-Rollen-Badge** — `t(\`pool.header.role.${role || 'viewer'}\`)`-Pattern (Fallback gegen `undefined`) in 5 Render-Stellen über 4 Komponenten ausgerollt: `Sidebar.jsx` (zweimal: aktiver Pool-Nav-Identitäts-Block + Pools-Liste), `PoolMembers.jsx`, `PoolList.jsx`, `PoolShareDialog.jsx`. Das Pattern existierte schon in `PoolOverview.jsx`; jetzt überall konsistent. `t`-Import in den 3 Komponenten ergänzt, die ihn noch nicht hatten. Anti-Scope: die `<select>`-Optionslabels (`<option>Viewer/Editor/Admin</option>` in PoolMembers.jsx) bleiben vorerst englisch — separater Folge-PR.

**Workflow-Hinweis:** Jede Änderung wurde vorab durch zwei oder drei parallele Subagent-Reviews (Impact-Scope, kritischer Reviewer, Cross-Component-Sweep) geprüft, bevor der Edit lief. Insbesondere für die Rollen-Badges hat der Cross-Component-Sweep aufgezeigt, dass eine Sidebar-only-Fix die UI patchwork-inkonsistent gemacht hätte — Scope-Erweiterung auf alle 5 Sites war die richtige Wahl.

Dateien: `frontend/src/components/PoolChatList.jsx`, `frontend/src/components/DocumentList.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/components/PoolList.jsx`, `frontend/src/components/PoolMembers.jsx`, `frontend/src/components/PoolShareDialog.jsx`, `frontend/src/i18n/strings.js` (+7 Keys: 5 `pool.chat.*`, 2 `doc.*`)

---

## Geteilte Modal- und ConfirmDialog-Primitiven (2026-05-12)

**Anlass:** UI-Audit fand zwei zusammengehörige Mängel: (1) vier Modal-Komponenten (`CreatePoolDialog`, `PoolShareDialog`, `AssistantManager`, `TemplateManager`) verwendeten rohes `.modal-overlay`-Markup ohne A11y-Attribute (`role="dialog"`, `aria-modal`, Fokus-Trap, Esc-Handler, Fokus-Rückkehr beim Schließen). (2) 15 Aufrufe von `window.confirm()` über 8 Dateien lieferten den nativen Browser-Dialog statt eines styled Modals, optisch fremd zum XQT5-Designsystem. Beide Probleme teilen sich dieselbe Lösung — ein geteiltes Modal-Primitiv —, daher wurden sie in einem Commit gebündelt.

**Architektur — zwei neue Komponenten unter `frontend/src/components/`:**

- **`Modal.jsx`** — deklarative Children-API. Props: `onClose`, `title`, `children`, `role` (Default `dialog`, ConfirmDialog überschreibt mit `alertdialog`), `labelledBy`, `describedBy`, `size` (Passthrough-Klasse, z. B. `confirm` für schmalere Confirm-Boxen), `closeOnBackdropClick` (Default `true`; auf `false` für State-erhaltende Dialoge wie PoolShareDialog gesetzt), `className`. Implementiert: `aria-modal="true"`, `aria-labelledby` an auto-generierte Titel-ID, Esc-Key-Listener, Tab/Shift-Tab-Fokus-Trap zwischen erstem und letztem fokussierbaren Innen-Element, Fokus-Rückkehr zum ursprünglichen Trigger beim Unmount, Backdrop-Click-Schließen (per Prop togglebar), Klick auf Modal-Content stoppt die Propagation. Fokus-Initialisierung läuft in `useLayoutEffect` — prüft zuerst, ob `document.activeElement` bereits im Modal liegt (autoFocus auf z. B. den Name-Input in `CreatePoolDialog` hat dann schon gewonnen) und greift sonst zum ersten fokussierbaren Element. Damit fight nichts mit Reacts autoFocus-Attribut.

- **`ConfirmDialog.jsx`** — exportiert `ConfirmProvider` und Hook `useConfirm()`. Provider mountet in `main.jsx` *oberhalb* von `<App />` — also außerhalb der Auth-Gate, damit auch eine spätere Dialog-Verwendung in `LoginScreen` funktioniert. Der Hook liefert eine async-Funktion: `const ok = await confirm({ title, message, confirmLabel, cancelLabel, destructive })`. Default-Labels deutsch (`Bestätigen` / `Abbrechen`). Bei `destructive: true` bekommt der Confirm-Button die `btn-danger`-Klasse. Default-Fokus liegt auf dem **Cancel**-Button (sicherer Default für destruktive Aktionen). Intern wird `<Modal role="alertdialog" closeOnBackdropClick={false} size="confirm">` gerendert.

**Retrofit-Scope: 2 von 4 Modalen + alle 15 `confirm()`-Aufrufe.**

- **`CreatePoolDialog` und `PoolShareDialog`** auf `<Modal>` migriert. `PoolShareDialog` bekam `closeOnBackdropClick={false}`, weil ein versehentlicher Backdrop-Klick nach dem Erzeugen eines Einladungs-Tokens (mit Copy-to-Clipboard-Button) den frisch erzeugten Token wegwerfen würde — user-feindlich.
- **`AssistantManager` und `TemplateManager`** bewusst **nicht** migriert. Beide haben ein Zwei-Panel-Layout (Listenansicht ↔ Edit-Form) mit eigener Mode-switchender Header-Logik, das nicht in eine `<Modal title="...">`-Single-Child-API passt. Erzwungene Migration hätte den State-Machine-Layer durch den Modal-Wrapper hindurch zerflust. Die nicht-migrierten Modale behalten ihr `.modal-overlay`-Markup; ihre `confirm()`-Aufrufe (`Assistent löschen?`, `Vorlage löschen?`) wurden trotzdem auf den Hook umgestellt.
- **Alle 15 `confirm()`-Sites** ersetzt: `App.jsx` (3), `PoolMembers.jsx` (1), `PoolChatList.jsx` (2 inline Arrow-Handler in `<button onClick>` zu einem `handleDelete(e, chatId)` zusammengezogen, weil identische Logik), `PoolDocuments.jsx` (2 inkl. Rate-Limit-Warnung), `FileUpload.jsx` (1 Rate-Limit-Warnung), `AdminDashboard.jsx` (4 — `UsersTab.handleDelete`, `RetrievalTab.handleRechunk`, `ModelsTab.handleDelete`, `ProvidersTab.handleDelete`; jede Sub-Tab-Komponente ruft `useConfirm()` separat statt Prop-Drill), `AssistantManager.jsx` (1), `TemplateManager.jsx` (1). Pro Site wurde der Prompt-String in `title` + `message` aufgeteilt und ein passender `confirmLabel` (`Löschen` / `Entfernen` / `Deaktivieren` / `Verlassen` / `Fortfahren`) gewählt. Drei Aufrufe sind nicht-destruktiv und nutzen `destructive: false`: Pool-Verlassen, Admin-Rechunk-Trigger, Rate-Limit-Warnungen bei Upload-Batches.

**Was bewusst draußen blieb:**
- Die zwei Vorschau-Modale in `PoolDocuments.jsx` (`.pool-preview-modal-backdrop`, `.pool-text-modal`) — anderes CSS-Pattern (fullscreen Datei-Preview vs. Form-Dialog), separates Scope.
- Eine `IconButton`-Primitive für alle Icon-only-Buttons (aria-label-Sweep) — separates Scope.
- Die `<select><option>Viewer/Editor/Admin</option>`-Labels in `PoolMembers.jsx:102-104` — separater i18n-Folge-PR.

**CSS:** Bestehende `.modal-overlay`/`.modal-content`/`.modal-header`/`.modal-close`-Regeln (`styles.css:1352-1410`) wurden nicht angefasst — `Modal.jsx` rendert exakt dieselbe DOM-Struktur. Nur zwei kleine neue Regeln ergänzt: `.modal-content--confirm { max-width: 440px }` (schmalere Confirm-Box) und `.confirm-message { ... white-space: pre-line }` (für mehrzeilige Confirm-Messages wie der Rechunk-Warnung mit `\n`).

**A11y-Wirkung:** Tab-Fokus zirkuliert nicht mehr ins darunterliegende Hauptfenster, Esc schließt jedes Modal, Fokus kehrt nach dem Schließen zum Trigger-Element zurück, Screenreader bekommen `role="dialog"`/`role="alertdialog"` + Titel-Aria-Label. Native `window.confirm()` ist eliminiert — der Browser-Dialog war bisher die einzige Stelle in der UI ohne XQT5-Branding.

Dateien (neu): `frontend/src/components/Modal.jsx`, `frontend/src/components/ConfirmDialog.jsx`
Dateien (geändert): `frontend/src/main.jsx` (ConfirmProvider-Mount), `frontend/src/App.jsx`, `frontend/src/components/CreatePoolDialog.jsx`, `frontend/src/components/PoolShareDialog.jsx`, `frontend/src/components/AssistantManager.jsx`, `frontend/src/components/TemplateManager.jsx`, `frontend/src/components/AdminDashboard.jsx`, `frontend/src/components/PoolMembers.jsx`, `frontend/src/components/PoolChatList.jsx`, `frontend/src/components/PoolDocuments.jsx`, `frontend/src/components/FileUpload.jsx`, `frontend/src/styles.css` (+10 Zeilen CSS)

---

## Tabellen-Icon für csv/xlsx/xls (2026-05-12)

**Anlass:** In der Pool-Dokumentenliste wurden hochgeladene Spreadsheets (`.xlsx`/`.xls`) und CSV-Dateien mit dem Text-Datei-Icon (Dokumentsilhouette mit Schreibstift) gerendert. Grund: `FileTypeIcon` (`frontend/src/components/Icon.jsx`) hatte nur drei Mappings — `pdf`, `image`, alles andere → `txt`. Die drei tabellarischen Formate fielen in den `txt`-Bucket und sahen damit wie Notizen aus.

**Korrektur:** Neue Line-Art-Komponente `TableFileIcon` (Dokumentsilhouette mit umgeklappter Ecke wie die anderen Filetype-Icons, plus innenliegendem 2×2-Gitter mit `rx="0.5"`-Abgerundung). Renderstil identisch zu den Geschwister-Icons: `viewBox 24×24`, `stroke="currentColor"`, `strokeWidth 1.6`, `strokeLinecap/Linejoin round`. Neuer Schlüssel `table` in der `FILE_TYPE_ICONS`-Map; neuer `TABLE_FILE_TYPES`-Set kapselt das `{csv, xlsx, xls}`-Resolver-Mapping in `FileTypeIcon`. Emoji-Fallback (für den `LINE_ICONS_ENABLED = false`-Modus) auf `\u{1F4CA}` (Balkendiagramm) für tabellarische Typen erweitert.

Dateien: `frontend/src/components/Icon.jsx`

---

## Persistente Seitenleiste statt Auto-Close-Overlay (2026-05-12)

**Anlass:** Bisher schloss sich die sekundäre Seitenleiste (`.content-panel` zwischen `NavRail` und Hauptinhalt) automatisch, sobald die Nutzer:in einen Chat öffnete, einen Pool wählte, einen Pool-Tab wechselte oder eine neue Konversation startete. Das zerriss den Navigationsfluss — wer durch mehrere Pools oder Chats stöbern wollte, musste die Seitenleiste vor jedem Schritt neu aufrufen. Die Nutzer:in hat um persistente Sichtbarkeit gebeten: Seitenleiste bleibt offen, bis sie explizit geschlossen wird.

**Architekturwechsel — Overlay → Layout-Spalte:**

Die `.content-panel` war bisher `position: absolute` über dem Hauptinhalt (Glasmorph-Floating-Card mit `z-index: 200`, links `56px` neben dem NavRail) — Hauptinhalt war sich des Panels nicht bewusst, hat seine Breite nie geteilt, das Panel hat den Hauptinhalt verdeckt. Jetzt ist `.content-panel` ein normales Flex-Item in der `.app`-Reihe: `flex-shrink: 0`, `width: 248px`, `margin: 8px 0` (vertikale 8-px-Atemluft wie vorher), keine `position`-Eigenschaft mehr, kein `z-index` mehr nötig. Die Glassmorph-Optik (`backdrop-filter`, abgerundete Ecken, Schatten) bleibt erhalten — visuell sehr ähnlich, aber jetzt drückt das Panel `ChatArea`/`PoolDetail` um seine eigene Breite zur Seite, statt sie zu überdecken. `.content-panel--hidden` ist jetzt `display: none` (sauberer Layout-Kollaps; die alte `scale+opacity`-Federanimation wäre für eine Layout-Spalte irreführend).

**Mobile-Drawer-Fallback (`@media (max-width: 768px)`):** Auf schmalen Viewports würde eine permanente 248-px-Spalte zusammen mit dem 56-px-NavRail den Hauptinhalt auf unter 768 px stauchen. Daher revertet eine Media-Query unter 768px Breite die `.content-panel` wieder auf `position: absolute` + `scale+opacity`-Animation für `.content-panel--hidden` — auf Mobil bleibt die Seitenleiste ein Drawer-Overlay. Das `useEffect` in `App.jsx` (Click-Outside-schließt) hat jetzt einen `window.matchMedia('(max-width: 768px)').matches`-Guard, sodass Outside-Click-Close ausschließlich auf Mobil feuert.

**State-Cleanup in `App.jsx`:** Fünf Aufrufe von `setSidebarOpen(false)` entfernt — die, die bei Chat-Erstellung (`onCreateConversation`), Chat-Öffnen (`onOpenConversation`), Pool-Auswahl (`handleSelectPool`), Pool-Tab-Wechsel (`onPoolTabChange`) auto-schlossen. Der admin-Branch in `handleSectionChange` behält den `setSidebarOpen(false)`-Aufruf als bewusste Ausnahme: das `AdminDashboard` hat dichte Tabellen und Toggles, die mit einer Seitenleiste daneben unleserlich würden — Admin bleibt damit vollbreit. Zusätzlich räumt der chat-Branch jetzt `setActivePoolChatId(null)` auf, damit eine pools→chat→pools-Sequenz nicht heimlich einen alten Pool-Chat wieder einfädelt (Reviewer-Finding C-4). `handleClosePool` klärt zusätzlich `setDisplayedPool(null)` — vorher blieb der Hauptinhalt auf dem alten Pool stehen, während die Seitenleiste schon die Pool-Liste zeigte; das war im Auto-Close-Modell unsichtbar, mit persistenter Seitenleiste aber ein offensichtlicher State-Mismatch.

**Explizite Schließ-Affordanzen:** Drei Wege, das Panel zu schließen — alle bewusst belassen: (1) NavRail-Icon der aktiven Section nochmals klicken (`handleSectionChange`-Toggle-Branch), (2) der Home-Logo-Klick in `NavRail` (`onHome`-Callback in App.jsx, voller Reset), (3) **neuer X-Button** im Panel-Header. Sidebar.jsx erhält `onCloseSidebar`-Prop und rendert eine kleine `CloseSidebarButton`-Komponente in allen drei Modi: Chat-Liste-Header, Pools-Liste-Header (rechts neben „+ Einladen" und „+ Neu"), und Pool-Nav-Top (neuer `.pool-nav-top`-Container mit Flex-Row aus „Alle Pools"-Back-Button + Close-Button, ersetzt den alten Solo-`pool-nav-back`-Block). Button hat `aria-label="Seitenleiste schließen"` + `title="Seitenleiste schließen"` und teilt die `.panel-header-close`-CSS-Klasse für alle drei Mounts.

**Section-Switch räumt Hauptinhalt:** Wenn die Nutzer:in zwischen `chat` und `pools` wechselt (also `handleSectionChange` ohne Toggle-Pfad und ohne Admin-Branch), räumt der jeweilige Zweig den Hauptinhalt der Gegenseite (`displayedPool`/`activePool`/`activePoolChatId` bei chat-Branch; `activeConversation` bei pools-Branch). Vorher passierte das nur teilweise, was im Overlay-Modell maskiert war: die Seitenleiste schloss ja sofort. Jetzt würde ein chat-zur-Pools-Wechsel mit liegen gebliebenem `activeConversation` zu „Seitenleiste zeigt Pool-Liste, Hauptinhalt zeigt alten Chat" führen — also gleich beim Section-Wechsel den Hauptinhalt mit-resetten.

**Was bewusst draußen blieb:**
- **Streaming-Race bei Section-Switch mitten in einem laufenden Chat-Response:** `api.sendMessageStream`-Callback in `onSendMessage` (`App.jsx:381-439`) hat keinen `AbortController`. Wenn die Nutzer:in während eines streamenden Responses auf NavRail „pools" klickt, wird `activeConversation = null` gesetzt, der Stream-Completion-Callback feuert aber später noch `setActiveConversation(updated)` und überschreibt damit den Section-Wechsel. Diese Race existierte bereits vor diesem PR (auch ohne Section-Wechsel konnte die Nutzer:in zu einem anderen Chat klicken), wird mit persistenter Seitenleiste aber wahrscheinlicher. Saubere Lösung erfordert `AbortController` + Capture der Conversation-ID in einem Ref — eigenes Scope, geparkt für späteren Streaming-Cleanup-PR.
- **CSS-Verfeinerungen:** Die `.messages`-Padding-Werte `24px 80px` (drei Stellen: chat-area, input-form, pool-detail) werden auf engen Viewports mit Panel offen knapper. Visuelle Post-Deploy-Prüfung; bei Bedarf separater Padding-Anpassungs-PR.
- **Glassmorph-Hinterfragen:** Der `backdrop-filter: blur(16px) saturate(2)` macht weniger Sinn, wenn das Panel nicht mehr über bewegten Hintergrund schwebt. Optisch trotzdem konsistent gelassen; falls die Optik trüb wirkt, in einem späteren Polish-PR auf solides Weiß flachen.
- **Dead-Code-Bereinigung:** Die alte `@media (max-width: 900px)`-Regel zielte auf eine `.sidebar`-Klasse, die im Code nicht existiert (vermutlich aus einem früheren Layout übrig). Wurde durch die neue `768px`-Mobile-Drawer-Regel ersetzt.

Dateien: `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/styles.css`

---

## Pool-Chat aus der gemischten Chat-Liste öffnet ohne Sidebar-Wechsel (2026-05-12)

**Anlass:** Die unifizierte „Chats"-Seitenleiste (`mergedChatItems`) listet persönliche Chats und Pool-Chats gemeinsam. Bisher hat ein Klick auf einen Pool-Chat in dieser Liste die Seitenleiste sofort in den Pool-Nav-Modus (Overview/Dokumente/Chats/Mitglieder-Tabs) umgeschaltet — der/die Nutzer:in verlor die Übersicht über andere Chats und musste manuell zurücknavigieren, um durch mehrere Chats zu blättern. Außerdem schließte sich nach dem persistenten-Seitenleisten-PR (2026-05-12) der Auto-Close-Mechanismus nicht mehr, was den Modi-Wechsel noch störender wahrnehmbar machte.

**Verhaltensänderung:** Ein Klick auf einen Pool-Chat in der gemischten Liste öffnet jetzt nur den Chat im Hauptbereich. Die Seitenleiste bleibt im Chat-Listen-Modus. Der/die Nutzer:in kann weiter durch die Liste scrollen, andere Chats anklicken, oder den X-Button drücken. Wenn er/sie tatsächlich die volle Pool-Kontextleiste (Overview/Dokumente/Mitglieder-Tabs) öffnen möchte, gibt es einen neuen expliziten Button **„Pool öffnen"** im `PoolHeader` direkt neben dem Pool-Namen.

**State-Modell-Erweiterung:** Die Kombination `{displayedPool=Pool, activePool=null, activeSection='chat'}` ist neu — bedeutet „Pool-Chat im Hauptbereich gerendert, Seitenleiste auf Chat-Liste". Sidebar's Pool-Nav-Render-Gate (`if (section === 'pools' && activePool)`) bleibt false, sodass die Seitenleiste im Chat-Modus rendert. Main-Rendering `displayedPool ? <PoolDetail> : <ChatArea>` zeigt korrekt das PoolDetail unabhängig von `activePool`.

**`App.jsx`-Änderungen:**
- `handleOpenChatItem`-Pool-Branch entfernt `setActiveSection('pools')` und `setActivePool(pool)`. Setzt nur noch `displayedPool`, `poolTab='chats'`, `activePoolChatId`, plus `setActiveConversation(null)` zur Säuberung.
- `onOpenConversation` und `onCreateConversation` räumen jetzt zusätzlich `displayedPool` und `activePoolChatId` auf — verhindert „Persönlicher Chat ausgewählt, aber PoolDetail rendert immer noch im Main"-Mismatch (`displayedPool ? <PoolDetail>` würde sonst hängen bleiben).
- `handleSectionChange`-Pools-Branch räumt jetzt zusätzlich `displayedPool` und `activePoolChatId` — Wechsel von „Pool-Chat in Chat-Listen-Modus" zum Pools-Section beginnt frisch.
- Neue Funktion `handleOpenPoolSidebar()`: setzt `activeSection='pools'`, `activePool=displayedPool`, `setSidebarOpen(true)`. Wird via Prop an `<PoolDetail>` durchgereicht, dort weiter an `<PoolHeader>`.
- `<PoolDetail>` bekommt jetzt `key={displayedPool.id}` — erzwingt Re-Mount bei Pool-Wechsel, sodass interner State (chats/documents/members/activeChat) sauber resettet wird, statt zwischen den alten Daten und dem `useEffect`-Reload-Race zu flackern.
- `<PoolDetail>` bekommt neuen `onPoolChatClosed`-Callback, der `activePoolChatId` zurücksetzt — siehe nächster Abschnitt zur Re-Click-Regression.

**Fix: Third-Click-Regression beim selben Pool-Chat.** Die bestehende `consumedChatIdRef`-Dedup-Logik in `PoolDetail.jsx:38-44` blockt einen zweiten `handleOpenChat`-Aufruf, wenn `initialChatId` denselben Wert wie der zuletzt konsumierte hat — sinnvoll für Re-Renders, aber problematisch in der neuen Flow: Klick auf Chat 1 → öffnen → „Zurück"-Klick → erneuter Klick auf Chat 1 in der Liste. `activePoolChatId` bleibt `'chat-1'` (kein State-Change), `useEffect` feuert nicht, Chat öffnet sich nicht wieder. Behoben durch:
- `App.jsx` reicht `onPoolChatClosed={() => setActivePoolChatId(null)}` an PoolDetail.
- PoolDetail ruft `onPoolChatClosed?.()` im `onBack`-Handler der Chat-Area (zusätzlich zum bestehenden `setActiveChat(null)`).
- PoolDetail bekommt einen neuen `useEffect` mit Dep `[initialChatId]`, der `consumedChatIdRef.current = null` setzt, wenn `initialChatId` null wird. Damit re-aktiviert ein erneuter Klick `null → 'chat-1'` als echten State-Change und der Chat öffnet wieder.

**Neuer „Pool öffnen"-Button:** In `PoolHeader.jsx` als Sibling von `.pool-header-text` innerhalb von `.pool-header-identity` gerendert — NICHT innerhalb von `.pool-header-text`, weil dieses Flex-Container `flex-direction: column` ist und den Button unter den Pool-Namen stapeln würde. Conditional-Rendering: `{activePoolId !== pool.id && (...)}` — sobald die Seitenleiste bereits den Pool-Nav-Modus für genau diesen Pool zeigt, ist der Button überflüssig und verschwindet. Label „Pool öffnen", Tooltip „Pool-Übersicht in der Seitenleiste öffnen". CSS-Klasse `.pool-header-open-btn` matcht das Visual-Vokabular der bestehenden `.pool-header-count`-Badges (kleines Outline-Button-Pattern, sanftes Hover).

**Was bewusst nicht geändert wurde:**
- Persönliche Chats in der gemischten Liste verhalten sich wie vorher (öffnen ChatArea im Main).
- Pool-Nav-Modus der Seitenleiste (wenn der/die Nutzer:in via NavRail „Pools" → Pool-Auswahl reingegangen ist) unverändert.
- Defensive Null-Checks in `handleDeletePool`/`handleLeavePool` nicht hinzugefügt — die Trigger-Buttons leben nur im Pool-Nav-Modus, wo `activePool` immer truthy ist.

Dateien: `frontend/src/App.jsx`, `frontend/src/components/PoolDetail.jsx`, `frontend/src/components/PoolHeader.jsx`, `frontend/src/styles.css`

---

## „Chats"-Tab erneut anklicken zeigt wieder die Pool-Chat-Liste (2026-05-12)

**Anlass:** In der Pool-Nav-Seitenleiste (Tabs Overview/Dokumente/Chats/Mitglieder) konnte man bislang nicht aus einem geöffneten Pool-Chat zurück zur Chat-Liste navigieren, indem man einfach den „Chats"-Tab nochmals klickte. Da der Tab bereits aktiv war (`poolTab === 'chats'`), war der Klick ein No-Op — kein State-Change, keine Re-Render-Kette. Der Workaround war: erst auf „Dokumente" oder eine andere Tab klicken, dann wieder auf „Chats", was den bestehenden `useEffect`-Reset bei Tab-Verlassen feuern ließ. Unintuitiv.

**Verhaltensänderung:** Klick auf den bereits aktiven „Chats"-Tab in der Pool-Nav-Seitenleiste schließt jetzt einen offenen Pool-Chat und kehrt zur Pool-Chat-Liste zurück (`PoolDetail.activeChat = null`). Wenn der Chat-List-View ohnehin schon aktiv ist, ist der Klick weiterhin sichtbar wirkungslos (keine Flicker, kein Reload).

**Architektur — Counter-Signal-Pattern:** Die Schwierigkeit war, dass `activeChat` ein internes State der `PoolDetail`-Komponente ist, während `poolTab` und die Tab-Buttons in App.jsx und Sidebar.jsx leben. Wenn App.jsx den Tab auf denselben Wert setzt (`setPoolTab('chats')` bei `poolTab === 'chats'`), erkennt React keine Änderung — es gibt also keinen Pfad, der die Information „bitte schließe den Chat" nach PoolDetail durchreicht. Lösung: eine neue Zähler-State-Variable `chatListResetSignal` (`useState(0)`) in App.jsx, die bei jeder Re-Click-Erkennung inkrementiert wird. PoolDetail bekommt sie als Prop und beobachtet sie via `useEffect` mit `[chatListResetSignal]`-Dep, wo es `setActiveChat(null)` aufruft. Jede Änderung des Signals — egal um wieviel — feuert den Effect. Idiomatic React-Pattern für „Parent-zu-Child-Imperativ-Signal".

**Neue `handlePoolTabChange`-Funktion in App.jsx:**
```js
function handlePoolTabChange(newTab) {
  if (newTab === 'chats' && poolTab === 'chats') {
    setChatListResetSignal(s => s + 1)
    setActivePoolChatId(null)
  }
  setPoolTab(newTab)
}
```
- Das Inkrement passiert NUR beim Re-Click des bereits aktiven Chats-Tabs. Andere Tab-Wechsel (Chats → Dokumente, Overview → Chats, etc.) feuern weiterhin den bestehenden `if (activeTab !== 'chats') setActiveChat(null)`-Effect in PoolDetail (Zeile 35-37) — der Signal-Mechanismus ist zusätzlich, nicht ersetzend.
- `setActivePoolChatId(null)` räumt zusätzlich die App-Level-ID, damit Request 1's `consumedChatIdRef`-Reset-Effect korrekt feuert. Der/die Nutzer:in kann denselben Chat danach wieder öffnen, ohne dass die Dedup-Logik blockt.

**Wichtig — selektive Verdrahtung:** Der neue Handler ist NUR an die Pool-Nav-Tab-Buttons in `Sidebar.jsx` verdrahtet (via `onPoolTabChange={handlePoolTabChange}`). Andere Tab-Wechsel-Pfade gehen weiterhin direkt über `setPoolTab`:
- `<PoolDetail onTabChange={setPoolTab}>` (Zeile 716) bleibt direkt verdrahtet, weil `PoolDetail.handleOpenChat` (Zeile 153) intern `onTabChange('chats')` aufruft, BEVOR es `setActiveChat(chat)` setzt. Würden wir das durch `handlePoolTabChange` routen, würde der Signal-Effect feuern und `setActiveChat(null)` aufrufen, was den frisch gesetzten Chat sofort wieder leeren würde.
- PoolHeader-Count-Badges (`onClick={() => onTabChange('chats')}` etc.) und PoolOverview-„Alle anzeigen"-Links nutzen ebenfalls den direkten Pfad. Folge: ein Re-Click auf das Chats-Badge in PoolHeader schließt den offenen Chat NICHT. Dies ist als bewusster UX-Trade-off akzeptiert — der Badge ist primär ein Stat-Counter mit Sekundär-Funktion, nicht der primäre Navigations-Trigger. Die UX-Anfrage zielte explizit auf „im Pool-Sidebar" (= Pool-Nav-Tabs).

**Bonus-Fix: Stale-Chat-ID-Leak zwischen Pools.** In `handleSelectPool` wurde zusätzlich `setActivePoolChatId(null)` ergänzt. Vor dieser Änderung konnte folgender Bug auftreten: Pool A → Chat 1 öffnen → Admin-Section → zurück zu Pools → Pool B auswählen. `activePoolChatId` blieb `'chat-1'` (von Pool A). PoolDetail mountete mit `initialChatId='chat-1'`. Solange der/die Nutzer:in im Overview-Tab blieb, kein Schaden, weil der `consumedChatIdRef`-Effect auf `activeTab === 'chats'` gattert. Sobald sie aber auf den Chats-Tab klickten, würde der Effect `handleOpenChat('chat-1')` gegen Pool B's API aufrufen — 404 oder leerer Chat. Mit der neuen `setActivePoolChatId(null)`-Zeile räumt jeder explizite Pool-Wechsel die Chat-ID auf.

**Anti-Scope:**
- Re-Click der Dokumente-Tab schließt nicht das Vorschau-Modal in `PoolDocuments.jsx` — anderes Pattern (Modal, nicht interner Sub-View), separates Scope.
- Re-Click der Members-Tab hat keinen Sub-View zum Resetten — nichts zu tun.
- Streaming-Race aus Request-1-Doku weiterhin offen (eigenes Scope).

## Chat-Liste: Pool- vs. Persönlich-Differenzierung verstärkt (2026-05-12)

**Anlass:** In der unifizierten Chats-Seitenleiste wurden persönliche und Pool-Chats bislang nahezu identisch dargestellt. Die Border-Farbe der inaktiven Items lag bei `rgba(33,52,82,0.18)` — ein Grau, das bei typischen Monitoren kaum vom Hintergrund zu unterscheiden war. Noch problematischer: der aktive Zustand verwendete für *alle* Chat-Typen dieselbe Orange-Füllung, sodass ein aktiver persönlicher Chat und ein aktiver Pool-Chat visuell nicht voneinander zu trennen waren. Die Orange-Akzentfarbe ist aber bereits die Marke des Pool-Systems. Nutzer:innen, die zwischen persönlichen Chats und Pool-Chats wechseln, hatten keinen schnellen visuellen Anker, in welchem Kontext sie sich befinden.

**Was sich visuell ändert:**

- *Border-Stärke* aller Chat-Listeneinträge: 1 px → 2 px. Die schwerere Linie macht den Kontur der Items auf kleinen Displays und bei niedrigem Kontrast besser lesbar.
- *Inaktive persönliche Chats*: Border-Farbe wechselt von `rgba(33,52,82,0.18)` auf `rgba(33,52,82,0.62)` — Navy mit deutlich höherem Alpha, wirkt als klare Abgrenzung statt als Schatten.
- *Aktiver persönlicher Chat*: statt Orange-Füllung jetzt Navy-Füllung (`rgba(33,52,82,0.10)`) mit durchgehender Navy-Border (`#213452`). Navy steht für „privat/persönlich" — das ist das kognitive Modell, das die Marke schon für die NavRail-Highlights nutzt.
- *Aktiver Pool-Chat*: bleibt orange, aber leicht angehoben auf `rgba(238,127,0,0.10)` Füllung plus `var(--color-primary)` Border. Orange bleibt die Pool-Sprache.

**Was sich strukturell ändert:**

Jedes Chat-Listenelement bekommt ein neues `.panel-item-icon`-Element auf der rechten Seite der Zeile. Das Icon codiert den Chat-Typ auf einen Blick:
- Persönlicher Chat → `<ChatBubbleIcon>` (kein Pool-Kontext)
- Pool-Chat, geteilt (`is_shared: true`) → `<GlobeIcon>` (öffentlicher Pool)
- Pool-Chat, privat (`is_shared: false`) → `<LockIcon>` (privater Pool)

Das Icon hat `margin-right: 32px`. Die 32 px sind bewusst gewählt: der Löschen-Button (`delete`-Button im Hover-Zustand) ist absolut positioniert auf der rechten Seite jedes `.panel-item`. Bei 20 px würde das Icon unter dem Button verschwinden, sobald der Hover-Zustand das Delete-Control einblendet. 32 px räumen die maximale Ausdehnung des Buttons zuverlässig frei.

Das `is_shared`-Flag fließt vom Backend über `/api/pools/me/chats` (verifiziert in `pool_chats.py:40–46`) ins Frontend; `Sidebar.jsx` liest es aus dem Chat-Objekt.

**CSS-Scoping-Rationale:**

Alle neuen Stile werden über den Parent-Modifier `.panel-list--chats` eingegrenzt, nicht über eine neue Item-Level-Klasse. Konkret: die Chat-Section erhält das `panel-list--chats`-Modifier auf dem umschließenden `div.panel-list`, und alle Regeln lauten `.panel-list--chats .panel-item`, `.panel-list--chats .panel-item.active` usw. Die Pool-Listenansicht (`activeSection === 'pools'`, d. h. das Direktverzeichnis aller Pools, kein Pool-Nav-Modus) nutzt das schlichte `.panel-list` ohne Modifier — Pool-Einträge dort bleiben vollständig unberührt. Der Modifier-Ansatz hält den Base-Kontrakt von `.panel-item` sauber und erlaubt kontextabhängige Überschreibungen ohne Klassen-Multiplikation auf Item-Ebene (Alternativentwurf wäre `.panel-item--chat` gewesen, was aber jede bestehende Render-Stelle hätte anfassen müssen).

**Anti-Scope:**
- Pool-Listenansicht (`.panel-list` ohne `--chats`-Modifier) bleibt unverändert.
- Pool-Nav-Modus der Seitenleiste (Pool-Tabs Overview/Dokumente/Chats/Mitglieder) ist nicht betroffen.
- Icon.jsx: `GlobeIcon`, `LockIcon`, `ChatBubbleIcon` werden als neue Exports ergänzt (Scope der Sibling-Agents); dieses Dokument beschreibt nur die Integration in `Sidebar.jsx`.

## Chat-Sortierung nach letzter Aktivität (2026-05-12)

**Anlass:** Bislang wurden Chat-Listen nach Erstellungsdatum sortiert. Das führte zu einem praktischen Problem: Ein Chat, der seit gestern aktiv genutzt wird, verschwand unter neueren, aber leeren Chats. Besonders in der Pool-Ansicht mit vielen angelegten Chats war es schwer, den zuletzt genutzten Chat schnell wiederzufinden. Die Nutzer:innen erwarten intuitiv eine Sortierung nach Aktivität, nicht nach Anlagezeit.

**Architekturentscheidung — Compute-on-Read statt denormalisierter Spalte:**

Zwei Ansätze standen zur Auswahl: (1) eine `last_message_at`-Spalte in `pool_chats` und `chats` einführen, die per Trigger bei jedem Message-Insert aktuell gehalten wird, oder (2) das Datum bei jeder Chat-Listen-Abfrage zur Laufzeit berechnen. Gewählt wurde Option 2. Begründung: Ein Trigger auf `pool_chat_messages` hätte eine Supabase-seitige Funktion (in der Supabase-Instanz, nicht im Appcode) erfordert und wäre schwerer zu versionieren, zu testen und zu rollbacken. Compute-on-Read hält die gesamte Logik im Appcode, die Datenbankstruktur bleibt schlank, und für die typischen Chat-Mengen dieser Plattform ist der Mehraufwand pro Abfrage vernachlässigbar.

**Kombinierte Count+Last-Row-Query — Supabase-Pattern:**

Bisher wurde die Nachrichtenanzahl pro Chat mit `.select("id", count="exact")` abgefragt, was sämtliche Message-IDs über das Netzwerk transferierte, nur um am Ende `len(result.data)` aufzurufen. Dieser Ansatz wurde durch `.select("created_at", count="exact").order("created_at", desc=True).limit(1).execute()` ersetzt. Der Supabase-Python-Client gibt `.count` unabhängig von `.limit` zurück — `.count` enthält die Gesamtanzahl der Zeilen für das Filter-Prädikat, `.data` enthält nur die eine limitierte Zeile. Eine Query, kleinere Payload, zwei Informationen. Das alte `len(msg_count.data)`-Pattern war außerdem still fehlerhaft: nach Einführung von `.limit(1)` hätte es statt der echten Zahl immer 0 oder 1 geliefert, ohne Fehler zu werfen. Die korrekte Nutzung ist jetzt `msg_q.count` (Integer, direkt).

**Sortier-Fallback-Semantik — `last_message_at || created_at`:**

Der Sort-Key in allen drei betroffenen Listen ist `last_message_at || created_at`. Für Chats mit mindestens einer Nachricht ist `last_message_at` der Timestamp der letzten Nachricht. Für frisch angelegte Chats ohne Nachrichten ist `last_message_at` null — der Ausdruck fällt auf `created_at` zurück, das für einen neuen Chat gleich „jetzt" ist. Damit erscheint ein neuer Chat oben in der Liste und wandert erst nach unten, wenn ältere Chats neue Nachrichten erhalten. Ein früh diskutiertes Bedenken — „springt ein neuer Chat nach dem ersten Send ans Ende?" — ist unbegründet: nach dem ersten Message-Send hat `last_message_at` einen Wert, der in der Regel noch aktueller als jedes bestehende `created_at` ist, sodass der Chat oben bleibt.

**Neue SQL-Migration:**

`supabase/migrations/20260512_pool_chat_messages_created_idx.sql` legt einen zusammengesetzten Index `pool_chat_messages(chat_id, created_at DESC)` an. Dieser Index macht die `.order("created_at", desc=True).limit(1)`-Unterabfrage effizient und ist für den korrekten Betrieb des Features notwendig, aber kein Hard-Blocker: ohne den Index läuft die Abfrage per Seq-Scan, das Ergebnis bleibt korrekt. Der analoge Index auf `chat_messages(chat_id, created_at DESC)` existiert bereits seit der Migration vom 2026-02-15. Die neue Migration muss vor dem Code-Deploy manuell gegen die Supabase-Instanz ausgeführt werden.

**Berührte Backend-Dateien:**

- `backend/app/storage.py` — `list_conversations`: ersetzt Nachrichten-Zähler-Query, befüllt `last_message_at` pro Conversation.
- `backend/app/pools.py` — `list_pool_chats` (Zeile ~382): gleiche Query-Umstellung; `list_all_pool_chats_for_user` (~450): `len(msg_count.data)` korrekt durch `msg_q.count` ersetzt.
- `backend/app/pool_chats.py` — `list_all_pool_chats_for_user`: analog.
- `backend/app/models.py` — `ConversationMetadata`: neues Feld `last_message_at: Optional[str] = None` (defensiv, bricht keine bestehenden Clients).

**Frontend-Änderungen:**

- `App.jsx` — `mergedChatItems` verwendet `last_message_at || created_at` als Sort-Key statt reinem `created_at`.
- `PoolOverview.jsx` — `sortByDate` nutzt denselben kombinierten Sort-Key; in den „Letzte Chats"-Karten (Zeile 184) wird `formatDate(chat.last_message_at || chat.created_at)` angezeigt statt `formatDate(chat.created_at)`. Die Datumsanzeige in den Pool-Dokumenten-Karten bleibt bei `created_at` — Dokumente haben kein Last-Message-Konzept.
- `PoolChatList.jsx` — defensiver Frontend-Sort vor dem Shared/Private-Split, als redundante Absicherung falls die API-Sortierung ungeordnet ankommt.

**Anti-Scope:**

- Kein `asyncio.gather` eingeführt — die N+1-Query-Struktur (eine Unterabfrage pro Chat) ist bewusst beibehalten. Für die aktuellen Datenmengen ist lineare Verarbeitung akzeptabel.
- Kein Pydantic-Enforcement auf `last_message_at` — das Feld ist `Optional[str]`, um bestehende Clients nicht zu brechen und den Deploy ohne erzwungenes Frontend-Update zu ermöglichen.
- Dokument-Datumsanzeige in PoolOverview unverändert (`created_at`).
- Kein Message-Insert-Trigger — die gesamte Logik liegt im Appcode.

---

## Bildgenerierung — Text-to-Image mit OpenAI + xAI (2026-05-13)

### Motivation

Nutzer benötigen die Möglichkeit, Bilder direkt aus dem AI-Workspace heraus zu erzeugen — sowohl in einem dedizierten Studio-Tab als auch situativ per Slash-Command mitten im Chat. Die Plattform nutzt bereits API-Keys für OpenAI und xAI; beide Provider bieten stabile Bildgenerierungs-Endpunkte. Damit ist kein neuer Credentials-Overhead erforderlich.

### Architektur

Der einzige Backend-Endpunkt für Bildgenerierung ist `POST /api/images/generate`. In v1 wird er ausschließlich vom **Bilder-Tab** in der NavRail aufgerufen. Der `/bild`-/`/image`-Slash-Command ist auf v2 verschoben (Grund: die Chat-Nachricht–Bild-Verlinkung ist im v1-Storage-Layer nicht verdrahtet; `generated_image_id` auf `chat_messages` existiert in der DB, wird aber vom Frontend nicht befüllt). Der Endpunkt liefert denselben Response-Typ unabhängig vom späteren Einstiegspunkt.

**Provider-Abstraktion:** Das neue Modul `backend/app/image_gen.py` übernimmt die gleiche Rolle wie `llm.py` für Chat: Es mappt einen konfigurierten `app_model_config`-Eintrag auf den richtigen Provider-Client und kapselt das jeweilige Request-/Response-Format. Das neue Modul `backend/app/image_storage.py` abstrahiert den physischen Speicherort: `resolve_image_url(record)` gibt je nach `storage_kind`-Feld im DB-Record die richtige URL zurück. In v1 ist `storage_kind = 'provider_url'` und die URL stammt direkt vom Provider. In v2 wird `storage_kind = 'supabase'` ergänzt — die Funktion ist der einzige Ort, der geändert werden muss.

### Datenmodell

Drei neue Tabellen:

| Tabelle | Zweck |
|---|---|
| `app_generated_images` | Ein Record pro Generierungsversuch; enthält `status`, `prompt`, `cost_usd`, `image_url`, `storage_kind`, `generated_image_id` (FK auf `chat_messages` oder `pool_chat_messages`) |
| `app_image_style_presets` | Stil-Präfixe; `scope_type` enum: `'global'` / `'team'` / `'user'` / `'pool'`; v1 nur `'global'` befüllt |
| `app_user_limits` | Pro-User-Override-Tabelle; `daily_image_cost_usd` überschreibt den System-Default aus `app_settings` |

Zwei Spalten-Ergänzungen an `app_model_config`:

- `model_type varchar` — Werte: `'chat'`, `'image'`, `'embedding'`; extensibel ohne Schema-Änderung
- `pricing jsonb` — kostenrelevante Metadaten; keine hartkodierten Preise, Admin registriert sie beim Anlegen des Modells

Zwei Spalten-Ergänzungen an `chat_messages` und `pool_chat_messages`:

- `generated_image_id uuid` (FK auf `app_generated_images.id`) — verknüpft eine Chat-Nachricht mit dem erzeugten Bild

### Status-Spalte und finanzielle Integrität

`app_generated_images.status` nimmt drei Werte an: `'pending'` → `'succeeded'` / `'failed'`. Der Stub-Record mit `status='pending'` wird **vor** dem Provider-Call in die DB geschrieben. Erst wenn der Provider erfolgreich antwortet, wird der Record auf `'succeeded'` gesetzt und `cost_usd` eingetragen. Nur `succeeded`-Records zählen zum Tageslimit. Schlägt der Provider-Call fehl, bleibt der Record auf `'failed'` — keine Kosten werden angerechnet. Dieses Muster verhindert, dass ein unerwarteter Programmabbruch zwischen Kostenanfall beim Provider und dem DB-Write zu ungetrackt verbrauchten Kosten führt.

### Kostenverfolgung und Tageslimit

Das tägliche Kostenlimit pro Nutzer wird aus `app_user_limits.daily_image_cost_usd` gelesen; fehlt ein Eintrag, greift der System-Default aus `app_settings` (konfigurierbar, Auslieferungsstandard: $5/Tag). Das Limit ist eine weiche Grenze — der Backend-Endpunkt prüft vor jedem Generate-Call die Summe der `succeeded`-Records des laufenden UTC-Tages und lehnt ab, wenn die Grenze erreicht ist.

Der Admin-Endpunkt `PUT /api/admin/users/{id}/limits` ist mit Selbstschutz versehen: Ein Admin kann die eigenen Limits nicht verändern. Der Versuch wird mit HTTP 403 abgelehnt.

### Pool-Integration

Bilder, die über den Bilder-Tab generiert werden, sind immer dem erzeugenden Nutzer zugeordnet. Der geplante Pool-Chat-Kontext (Sichtbarkeit nach `is_shared`) ist für v2 vorgesehen, wenn der Slash-Command-Pfad verdrahtet wird.

### Slash-Command-Verhalten (v2 — nicht in v1)

> **v2-Scope.** Der `/bild`-Slash-Command ist aus v1 herausgenommen. Das Frontend-Parsing (`MessageInput.jsx`, `PoolChatArea.jsx`), die App.jsx-Handler (`handleGenerateImageInChat`, `handleGenerateImageInPoolChat`) und der `poolChatRefreshKey`-Mechanismus sind entfernt. Wiederherstellung in v2 erfordert: (a) beim Generieren mit `chat_id`/`pool_chat_id` auch eine `chat_messages`-Zeile mit gesetztem `generated_image_id` einfügen; (b) Entscheidung über Message-Struktur (einzelne Assistenten-Nachricht vs. User+Assistant-Paar); (c) Frontend-Slash-Parser in `MessageInput.jsx` und `PoolChatArea.jsx` wiederherstellen; (d) App.jsx-Handler und ChatArea/PoolDetail-Prop-Threading wiederherstellen; (e) i18n-Key `chat.slash.image.help` wiederherstellen.
>
> Die ursprüngliche Beschreibung (case-insensitive Regex, Mindest-Inhalt-Pattern, Tooltip bei leerem Befehl) war korrekt entworfen und gilt unverändert für v2.

### Stil-Präfix

Globale Stil-Presets (`scope_type='global'`) werden als unsichtbarer Prompt-Präfix vor den Nutzer-Prompt gesetzt. Der Nutzer sieht den Präfix nicht; er erscheint nur im Admin-Dashboard (Bild-Stil-Tab). Die Scope-Hierarchie im Datenmodell (`global` / `team` / `user` / `pool`) ermöglicht spätere Verfeinerung ohne Schema-Migration.

### Korrektheit-Fix in `admin.py:204-205`

Vor diesem Feature konnte das Setzen eines neuen Chat-Default-Modells versehentlich das Image-Default-Modell zurücksetzen, weil der `is_default`-Reset ohne `model_type`-Filter lief. Die Zeilen `admin.py:204-205` wurden korrigiert: Das `UPDATE ... SET is_default = false`-Statement filtert jetzt auf `model_type = <type des neuen Default>`, sodass Chat-Default-Änderungen das Bild-Default unberührt lassen und umgekehrt.

### Storage-Strategie

v1 unterstützt zwei `storage_kind`-Werte:
- `'provider_url'` — OpenAI- und xAI-Antworten mit `url`-Feld (dall-e-2, dall-e-3, Grok-Image). Die Provider-URL wird unverändert in `app_generated_images.image_url` gespeichert; ca. 60 Minuten gültig.
- `'data_uri'` — Antworten mit `b64_json`-Feld (gpt-image-1). Base64 wird als `data:image/png;base64,...`-URI in `image_url` inline gespeichert; kein Ablauf.

`image_storage.resolve_image_url()` gibt in beiden Fällen die gespeicherte URL unverändert zurück. `mark_image_succeeded()` setzt `provider_url_expires_at` nur für `'provider_url'`, da `data_uri` nicht abläuft.

v2 (geplant): Supabase Storage als permanenter Speicher; `storage_kind = 'supabase'`. Das API-Kontrakt und das Frontend-Rendering ändern sich dabei nicht — nur `resolve_image_url()` wird erweitert.

### Anti-Scope (nicht Teil dieses Deploys)

- Keine Bild-zu-Bild-Bearbeitung, kein Inpainting
- Google Imagen — verschoben auf v2 (abhängt von Supabase Storage)
- Kein Pro-Pool-Galerie-Tab
- Kein Scheduling / Batch-Generierung
- Kein Wasserzeichen
- Keine Multi-Währungs-Kostenansicht
- Kein `/bild`-Command in öffentlichen Einladungslinks

### Berührte Dateien

**Backend:**
- `backend/app/image_gen.py` — neu; Provider-Abstraktion für Bildgenerierung
- `backend/app/image_storage.py` — neu; URL-Auflösung nach `storage_kind`
- `backend/app/main.py` — Endpunkt `POST /api/images/generate` inline (kein separater Router; gemäß CLAUDE.md-Konvention bis zum geplanten `main.py`-Split)
- `backend/app/admin.py` — Zeilen 204-205 korrigiert; neue Endpunkte für Bildmodelle, Bild-Stil, Nutzerlimits
- `supabase/migrations/20260513_a_image_generation.sql` — neu; 3 Tabellen + 2×2 Spalten, vollständig idempotent

**Frontend:**
- `frontend/src/components/Bilder.jsx` — neu; Bilder-Studio-Tab (in `App.jsx:11` als `import Bilder from './components/Bilder'`)
- `frontend/src/components/AdminDashboard.jsx` — Bildmodelle-Tab, Bild-Stil-Tab, Bild-Kosten-Sektion, Chatmodelle-Umbenennung
- `frontend/src/App.jsx` — Bilder-NavRail-Eintrag (Slash-Command-Handler in v2 verschoben)
- `frontend/src/components/MessageBubble.jsx` — dormante `<img>`-Rendering-Branch für generierte Bilder (v1: nie aktiv, da kein Chat-Slash-Command; v2 re-aktiviert sie)
- `frontend/src/styles.css` — Bilder-Tab- und Galerie-Styles in monolithische CSS-Datei integriert (`.bilder-*`-Selektoren); kein separates `styles/`-Verzeichnis

**Docs:** 8 Dateien (IMPLEMENTIERT, UMSETZUNGS-DOKUMENT, ADMIN-DOKUMENT, ANWENDER-DOKUMENT, FEATURE-DOKUMENT, SECURITY, CODING-DOKUMENT, PROD-UPGRADE-PLAYBOOK, TODO)

### Manueller Deploy-Schritt

1. Migration `20260513_a_image_generation.sql` gegen die Supabase-Instanz ausführen.
2. Backend deployen.
3. Frontend deployen.
4. Im Admin-Dashboard: mindestens ein Bildmodell in **Bildmodelle** registrieren und als Default setzen.
5. Optional: globalen Stil-Präfix im Tab **Bild-Stil** eintragen.

Details siehe `docs/PROD-UPGRADE-PLAYBOOK.md` — Abschnitt „Bildgenerierung".

Dateien: `frontend/src/App.jsx`, `frontend/src/components/PoolDetail.jsx`

---

## Bugfix #1 + #24 — `supabase`-Import + DELETE-WHERE-Härtung (2026-05-18)

**Anlass:** Audit-Runde 2026-05-13 (`BUG-AUDIT-2026-05-13.md` Funde #1 und #24). Phase-A-Re-Verifikation 2026-05-18 mit vier parallelen Opus-Agenten (informiert/impartial/blast-radius) bestätigte den Bug live und deckte zusätzlich auf, dass die ursprüngliche Audit-Beschreibung den Scope unterschätzt hatte: nicht nur `DELETE /api/images/{id}` war betroffen, sondern auch `POST /api/images/generate` auf dem chat-/pool-chat-verankerten Pfad.

### Befund

`backend/app/main.py` referenzierte den nackten Namen `supabase` in vier Routen-Handler-Zeilen (audit-Zeitstand 2303, 2316, 2369, 2381) ohne entsprechenden Modul-Import. Zwei funktionslokale Imports an L1961 (`as db`) und L2493 (`as _sb`) existierten, banden aber jeweils Aliase und nicht den Bare-Namen. Konsequenz: `NameError` zur Laufzeit, HTTP 500.

- **`POST /api/images/generate`** (Handler `generate_image`): 500 wenn `chat_id` oder `pool_chat_id` im Request-Body — der Standard-Pfad bei Bildgenerierung aus einem Chat-Kontext heraus.
- **`DELETE /api/images/{image_id}`** (Handler `delete_generated_image`): 500 bei jedem Löschklick im Bilder-Galerie-Tab — 100% Fehlerquote.

Zusätzlich war die DELETE-Statement ohne `eq("user_id")` in der WHERE-Klausel formuliert (Fund #24). Der App-Layer-Owner-Check vor der DELETE (SELECT-then-compare) hatte ein TOCTOU-Fenster, das durch eine atomare WHERE-Klausel zu schließen war.

### Fix

1. Modul-Scope-Import `from .database import supabase` an `main.py:77` ergänzt — kanonisches Muster, das 13 andere Backend-Module bereits verwenden (`audit.py:4`, `pools.py:9`, `storage.py:3`, `image_gen.py:12` u.a.). `main.py` war der einzige Verstoß.
2. DELETE-Statement an `main.py:2382` (post-fix; audit-Zeitstand L2381) um `.eq("user_id", current_user["id"])` erweitert. SQL-Filter erzwingt jetzt Owner-Match direkt; das App-Layer-Check bleibt zusätzlich erhalten (Defense-in-Depth, kein Verhaltensunterschied im Happy-Path).

Die funktionslokalen Imports an L1962 und L2494 (post-fix Zeilen) bleiben unverändert; sie aliasen auf `db` / `_sb` und überschatten den neuen Modul-Scope-Namen nicht. Cleanup dieser redundanten Lokal-Imports ist explizit out-of-scope dieses Commits.

### Auswirkung

| Route | Vor Fix | Nach Fix |
|---|---|---|
| `POST /api/images/generate` (chat-anchored) | HTTP 500 (NameError) | funktioniert |
| `POST /api/images/generate` (Galerie-direkt) | funktionierte bereits | unverändert |
| `DELETE /api/images/{image_id}` | HTTP 500 (NameError) | funktioniert + atomar owner-gefiltert |

Frontend-Aufrufer: `frontend/src/api.js:778` (Bilder-Generate), `frontend/src/api.js:810` (Bilder-Delete via `frontend/src/components/Bilder.jsx:137`).

### Keine Schema-/Migrations-Änderung

Der Bug war rein pythonisch (Modul-Import-Versäumnis). Die Supabase-Instanz, das `app_generated_images`-Schema, RLS-Regeln und RPCs blieben unberührt. PROD-Catchup-Track ist unabhängig.

### PROD-Reachability-Hinweis (für die Prod-Catchup-Planung)

Sobald dieser Fix auch auf PROD ankommt, wird `POST /api/images/generate` dort wieder den `image_gen_mod.generate_image_for_user`-Pfad erreichen. Der Audit-Fund **#3** (`image_gen.py:67–87` — `app_user_limits` + Setting-Lookup ohne try/except) ist auf PROD weiter offen, weil A2 dort noch nicht angewendet ist (siehe Memory `project_xqt5_dev_prod_state.md`). Auf DEV ist A2 angewendet und damit unkritisch; auf PROD würde der wiederhergestellte Endpoint sofort in #3 laufen und 500 werfen. **Konsequenz:** PROD-Catchup muss A2 anwenden **bevor** dieser Fix auf PROD geht — oder #3 zuerst fixen. DEV-Deploy heute ist unbedenklich.

### Berührte Dateien

**Code:**
- `backend/app/main.py` — eine Import-Zeile (L77) + eine `.eq()`-Filterklausel (L2382)

**Docs:**
- `docs/IMPLEMENTIERT.md` — dieser Eintrag
- `docs/BUG-AUDIT-2026-05-13.md` — Funde #1 und #24 auf `FIXED 2026-05-18` umgesetzt; Beschreibung #1 um POST-Pfad ergänzt
- `docs/BUG-FIX-PLAYBOOK.md` §5 „Already-Fixed" — Eintrag für #1 + #24 ergänzt

### Phase-A-Verifikationsteam

Vier parallele Opus-Agenten 2026-05-18, unabhängige Reports:

- **Verifier A** (informiert, Import-Resolution-Fokus): VERDICT still-real, high confidence
- **Verifier B** (informiert, Code-Path-Fokus): VERDICT still-real, high confidence — fand zusätzlich den POST-Pfad, den die Original-Audit-Beschreibung übersehen hatte
- **Verifier C** (impartial, Cold-Eyes ohne Audit-Framing): VERDICT still-real, high confidence — unabhängige Bestätigung
- **Verifier D** (Blast-Radius / Dependency-Mapping): identifizierte #24 als direkt verknüpft, empfahl Bundling; identifizierte #3 als PROD-Reachability-Risiko

Anschließend ein fünfter Opus-Reviewer auf den fertigen Fix-Plan: VERDICT green-with-caveats (Caveats: Line-Number-Drift dokumentieren, PROD-#3-Reachability flaggen — beide adressiert).

---

## Bugfix #278 + #279 — Image-Gen-Timeout + diagnostizierbarer Error-Path (2026-05-18)

**Anlass:** Im DEV-Test der wiederhergestellten `POST /api/images/generate`-Route (nach Fix #1+#24) trat eine 100%ige Failure-Rate auf `gpt-image-1`-Anfragen auf. Audit-Log-Forensik zeigte: `image.generate.failed` exakt 30.08 s nach `image.generate` (Start) — die Signatur eines `httpx.AsyncClient(timeout=30.0)`-Read-Timeouts. `error_message` und `audit metadata.error_truncated` waren leer; der Catch-all-Branch verlor den Exception-Typ vollständig.

### Befund

**#278 — Timeout zu eng:** `image_gen.py:157` (OpenAI) und `:210` (xAI) verwenden beide `httpx.AsyncClient(timeout=30.0)`. Ein einzelner Float für `timeout` ist eine unified `httpx.Timeout(30.0)`, die auf connect/read/write/pool zusammen wirkt. `gpt-image-1` rendert serverseitig regelmäßig 40-90+ s; der 30-s-Read-Timeout greift mitten in der Generierung. Andere `httpx`-Timeouts im Codebase liegen bei 60-120 s — die 30 s im Image-Gen-Pfad sind ein Ausreißer.

**#279 — Catch-all verliert Diagnostik:** `image_gen.py:409-419` `except Exception as exc:` schreibt `str(exc)[:500]` in `app_generated_images.error_message` und audit `metadata.error_truncated`. Für `httpx.ReadTimeout` (und Geschwister-Klassen) ist `str(exc)` leer — Begründung: httpcore mappt Pythons builtin `TimeoutError()` (keine Message) auf `httpcore.ReadTimeout`; httpx remappt dann mit `message = str(exc)` (also `""`) und re-raised `httpx.ReadTimeout("")`. Class-Chain: `httpx.ReadTimeout → TimeoutException → TransportError → RequestError → HTTPError → Exception` (wird also vom `except Exception` aber NICHT vom `except HTTPException` gefangen). Zusätzlich kein `logger.error` im Branch — kein Stack-Trace in den Coolify-Logs.

### Fix

**#278 — Timeout-Bump auf 60.0 s** an beiden Call-Sites:

- `image_gen.py:157`: `httpx.AsyncClient(timeout=60.0)` (OpenAI)
- `image_gen.py:210`: `httpx.AsyncClient(timeout=60.0)` (xAI)

60 s gewählt weil: (a) Coolify-Traefik-Default für Upstream-Timeout ist 60 s — höher zu gehen würde die 502-Failure-Mode nur an die Proxy-Schicht verschieben; (b) deckt p90 der `gpt-image-1`-Latenz ab; (c) konsistent mit anderen Backend-Timeouts (llm.py:221, rag.py:604, providers).

**#279 — Catch-all diagnostizierbar gemacht:** im `except Exception`-Block:

```python
exc_class = type(exc).__name__
exc_detail = str(exc) or repr(exc)
error_msg = f"{exc_class}: {exc_detail}"[:500]
logger.error(
    "Image generation failed image_id=%s provider=%s model=%s",
    image_id, provider, model,
    exc_info=True,
)
```

Eigenschaften des neuen Pfads:
- **Exception-Klasse immer im error_msg** — auch wenn `str(exc)` leer ist (Timeout-Fall), steht „ReadTimeout:" oder ähnlich in der Audit-Spalte.
- **`str(exc) or repr(exc)`** als Fallback — `repr` greift nur wenn `str()` leer.
- **`logger.error(..., exc_info=True)`** — voller Stack-Trace landet in Coolify-Logs (nicht in der Audit-DB, damit `SECURITY.md:209` „Prompts nie in Logs" gewahrt bleibt; der Logger schreibt nur image_id/provider/model + Traceback ohne Lokals).
- **Truncation auf 500 Zeichen** beibehalten — DB-Schema-konform.
- **502-Status beibehalten** — Frontend-Bilder-Komponente erwartet das.

Die HTTPException-Branch (für non-200-OpenAI/xAI-Responses) bleibt unberührt, weil sie bereits eigene `logger.error`-Calls hat (`image_gen.py:165, 218`) und das `_provider_body`-Attribute für Moderation-Detection setzt.

### Auswirkung

| Vor Fix | Nach Fix |
|---|---|
| 30 s Read-Timeout für gpt-image-1 → 100% Failure | 60 s Read-Timeout → erwartete Success-Rate p90+ |
| Audit-Failure-Row mit `error_truncated=""` | Audit-Failure-Row mit `error_truncated="ReadTimeout: …"` |
| Kein Stack-Trace in Coolify-Logs | Voller Stack-Trace + strukturierte Log-Zeile pro Failure |

### Bewusste Out-of-Scope

- **Audit #179** (`asyncio.CancelledError` als `BaseException` nicht von `except Exception` gefangen) — separate Finding, nicht gebündelt, weil dieser Fix das Cancel-Verhalten nicht ändert (es war vorher schon nicht im Scope und ist es weiterhin nicht).
- **Per-Modell-konfigurierbare Timeouts** (`app_model_config.parameters.timeout_s`) — Future-Feature.
- **Retry/Backoff** im Image-Gen-Pfad — koordiniert mit Audit #247 (kein Retry in `llm.py`), nicht ad-hoc hier einführen.
- **Code-Deduplikation** zwischen `_call_openai` und `_call_xai` (~50 LOC nahezu identisch) — Verifier C-Smell, separater Refactor.

### PROD-Reachability-Hinweis

Coolify-Traefik hat eine Default-Upstream-Timeout von 60 s pro Service. Sollte gpt-image-1 in PROD weiterhin häufig 502en (weil > 60 s benötigt), muss zusätzlich die Traefik-Konfiguration angepasst werden — siehe `PROD-UPGRADE-PLAYBOOK.md` Abschnitt „Bildgenerierung". Auf DEV ist das aktuell nicht beobachtet.

### Berührte Dateien

**Code:**
- `backend/app/image_gen.py` — 2 Timeout-Zeilen + 5-Zeilen-Rewrite des Catch-all-Blocks

**Docs:**
- `docs/IMPLEMENTIERT.md` — dieser Eintrag
- `docs/BUG-AUDIT-2026-05-13.md` — neuer Abschnitt „Spätere Findings" mit #278 und #279
- `docs/BUG-FIX-PLAYBOOK.md` — #278 in Gruppe G3 (Provider-Layer-Hygiene), #279 in Gruppe G5 (Stream-Lifecycle)
- `docs/PROD-UPGRADE-PLAYBOOK.md` — Traefik-Upstream-Timeout-Hinweis im Bildgenerierung-Abschnitt

### Phase-A-Verifikationsteam

Vier parallele Opus-Agenten 2026-05-18, unabhängige Reports:

- **Verifier A** (informiert, Timeout-Mechanism): bestätigte httpx 0.28.1 pinning + traced die Empty-Message-Kette httpcore→httpx → VERDICT still-real
- **Verifier B** (informiert, Error-Path): bestätigte Error-Path-Asymmetrie zwischen HTTP-Status- und Python-Exception-Branches; identifizierte CancelledError-Edge-Case als Out-of-Scope → VERDICT still-real
- **Verifier C** (impartial, Cold-Eyes): VERDICT „inappropriate timeout, high concern on logging absence" — unabhängige Bestätigung
- **Verifier D** (Blast-Radius): identifizierte Coolify-Traefik-60s-Default als praktische Decke; identifizierte #179 als ordering-relevant aber nicht bundling-pflichtig → empfahl 60 s als sicherer Default

Konsens: 4-of-4 still-real, beide Findings.

---

## Bugfix #179 + #3 + #230 — Image-Gen Härtung: Cancel-Handler + Limits-Defense + xAI-Naming (2026-05-18)

**Anlass:** Drei verbleibende Image-Gen-Funde aus dem 2026-05-13-Audit nach DEV-Verifikation der vorherigen Fixes als Bundle: #179 (CancelledError leakt Pending-Rows), #3 (`check_daily_cost_cap`-Queries ohne try/except → 500 auf PROD pre-A2), #230 (xAI-Provider-Naming-Mismatch macht xAI-Image-Gen tot). Alle drei in derselben Datei (`backend/app/image_gen.py`), textuell disjunkt, DEV-safe.

### Befund

**#179** — `image_gen.py:392-419` hatte einen `try/except HTTPException + except Exception`-Block. Python 3.11 `asyncio.CancelledError` erbt von `BaseException`, NICHT von `Exception` → wird von keinem Branch gefangen. Konsequenz: Wenn der User die „Abbrechen"-Schaltfläche in `Bilder.jsx` drückt (`Bilder.jsx:100-126` hat einen funktionierenden AbortController + Cleanup-on-Unmount), wird die Verbindung abgebrochen → Starlette propagiert `CancelledError` → die Pending-Row aus `create_pending_image` an `image_gen.py:361` bleibt für immer auf `status='pending'`. Kein `mark_image_failed`, kein `IMAGE_GENERATE_FAILED`-Audit. Verifier-B bestätigte: User sieht nichts (Galerie filtert auf `status='succeeded'`), Admin sieht Orphan-Row und ein `image.generate`-Audit ohne Terminal-Event. Wachstum unbounded.

**#3** — `image_gen.py:67-87` rief drei Supabase-Queries direkt auf ohne Exception-Handling: Aggregator auf `app_generated_images`, Lookup auf `app_user_limits`, Fallback auf `app_settings`. Auf PROD ohne A2-Migration (`app_user_limits` und `app_generated_images` existieren dann nicht) → `postgrest.APIError` → 500 für den User auf jeden Bildgenerierungs-Aufruf. Auf DEV mit angewendeter A2 latent: nur reachable bei transientem Supabase-REST-Disconnect / Kong-Hiccup. Der Audit-Scope hat den Aggregator-Query an L56-64 unterschätzt — der hatte denselben PROD-Failure-Mode (gleiche Tabelle aus derselben A2-Migration).

**#230** — `image_gen.py:203` rief `get_api_key("xai")` (ohne Hyphen), `:254` dispatched auf `provider == "xai"`, und `:258` führte „Supported: openai, xai" als Fehlertext. Der Rest der Codebase nutzt durchweg `"x-ai"` (mit Hyphen): `providers.py:13` `KNOWN_PROVIDERS`, `config.py:19` `PROVIDER_KEYS`, `llm.py:40` `PROVIDER_CONFIG`, `llm.py:70` Seed-Modell `x-ai/grok-4`. Konsequenz: `get_api_key("xai")` returns `None` (Keys sind unter `"x-ai"` gespeichert) → 503; oder Dispatch fällt durch zu `else` → 400 mit dem self-contradicting Fehlertext „Unsupported image provider: x-ai. Supported: openai, xai". xAI-Image-Gen war seit Launch tot. Verifier-D bestätigte: keine `app_model_config`-Row mit `provider='xai'` existiert (keine Seed-Daten, keine Admin-Insertion), daher dormant heute — aber tot ab dem ersten xAI-Image-Model.

### Fix

**audit.py:31** — neue Konstante:
```python
IMAGE_GENERATE_CANCELLED = "image.generate.cancelled"
```
Eigener Audit-Action-Wert (statt Re-Use von `IMAGE_GENERATE_FAILED`), damit Failure-Rate-Metriken in `get_image_usage_report` zwischen echtem Provider-Fehler und User-Cancel unterscheiden können.

**image_gen.py — drei Änderungen:**

1. **#179** — `import asyncio` am Datei-Anfang. Neuer Handler-Branch im try/except an L392 (BEFORE `except HTTPException`):
   ```python
   except asyncio.CancelledError:
       error_msg = "CancelledError: client disconnect or task cancellation"
       logger.warning("Image generation cancelled image_id=%s provider=%s model=%s", image_id, provider, model)
       mark_image_failed(image_id, error_msg)
       audit.log_event(action=audit.IMAGE_GENERATE_CANCELLED, ..., metadata={"provider": provider, "model": model, "cancelled": True})
       raise  # MUST re-raise — swallowing CancelledError bricht asyncio-Task-Semantik
   ```
   Bewusst kein `await` im Cleanup-Pfad: `mark_image_failed` und `audit.log_event` sind sync (sync supabase-py-Client), kein neuer Cancel-Window.

2. **#3** — `check_daily_cost_cap` wrappt alle drei Queries einzeln in `try/except Exception` mit `logger.warning` mit Klassen-Name + Fallback-Default. Aggregator-Fallback: `used_today = 0.0`. Limits-Fallback: `daily_limit = None` (führt zur Settings-Lookup). Settings-Fallback: `daily_limit = 5.0` (hard fallback). Pattern matched die existierende `providers.py:39`-Konvention (broad Exception, Klassen-Name geloggt). Bugs im eigenen Code bleiben sichtbar via Klassen-Name + Message-Logging; PROD-pre-A2 + transient-Outages werden gnädig gehandhabt.

3. **#230** — drei String-Literal-Swaps:
   - `image_gen.py:203`: `get_api_key("xai")` → `get_api_key("x-ai")`
   - `image_gen.py:254`: `if provider == "xai":` → `if provider == "x-ai":`
   - `image_gen.py:258`: `"...Supported: openai, xai"` → `"...Supported: openai, x-ai"`
   Keine Data-Migration nötig (keine bestehende `app_model_config`-Row mit `provider='xai'` per Verifier-D-grep bestätigt).

### Auswirkung

| Pfad | Vor Fix | Nach Fix |
|---|---|---|
| User cancel mid-gen (Bilder.jsx „Abbrechen") | Pending-Row leakt für immer, kein Audit-Terminal-Event | Row → `status=failed`, Audit `image.generate.cancelled`, asyncio-Cancel propagiert sauber |
| Supabase-REST-Outage während Cost-Cap-Check | 500 für den User, Audit-Trail unklar | `logger.warning` mit Klassen-Name, Fallback-Defaults, Generation läuft weiter |
| PROD ohne A2 (post-Catchup-Lag) | 500 auf jedem Image-Gen-Call | Generation funktioniert mit Default-Limits (5.0 USD) bis A2 nachgezogen ist |
| xAI-Image-Model-Generation | 503 „xAI API key not configured" oder 400 self-contradicting | Funktioniert sobald ein xAI-Image-Model registriert ist |

### Bewusste Out-of-Scope

- **`resolve_style_prefix` (image_gen.py:117-133)** hat denselben unprotected-Query-Pattern auf `app_image_style_presets`. Separates Finding (nicht von Audit #3 umfasst), nicht gebündelt. Wenn aktiv — ist es nicht heute auf DEV/PROD.
- **`_run_rechunk_task` in main.py** hat denselben CancelledError-Gap (laut Audit-Hinweis bei #179). Separates Finding, anderes File, separater Fix-Cycle.
- **`app_image_style_presets`-Query in `resolve_style_prefix`** würde PROD-pre-A2 auch 500en, aber Audit-Scope unterscheidet. Future-Finding.
- **Pydantic `Literal["openai", "x-ai"]` für `provider` in `CreateModelConfigRequest`** würde künftige Provider-Namen-Mismatches kategorisch verhindern. Verifier-B-Empfehlung, aber Scope-Creep für diesen Commit.
- **Per-Modell-konfigurierbare Daily-Cost-Limits** — Future-Feature.

### Berührte Dateien

**Code:**
- `backend/app/audit.py` — neue Konstante `IMAGE_GENERATE_CANCELLED`
- `backend/app/image_gen.py` — `import asyncio`; `check_daily_cost_cap` umgebaut; CancelledError-Branch ergänzt; drei `"xai"` → `"x-ai"` Swaps

**Docs:**
- `docs/IMPLEMENTIERT.md` — dieser Eintrag
- `docs/BUG-AUDIT-2026-05-13.md` — #3, #179, #230 auf `FIXED 2026-05-18`
- `docs/BUG-FIX-PLAYBOOK.md` — #230 (G3), #179 (G5) Status geflippt; #3 als neuer G3-Row; §5-Eintrag
- `docs/PROD-UPGRADE-PLAYBOOK.md` — Hinweis dass #3-Fix die A2-Pre-Reqs-Härte für Image-Gen lockert
- `docs/SECURITY.md` — neue Audit-Action `image.generate.cancelled` dokumentiert
- `docs/CODING-DOKUMENT.md` — Provider-Naming-Konvention (`"x-ai"` mit Hyphen, niemals `"xai"`)

### PROD-Reachability-Hinweis

- **#179**: PROD-relevant — ein User auf PROD, der mid-gen cancelt, leakt heute Rows. Fix wirkt sofort nach Deploy.
- **#3**: lockert die A2-Pre-Req für PROD — Image-Gen-Routen 500en nicht mehr hard wenn A2 noch nicht angewendet ist. ABER: A2 muss trotzdem auf PROD nachgezogen werden, sonst funktionieren Cost-Tracking + Limits-Enforcement nicht. Defense, keine Migration-Ersetzung.
- **#230**: wird relevant sobald ein xAI-Image-Model registriert wird; aktuell dormant (keine xAI-Image-Modelle in `app_model_config`).

### Phase-A-Verifikationsteam

Vier parallele Opus-Agenten 2026-05-18, unabhängige Reports:

- **Verifier A** (informiert, Mechanism-Focus): bestätigte httpcore→httpx Empty-Message-Kette aus #279 ist auch der Mechanismus warum CancelledError-Cleanup fehlt; `postgrest.APIError` als kanonische Klasse für #3-Catch identifiziert → VERDICT 3× still-real
- **Verifier B** (informiert, User-Impact-Focus): traced den `Bilder.jsx`-AbortController-Pfad end-to-end, bestätigte #179 ist LIVE heute; identifizierte zusätzliche unprotected-Queries für Future-Findings → VERDICT 3× still-real
- **Verifier C** (impartial, Cold-Eyes ohne Audit-Framing): identifizierte UTC-Day-Boundary-Bug (Audit #23) und `resolve_style_prefix`-Gap als zusätzliche Smells → VERDICT 3× still-real
- **Verifier D** (Blast-Radius): bestätigte keine `app_model_config`-Row hat `provider='xai'` → kein Data-Migration für #230; identifizierte `main.py:_run_rechunk_task` als CancelledError-Sibling-Finding → empfahl Bundling der 3 Fixes

Konsens: 4-of-4 still-real für alle drei Findings.

---

## UX-Fix #281 — Misleading-Cancel-Button-Honesty in Bilder.jsx (2026-05-18)

**Anlass:** Direkt nach dem #179-Deploy testete der User den Cancel-Button durch tatsächliches Klicken während einer gpt-image-1-Generation. Empirisches Ergebnis: das Bild erschien beim Reload trotzdem in der Galerie. Phase-A-Annahme („Starlette propagiert Client-Disconnect als `CancelledError` an den Handler-Task") war empirisch falsch — Starlette/FastAPI cancelt den Handler-Task NICHT automatisch bei Client-Disconnect. Der bestehende `except asyncio.CancelledError`-Branch in `image_gen.py:420-438` ist daher nur für Server-Shutdown / Worker-Recycle / explizite `task.cancel()`-Calls relevant, nicht für User-Cancel.

### Befund

`frontend/src/components/Bilder.jsx:124-126` `handleCancel` ruft `AbortController.abort()` — Frontend wartet nicht mehr auf die Response. Aber:
- Browser schließt TCP-Verbindung → Uvicorn legt `http.disconnect`-Event in die ASGI-Receive-Queue
- **Starlette propagiert das NICHT als Task-Cancellation.** Der Handler muss aktiv `await request.is_disconnected()` pollen — was unser Code nicht tut
- Backend führt den OpenAI/xAI-POST fertig aus → `mark_image_succeeded` → Row landed in `status='succeeded'`

Konsequenz: der Button ist kosmetisch. User-Intent (Generation abbrechen) wird ignoriert.

### Warum kein Backend-Fix?

Backend-seitige Cancellation wäre ökonomisch ungünstig:

| Aspekt | Effekt |
|---|---|
| OpenAI/xAI-Kosten | Werden trotzdem berechnet (Request ist bereits raus) |
| Bild auf Provider-Seite generiert | Ja |
| Bei Cancellation: in unserer DB gespeichert | Nein (Row markiert `failed`, `cost_usd=0`) |
| User-Daily-Cap-Counter | Inkrementiert NICHT |
| Konsequenz | **Buchhaltungs-mismatch: wir zahlen Provider, zählen aber nichts in unserer Cap-Statistik** |

Daher: Backend-Behavior heute ist **korrekt**. Was schlecht ist, ist die UX — der Button verspricht etwas das er nicht halten kann.

### Fix (UX-only)

**`frontend/src/i18n/strings.js`** — zwei neue Strings:
```diff
-    'bilder.button.cancel': 'Abbrechen',
+    'bilder.button.cancel': 'Verstecken',
     'bilder.status.generating': 'Wird generiert...',
+    'bilder.status.backgrounded': 'Bild wird im Hintergrund fertig generiert. Du findest es gleich in der Galerie.',
```

**`frontend/src/components/Bilder.jsx`** — drei Änderungen:
1. Neues `formInfo`-State + `backgroundRefreshRef`-Ref für Timer-Cleanup
2. `handleCancel` ergänzt: setzt `formInfo` mit Toast-Text, plant nach 90 s ein automatisches `loadGallery(true)` + `loadBudget()` + Toast-Clear (90 s deckt gpt-image-1 p95 + xAI-Modelle)
3. JSX rendert `formInfo` als blauen Info-Banner neben `formError`-Rendering-Slot
4. Cleanup-Effect canceled offenen Timer beim Unmount

Frontend ehrt jetzt was tatsächlich passiert: „dein Bild wird im Hintergrund fertig — wir holen es gleich für dich". Kein Lying, kein falsches Cancellation-Versprechen.

### Auswirkung

| User-Aktion | Vor Fix | Nach Fix |
|---|---|---|
| Klick auf „Abbrechen" während Generation | UI unblockt; Bild taucht still bei Reload in der Galerie auf — User verwirrt | UI unblockt; Toast erklärt dass Generation weiterläuft; Galerie aktualisiert sich automatisch nach 90 s |
| Tab-Wechsel während Generation | Generation läuft im Backend weiter (unverändert) | Generation läuft im Backend weiter; bei Rückkehr zum Bilder-Tab + manuellem Refresh → Bild da |

### Phase-A-Lesson (memory aktualisiert)

Diese Iteration deckte ein Phase-A-Protokoll-Loch auf: 4 Opus-Verifier waren über #179 einig, weil sie alle die gleiche unverifizierte Annahme über Starlette-Runtime-Verhalten teilten. Multi-Agent-Consensus ist kein Beweis wenn alle Agenten den gleichen Blind-Spot haben. Neue Memory-Entry `feedback_phase_a_trace_triggers` dokumentiert die Lessons: Runtime-Trigger-Pfade müssen mit Doc/Source-Zitat verifiziert werden, nicht nur statische Code-Pattern; bei UI-Interaktionen empirisches Testing durch den User vor Code-Fix bevorzugen.

### Bewusste Out-of-Scope

- **#179-Backend-Fix bleibt drin.** Die `except asyncio.CancelledError`-Logik handelt Server-Shutdown / Worker-Recycle / programmatisches Cancellation sauber — selten aber real, kein Wegwerfen des Commits.
- **Echte Cancellation (Backend hört auf zu warten + Disconnect-Polling)** — bewusst NICHT eingebaut, weil ökonomisch nicht sinnvoll (siehe „Warum kein Backend-Fix?" oben).
- **Eigener Toast-Komponenten-Slot statt inline-Banner** — Frontend hat noch keine zentrale Toast-Komponente; inline-Banner ist pragmatisch. Future-Cleanup-Kandidat.
- **`bilder-form-info`-CSS-Klasse** — heute inline-style, nicht in `styles.css`. Wenn weitere Info-Banner kommen, sollte eine echte Klasse her.

### Berührte Dateien

**Code:**
- `frontend/src/i18n/strings.js` — 2 String-Änderungen (1 Update, 1 neu)
- `frontend/src/components/Bilder.jsx` — `formInfo`-State + `backgroundRefreshRef`-Ref + `handleCancel`-Logik + JSX-Banner + Cleanup-Effect

**Docs:**
- `docs/IMPLEMENTIERT.md` — dieser Eintrag
- `docs/BUG-AUDIT-2026-05-13.md` — #281 zu „Spätere Findings" mit FIXED 2026-05-18
- `docs/BUG-FIX-PLAYBOOK.md` — §5 Eintrag für #281

**Memory:**
- `~/.claude/projects/-home-dri-code/memory/feedback_phase_a_trace_triggers.md` — neue Feedback-Regel über Phase-A-Rigor
- `~/.claude/projects/-home-dri-code/memory/project_xqt5_bug_fix_workflow.md` — Cross-Reference auf die neue Feedback-Memory ergänzt
- `~/.claude/projects/-home-dri-code/memory/MEMORY.md` — Index-Eintrag
