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

---

## Phase 3.0 — Observability-Log in `build_rag_context()` (2026-05-08)

Temporäres Logging zur Verifikation der Multi-Dok-Bias- und RRF-Sortier-Fixes. Nach jedem erfolgreich gepackten Chunk schreibt `build_rag_context()` einen `phase3=true`-Eintrag mit `{id, doc, idx, sim, rrf, rerank, tok, neighbor}` für jeden Chunk, der ins Token-Budget gepasst hat. Dadurch ist post-hoc nachweisbar, ob die Sortierung tatsächlich Chunks aus mehreren Dokumenten ins Budget bringt und welcher Score (vektor-similarity, RRF, oder Cohere-Rerank) die Reihenfolge bestimmt hat.

Geplante Entfernung: nach Abschluss der Phase-3.1-Verifikationsmatrix. Das Log ist explizit mit dem Marker `phase3=true` getaggt, damit ein simpler Grep den Entfernungspunkt findet.

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

Aufbau eines reproduzierbaren Test-Korpus für die Phase-3.1-Verifikationsmatrix unter `docs/tests/phase3/corpus/`. Source-of-Truth ist `MUSTERBAU.md` (374 Zeilen) mit gefrorenen Werten für eine fiktive Musterbau GmbH (Dortmund, NRW, 127 FTE, 18,45 M € Umsatz 2025, 30 Mitarbeitende, 50 Kunden, 5 PIMS-Produktlinien, 8 Schlüsselereignisse 2025, 10 BM25-Begriffe mit exklusiver Datei-Zuweisung).

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
