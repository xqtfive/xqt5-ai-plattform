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
- **Status:** Code zum Commit fertig; Migration noch nicht angewendet (gleicher Workflow wie A1: paste-in-Studio auf dev, dann prod nach Bedarf)

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
