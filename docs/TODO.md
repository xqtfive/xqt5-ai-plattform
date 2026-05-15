# Feature-Backlog

Erstellt: 2026-03-31 | Letzter Recherche-Pass: 2026-04-29 | Quellen: `RAG-VERBESSERUNGSPLAN.md` (vollständig portiert), `articles/`, `basline-code/rag-vrm/`, `ocr-benchmark/` (Parallelprojekt mit Backend-Vergleich), `kvml_test/`

Erledigte Punkte werden nach `IMPLEMENTIERT.md` verschoben. Kein Informationsverlust — alle Details bleiben erhalten.

---

## Prioritäten

- 🔴 **BLOCKER** — Pflichtanforderung (Ausschlusskriterium ohne Umsetzung)
- 🟠 **HOCH** — Hoher Mehrwert, klarer Umsetzungspfad
- 🟡 **MITTEL** — Gutes ROI, je 1–3 Tage
- 🟢 **NICE-TO-HAVE** — Geringere Dringlichkeit, künftige Roadmap

---

## Dedup & Cache-Disziplin (Neu, Recherche-Pass 2026-04-29)

Quelle: `basline-code/rag-vrm/shared/{progress,hashing,config}.py`, `ocr-benchmark/todo.md`, `articles/medium_ocr.txt`. Bündel an Maßnahmen die zusammen die größte Token-/Storage-/Konsistenz-Verbesserung bringen — verzahnt mit „Geplante Re-Embedding-Jobs" (Teil 6.4) und „Semantisches Caching" (Teil 7).

- [x] ✅ **Content-Hash-basiertes Skip beim Upload (A1)** — geliefert 2026-05-06, dev-Migration angewendet; Details in `IMPLEMENTIERT.md` „Content-Hash Upload-Deduplikation (A1, 2026-05-06)". **Offen:** Re-Embed-Skip beim nächtlichen Job (Teil 6.4) und prod-Migration.

- [x] ✅ **Bild-Deduplizierung per pHash (A2)** — Code + Migration vollständig auf DEV angewendet (verifiziert 2026-05-13: Spalten, Index, RPC-Filter `AND a.recurring = FALSE` in allen drei Branches). **PROD:** komplett ausstehend, wartet auf prod-catchup-Track. Cross-Document-Dedup (tenant-scoped phash-Index) als Future-Work. Details: `IMPLEMENTIERT.md` „Bild-pHash Deduplikation (A2, 2026-05-06)".

- [ ] 🟠 **VLM-Inferenz-Cache** (Bild-Hash → Beschreibung, derselbe Hash wie oben wiederverwendbar)
  - Vor jedem VLM-Call: Cache-Lookup auf `content_hash`. Bei Miss: VLM aufrufen, Beschreibung speichern. TTL ∞ (Bild-Hash deterministisch, Modell-ID Teil des Cache-Keys)
  - Speicher: Redis `{cache_version}:vlm:{model_id}:{image_hash}` ODER Tabelle `app_vision_cache(image_hash, model, description, created_at)`
  - Identische Logos/Header/Footer in Geschäftsdokumenten werden so genau einmal beschrieben — typisch 5–10× Wiederverwendung pro PDF
  - Quelle: `articles/medium_ocr.txt` Kostentreiber-Analyse
  - **Aufwand:** Klein | **Wert:** Hoch — unmittelbare VLM-Token-Ersparnis

- [ ] 🟠 **Cache-Versionierungs-Präfix für Redis** (rag-vrm-Pattern)
  - Alle Redis-Cache-Keys in xqt5 als `f"{settings.cache_version}:{...}"` präfixen (Env-Var `CACHE_VERSION`, Default `"v1"`)
  - Bei Algorithmus- oder Embedding-Modell-Wechsel: `CACHE_VERSION` bumpen → alle alten Keys logisch verworfen ohne `FLUSHDB`
  - Admin-UI-Button „Cache invalidieren" (bumpt Version)
  - Greift in: BM25-Cache (Teil 4.4), semantisches Caching (Teil 7), VLM-Cache (oben), künftiges Cluster-Lookup-Cache
  - Quelle: `basline-code/rag-vrm/shared/config.py:60–62`
  - Datei: `config.py` + jede Stelle mit Redis-Set/Get
  - **Aufwand:** Klein | **Wert:** Mittel-Hoch — Voraussetzung für sichere Algorithmus-Updates

- [ ] 🟡 **Deterministische `stable_chunk_key` zusätzlich zur UUID** (idempotente Re-Indexierung)
  - rag-vrm `shared/hashing.py` nutzt deterministische Punkt-IDs. xqt5 `app_document_chunks.id uuid DEFAULT gen_random_uuid()` ist nicht deterministisch — bei Re-Index entstehen neue UUIDs für inhaltlich gleiche Chunks; alte Frontend-Zitate brechen
  - Lösung: zusätzliche Spalte `stable_chunk_key text` = `sha256(document_id || ':' || chunk_index || ':' || content_hash[:16])` mit UNIQUE-Constraint; Upsert-Pfad nutzt diesen Key
  - Schema: `ALTER TABLE app_document_chunks ADD COLUMN stable_chunk_key text UNIQUE;`
  - **Aufwand:** Klein | **Wert:** Mittel — stabile Quellverweise über Re-Index hinweg

---

## Geparkte Feature-Pläne (vollständig geplant, Umsetzung verschoben)

- [ ] 🟡 **Servicemeldungen — Admin-Ankündigungs-Banner** (geparkt 2026-05-12)
  - Vollständiger Plan inkl. 4 kritischer Review-Pässe in `docs/SERVICEMELDUNGEN-PLAN-SHELVED.md`
  - Implementation-Team war designed (4 Impl + 2 Verify Agents), aber nicht gespawned
  - Wiederaufnahme: das Shelved-Doc lesen, Codebase-Drift seit 2026-05-12 prüfen, dann das Team spawnen

- [ ] 🟡 **Phase-3.1-Verifikationsmatrix + RAG-Inspektion-Panel** (geparkt 2026-05-13)
  - Architekt bevorzugt manuelles RAG-Testing gegenüber formalisierter Matrix
  - Geparkt: sechs-Test-Matrix (A–F), `MATRIX-RUNBOOK.md` (nie angelegt), Admin-UI-Panel für RAG-Inspektion, strukturiertes `event=rag_trace`-Logging, `RAGTrace`-Dataclass-Refactor, Pre-Fusion-Rank-Capture, Per-Doc-Cap, Privacy-Mitigationen am `phase3=true`-Log
  - Bleibt aktiv: Testkorpus unter `docs/tests/phase3/corpus/` (Musterbau + Rheintal + 5 Aux), `phase3=true`-Stdout-Log
  - Vollständiger Plan + Wiederaufnahme-Checkliste in `docs/PHASE3-MATRIX-SHELVED.md`
  - **Mögliche zukünftige Wiederaufnahme via versteckter Admin/Dev-Sandbox** (Idee 2026-05-13, nicht beschlossen): nicht-verlinkter URL-/Tastenkürzel-Trigger, Sandbox-Modus ohne Persistenz, Live-Trace als Response. Würde `SECURITY.md:209` nicht berühren weil nichts logged wird. Details: `PHASE3-MATRIX-SHELVED.md` Abschnitt „Mögliche zukünftige Variante".

---

## Ausstehende Frontend-Elemente (Backend bereits implementiert)

- [x] ✅ **AdminDashboard.jsx — Toggle Kontextuelles Retrieval, Toggle Nachbar-Chunk-Abruf, Slider Token-Budget** — geliefert 2026-05-06; Details in `IMPLEMENTIERT.md` „Admin-UI Frontend-Toggles (2026-05-06)". Felder: `contextual_retrieval_enabled`, `contextual_retrieval_model`, `neighbor_chunks_enabled`, `max_context_tokens`.

---

## Teil 1: RAG-Pipeline — Offene Punkte

Geplant, aber in keinem der beiden Repos implementiert. Basis: `RAG-VERBESSERUNGSPLAN.md` und `RAG-STATUS.md`.

- [ ] 🟠 **Ordner-Upload** — Kompletten Ordner hochladen statt einzelner Dateien
  - Nützlich um Code-Projekte oder Dokumentensammlungen als Ganzes zu analysieren
  - Implementierung: Frontend-Ordner-Picker + Backend iteriert über Dateien mit bestehendem Upload-Endpunkt
  - Datei: Upload-Komponente im Frontend + `documents.py`

### Ohne Schema-Änderung

- [ ] 🟠 **Phase 6.2 — Query Expansion**
  - Generiert 2 zusätzliche Umformulierungen der Anfrage per schnellem LLM-Call, ruft für alle 3 ab, fusioniert via RRF
  - Aktivierungsbedingung: nur wenn `intent == "fact"` UND `max_similarity < 0.5` nach erstem Durchlauf
  - Neue Funktion: `_expand_query(query) -> List[str]` in `rag.py`; parallele Embeddings via `generate_embeddings`
  - Neue Admin-Einstellung: `query_expansion_enabled: bool` (Standard: false)
  - **Aufwand:** Mittel | **Wert:** Hoch für Fakten-Anfragen mit schwachem initialem Retrieval

### Mit Schema-Änderung

- [ ] 🟠 **Phase 4.1 — Upload-Metadaten-Extraktion**
  - Neue Spalten in `app_documents`: `language varchar`, `doc_type varchar`, `page_count int`, `has_tables bool`, `has_images bool`
  - Quelle: Mistral `document_annotation.language` + `image_annotation.document_type`; Fallback: langdetect + LLM-Klassifikation auf ersten 500 Tokens
  - RPC `match_document_chunks` um optionale Parameter `filter_language` und `filter_doc_type` erweitern
  - Migration: `ALTER TABLE app_documents ADD COLUMN language varchar, ADD COLUMN doc_type varchar, ADD COLUMN page_count int, ADD COLUMN has_tables bool DEFAULT false, ADD COLUMN has_images bool DEFAULT false;`
  - **Aufwand:** Mittel | **Wert:** Ermöglicht Sprach-/Typ-Vorfilterung, reduziert Suchraum

- [ ] 🟠 **Phase 6.1 — Zusammenfassungs-basierter Retrieval-Pfad**
  - Neue Spalte: `ALTER TABLE app_documents ADD COLUMN summary_embedding vector(1536);`
  - Neues RPC: `match_document_summaries` — Vektorsuche auf `summary_embedding`
  - Beim Upload: `summary_embedding` nach `_summarize_document()` generieren und speichern
  - Retrieval: wenn `intent == "summary"`, Dokumentzusammenfassungen statt Chunks durchsuchen; kleine Anzahl Chunks zur Detailgenauigkeit ergänzen
  - **Aufwand:** Mittel | **Wert:** Hoch — aktuelle Zusammenfassungs-Anfragen liefern fragmentierte Chunk-Ergebnisse

- [ ] 🟡 **Phase 5.2 — Parent-Child-Indexierung** (vollständige Implementierung)
  - Kleine Child-Chunks (128–256 Tokens) für präzises Retrieval indexiert; vollständige Parent-Chunks (512–1.024 Tokens) für die Generierung zurückgegeben
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
  - **Empfehlung:** Phase 5.3 (Nachbar-Chunks, bereits erledigt) deckt den größten Teil des Nutzens ab. Nur implementieren wenn Retrieval-Metriken klaren Bedarf zeigen.

### Großer Refactor / Externe Abhängigkeit

- [ ] 🟠 **Phase 2 — OCR-Abstraktionsschicht** *(geschärft 2026-04-29 mit Benchmark-Evidenz aus `ocr-benchmark/eval/results/summary.md`)*
  - `OCRResult`-Dataclass als einheitliches Schema definieren — **erweitert gegenüber `RAG-VERBESSERUNGSPLAN.md §2.1`** mit Feldern aus `ocr-benchmark/pipeline/models.py`:
    - `provenance.bbox: dict | None` und `provenance.section_path: list[str]` (Voraussetzung für „Highlight-in-PDF"-Quellvorschau und `file_assembly`-Endpunkt 4.8)
    - `chunk_type: Literal["heading", "paragraph", "list", "table", "figure"]`
    - Pro Figur: `classification` (chart/diagram/logo/photograph/table_image/decorative), `has_embedded_text: bool`, `embedded_text: str | None`, `image_description: str | None` getrennt (zwei VLM-Calls bei `mixed`-Klassifikation), `skipped: bool`, `skip_reason: str | None`
    - `extraction_method: str` ("mistral" | "docling+nanonets" | "docling-text-only") für spätere Pfad-Auswertung
    - `has_formulas: bool` (für Phase 5.4)
  - Bestehende Mistral-Funktionen in `documents.py` als `MistralOCRAdapter` wrappen — bleibt als Cloud-Fallback und für gescannte PDFs
  - **Primärer Extraktionspfad: `DoclingNanonetsAdapter` (Hybrid-Ansatz)** — Benchmark-Top-Score 99.9% Composite (vs. Mistral 87.6%, Docling-solo schwach bei Figuren)
    - Docling für Layout/Tabellen/Text, Nanonets-OCR-s pro Figur für Embedded-Text + Description
    - Schwelle wie ursprünglich: >80 Zeichen/Seite Durchschnitt → Hybrid-Pfad; sonst Mistral
    - **Voraussetzung:** GPU am Coolify-Host für lokale Nanonets-Inference; Fallback ohne GPU bleibt Mistral
  - **Konkrete Docling-Konfigurations-Flags** (aus `ocr-benchmark/eval/backends.py:228–240`): `do_table_structure=True`, `generate_picture_images=True`, `include_images=True`, `image_export_mode="embedded"`, `to_formats=["json", "md"]`
  - VLM-Bildinterpretation als `[BILDBESCHREIBUNG]`-Block direkt in Chunk-Text eingebettet
  - **9-Prompt-Bibliothek aus `ocr-benchmark/pipeline/prompts.py` 1:1 übernehmen** statt neu entwickeln: `TEXT_DOCUMENT`, `MIXED_CONTENT`, `CHART`, `DIAGRAM`, `TABLE_IMAGE`, `LOGO`, `PHOTOGRAPH`, `DECORATIVE`, `GENERAL` + Klassifikator-Prompt (striktes JSON-Format `{"classification": "...", "has_text": ...}`); spart einen kompletten Tuning-Zyklus
  - **Tesseract als Docling-Fallback bei Seiten mit < 80 Zeichen Text-Output** (pages ohne nativen Text) via `enable_ocr=True, ocr_engine="tesseract_cli"` — kostet null vs. Mistral-Cloud-Roundtrip
  - **PaddleOCR-VL-1.5 als zusätzlicher Adapter für GPU-lose Hosts** — 84.8% Composite, 3× schneller als Hybrid, gleichauf mit Mistral; Routing via Admin-Setting `ocr_engine: "mistral" | "docling+nanonets" | "paddle"` (pro Pool überschreibbar)
  - **Tabellen-Roundtrip:** Docling `table.export_to_html()` zusätzlich speichern (neue Spalte `app_document_chunks.table_html text`); LLM kann HTML statt Markdown einbetten für exakte Reproduktion breiter Tabellen
  - **In Doku verankern:** folgende Modelle haben den Benchmark NICHT bestanden und sollten nicht erneut evaluiert werden: `deepseek-ai/DeepSeek-OCR-2` (61.6% Composite, Suite B 16.7%), `Qwen/Qwen2-VL-2B-Instruct` (41.3%, Suite B 0%), `OpenGVLab/InternVL2-2B` (59.0%), `rednote-hilab/dots.ocr` (59.4%)
  - **Aufwand:** Mittel-Groß | **Wert:** Sehr hoch (+12 Punkte Composite, +40 Punkte in Suite B „Embedded Text in Figures")

- [ ] 🟡 **Phase 3 — Bild-Speicher-Migration** (Base64 → Supabase Storage)
  - **Hängt ab von:** Phase 2 (OCR-Abstraktion sollte zuerst erfolgen)
  - Supabase Storage Bucket `document-assets` erstellen (privat, auth-erforderlich)
  - Bilder speichern unter `{user_id}/{document_id}/{asset_id}.{ext}`, nur Pfad in `app_document_assets.storage_path`
  - Backend generiert kurzlebige Signed URLs on demand
  - Einmaliges Migrationsskript für bestehende Base64-Zeilen
  - Frontend ersetzt `[BILD:asset_uuid]`-Marker durch gerenderte Bilder via Signed URL

- [ ] 🟢 **Phase 8 — Multimodales Query-Handling**
  - **Hängt ab von:** Phase 3 (Bildspeicher) + Phase 2 (OCR-Abstraktion)
  - `detect_query_intent()` um visuelle Anfragen erweitern ("Was zeigt das Diagramm auf Seite 5?")
  - Vision-fähiger Nachrichtenkonstruktor in `llm.py`
  - ColPali-Evaluation: `byaldi` (RAGatouille Wrapper) beobachten; nur übernehmen wenn OCR-Benchmarking persistente Ausfälle bei tabellen-/layout-schweren Dokumenten zeigt (erfordert self-hosted Modell + Qdrant)

---

## Teil 2: Feature-Anforderungen aus Anforderungsanalyse

Quellen: `kvml_test/` — die Anforderungen sind direkt als Produktverbesserungen anwendbar.

### Neue Dateiformate & Upload

- [x] ✅ **CSV-, MD-, XLSX- und XLS-Upload und -Verarbeitung** — umgesetzt 2026-05-08/11 (siehe `IMPLEMENTIERT.md` Abschnitte „Phase 3.5 — Filetype-Erweiterung" und „`.xls`-Support + Legacy-Fixture")
  - `_extract_csv_text` (stdlib csv mit Delimiter-Sniffer), `_extract_xlsx_text` (openpyxl, pro Sheet ein `## SheetName` + Markdown-Tabelle), `_extract_xls_text` (xlrd<2.0 für Legacy-BIFF8) in `documents.py`. `.md` als UTF-8-Decode (identisch zu `.txt`).
  - `pandas` NICHT eingeführt — stdlib + openpyxl reichten aus.
  - Chunking-Strategie umgesetzt: Markdown-Konvertierung damit der bestehende heading-aware Chunker greift; kein neues Schema.

- [x] ✅ **DOCX-Upload und -Verarbeitung** — umgesetzt 2026-05-08
  - `_extract_docx_text` in `documents.py` mit `python-docx`, walkt `doc.iter_inner_content()` in Dokumentenreihenfolge; Heading-Style-Paragraphen werden zu Markdown-Headings, Tabellen zu Markdown-Pipe-Tabellen.
  - Eingebettete Bilder NICHT extrahiert (warten auf OCR-Pipeline v2 / Docling).

- [ ] 🟢 **`.doc`, `.ppt`, `.pptx`-Upload** — geparkt 2026-05-11
  - `.doc` und `.ppt` benötigen System-Tool-Subprozesse (`antiword`, `catdoc`) als Nixpkgs-Einträge — ~15 MB Image-Wachstum.
  - `.pptx` (via `python-pptx`) verwirft Bilder, Group-Shapes, Notes-Slides still — würde RAG-Indizes selbstüberzeugend unvollständig machen.
  - Test-Fixture `strategieklausur_2025.pptx` ist nach `docs/tests/phase3/corpus/_shelved/` verschoben (mit README).
  - Revisit: bei OCR-Pipeline v2 / Docling-Adoption (Roadmap-Priorität #6) — Docling liest alle drei mit Layout-Bewusstsein nativ.

- [x] ✅ **Multi-Datei-Upload (Mehrfach-Auswahl mit Concurrency=2)** — umgesetzt 2026-05-11 (siehe `IMPLEMENTIERT.md` Abschnitt „Multi-Datei-Upload mit Concurrency=2 + 401-Retry-Fix")
  - `<input type="file" multiple>` plus Worker-Pool-Semaphore in `FileUpload.jsx` und `PoolDocuments.jsx`.
  - Per-Datei-State-Array statt zentralem Error-Slot; Per-Datei-Statusliste in der UI.
  - Begleitender Bugfix: 401-Retry mit `tryRefresh()` in `uploadWithXhr` — pre-existing Bug, der auch Single-File-Uploads betraf.
  - Rate-Limit bleibt bei 20/min (User-Entscheidung); Batches > 20 Dateien lösen Warning-Dialog aus.

### Chat & UX

- [ ] 🟠 **Canvas / Artifacts-Renderer** (Code-Live-Vorschau + Diagramme)
  - Code-Blöcke in Antworten mit Live-Vorschau in einer sandboxed `<iframe>` rendern
  - Mermaid-Diagramm-Rendering (Charts, Flowcharts, Sequenzdiagramme) aus fenced Code-Blöcken
  - HTML/CSS/JS-Vorschau für generierten Web-Code
  - Umschalten pro Nachricht: "Code anzeigen" ↔ "Vorschau"
  - Implementierung: Frontend-only, keine Backend-Änderungen nötig; `DOMPurify` + sandboxed iframe für Sicherheit
  - Datei: neue `Artifacts.jsx`-Komponente, integriert in `MessageBubble.jsx`

- [ ] 🟠 **Inline-Zitierungen im Antworttext**
  - Aktuell werden Zitierungen als Quellliste unter der Antwort angezeigt
  - Inline `[1]`-Referenzmarker in der LLM-Antwort hinzufügen, verknüpft mit der Quellliste
  - Implementierung: LLM via System-Prompt anweisen `[SOURCE:N]`-Marker zu verwenden, dann Marker im Frontend durch klickbare hochgestellte Links ersetzen
  - Erfordert Prompt-Engineering-Änderung in `main.py` + Frontend-Marker-Ersatz in `MessageBubble.jsx`

- [ ] 🟡 **Nachrichten-Feedback (Daumen hoch/runter)**
  - Daumen-hoch/runter-Button bei jeder Assistenten-Antwort
  - Speichern: `message_id`, `user_id`, `rating` (1/-1), `timestamp` in neuer `app_message_feedback`-Tabelle
  - Admin-Ansicht: Feedback-Übersicht, sortierbar nach Modell/Datum/Bewertung
  - Nützlich für: schlechte Antworten identifizieren, RAG-Schwellenwerte tunen, Modellvergleiche
  - Datei: `MessageBubble.jsx`, neuer `feedback.py`-Router

- [ ] 🟡 **Chat-Fork** (geteilten Chat in eigenen Workspace kopieren)
  - Beim Betrachten einer geteilten/Pool-Konversation erstellt "Fork"-Button eine persönliche Kopie
  - Neue Konversation mit allen duplizierten Nachrichten, verknüpft mit Original via `forked_from_id`
  - Nutzer kann ab dem Fork unabhängig weiterarbeiten
  - Datei: `storage.py` + `Sidebar.jsx`

- [ ] 🟠 **Follow-up-Prompt-Vorschläge**
  - Nach jeder Assistenten-Antwort 2–3 vorgeschlagene Anschlussfragen als klickbare Chips auto-generieren
  - Jetzt Standard bei ChatGPT, Perplexity, Open WebUI
  - Implementierung: ein async LLM-Call nach Generierung (non-blocking); Vorschläge im SSE-Final-Event oder separatem Feld in Response-JSON speichern
  - Günstiges Modell (Haiku/Flash) ausreichend; Prompt: "Given this Q&A, suggest 3 short follow-up questions"
  - Datei: `main.py` (Post-Generierungs-Async-Call) + `MessageBubble.jsx` (Chip-Rendering)

- [ ] 🟠 **Persistentes Nutzer-Gedächtnis über Sessions hinweg**
  - Nutzer akkumulieren über die Zeit einen Gedächtnisspeicher: Fakten, Präferenzen, Projektkontext, Korrekturen
  - Als `[Memory]`-Block in den System-Prompt bei jedem Turn injiziert
  - Nutzer kann Erinnerungen einsehen/bearbeiten/löschen; Admin kann alle löschen
  - Referenz: `mem0` Open-Source-Bibliothek, oder einfache `app_user_memories`-Tabelle: `id, user_id, content, created_at, source_conversation_id`
  - LLM extrahiert neue merkbare Fakten aus jedem Konversations-Turn asynchron (Hintergrundaufgabe, nicht blockierend)
  - Datei: neues `memory.py`-Modul + `UserMemory.jsx`-Einstellungspanel

- [ ] 🟠 **Chat-Verzweigung / Konversationsbaum**
  - Konversation an *beliebigem* Nachrichten-Knoten forken — nicht nur vom Start (verschieden vom "Chat-Fork" oben der komplette geteilte Chats kopiert)
  - Erstellt Versionsbaum: mehrere Zweige vom gleichen Eltern-Knoten
  - DB: `app_conversations` erhält `parent_conversation_id` + `branch_point_message_id` FKs
  - UI: Verzweigungs-Icon bei jeder Assistenten-Nachricht; Sidebar zeigt verzweigte Konversationen unter Root gruppiert
  - Datei: `storage.py`, `Sidebar.jsx`, `MessageBubble.jsx`

- [ ] 🟡 **A/B-Arena-Modus** — ~2–3 Tage
  - Geteilte Chat-Ansicht mit zwei Modellen auf denselben Prompt; Daumen hoch/runter pro Antwort

- [ ] 🟡 **Dokumentenvergleich** — ~2–3 Tage
  - Zwei Dokumente auswählen → strukturiertes Diff/Vergleich via LLM; Nebeneinander-Ansicht

- [ ] 🟡 **Sprache-zu-Text-Eingabe** — ~2 Tage
  - Web Speech API (browser-nativ); Mikrofon-Button in Chat-Eingabe

### Prompt-Bibliothek & Assistenten

- [ ] 🟡 **Prompt-Bibliothek: Team-/Gruppen-Scope**
  - Aktuell sind Templates entweder global oder persönlich
  - "Team"-Scope hinzufügen: sichtbar für alle Mitglieder eines bestimmten Pools oder einer Nutzergruppe
  - DB: `group_id` FK zu `app_templates` hinzufügen (nullable); scope = global | group | personal
  - UI: Template-Picker zeigt Gruppen-Templates als separaten Abschnitt
  - Datei: `templates.py`, `TemplatePicker.jsx`

- [ ] 🟡 **Feinkörnige Assistenten-Freigabe pro Gruppe**
  - Aktuell sind globale Assistenten für jeden sichtbar; keine Gruppen-Freigabe
  - `sharing_scope` hinzufügen: `global` | `group:{group_id}` | `private`
  - UI: Assistenten-Erstellungsformular enthält Scope-Auswahl
  - Datei: `assistants.py`, `AssistantManager.jsx`

- [ ] 🟠 **Default „RAG-Recherche-Assistent"-Template mit Tool-Routing-Tabelle** *(Seed-Daten, kein Code)*
  - Quelle: `basline-code/rag-vrm/documentation/owui_system_prompt` v3 — kompakte Markdown-Tabelle die jedem Query-Typ ein Erst-Tool zuordnet (Filename → analyze_file, Functionality → search_code, Stack-Trace → resolve_stack_trace, etc.). Pattern schlägt prosa-artige Anweisungen bei kleinen lokalen Modellen
  - **Wirkt zusammen mit MCP (Teil 3) und Pre-LLM Tool-Routing (Teil 6.1):** liefert Out-of-the-Box-Erfahrung für RAG-Nutzer und entkoppelt Prompt-Engineering von Code
  - Vorlage in `app_assistants` (oder `app_templates` mit `template_type='system_prompt'`) anlegen; Beispiel-Inhalt aus `owui_system_prompt` v3 als Startpunkt; Admin kann pro Pool aktivieren
  - **Aufwand:** Trivial (Seed-Migration) | **Wert:** Hoch — sofort starke Default-UX, reduziert Tool-Auswahl-Fehler bei kleineren Modellen

---

## Teil 3: Enterprise & Identity

### Pflichtanforderungen

- [ ] 🔴 **Azure Entra ID SSO (OIDC / OAuth 2.0)** — ~3–4 Tage
  - Backend: `/auth/entra/login` + `/auth/entra/callback` mit `msal` oder `authlib` hinzufügen
  - Beim Callback: ID-Token validieren, E-Mail/Anzeigename/Gruppen extrahieren, Nutzer in DB anlegen
  - Frontend: "Mit Microsoft anmelden"-Button → Redirect → Callback → JWT speichern
  - Env-Vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`
  - Bestehenden Benutzername/Passwort-Login für lokale Entwicklung behalten

- [ ] 🔴 **Model Context Protocol (MCP) Support** — ~4–5 Tage
  - MCP Python SDK (`modelcontextprotocol`) integrieren
  - Admin-UI zur Registrierung von MCP-Servern (URL + Auth)
  - Tool-Calls durch MCP vor LLM-Call routen
  - Human-in-the-loop Tool-Bestätigungs-UI
  - OAuth 2.0 Auth-Flow für Remote-MCP-Server

- [ ] 🔴 **Unveränderliche globale System-Prompts** (admin-definiert, nicht überschreibbar) — ~1 Tag
  - `global_system_prompt`-Feld zu `app_settings` hinzufügen
  - In `llm.py`: immer vor Nutzer-/Assistenten-Prompt voranstellen
  - Admin-UI: Toggle + Texteditor; Nutzer können es weder sehen noch überschreiben

### Hochwertige Plattform-Features

- [ ] 🟠 **RBAC aus Entra ID-Gruppen** (~1 Tag nach SSO)
  - Entra-Gruppen-IDs → Plattform-Rollen mappen (admin, power_user, basic_user)
  - Gruppen→Rollen-Mapping in `app_settings` speichern; bei Login und Token-Refresh anwenden

- [ ] 🟠 **Fallback-Modell bei Provider-Ausfall** — ~1–2 Tage
  - In `llm.py`: Provider-API-Fehler abfangen → mit konfiguriertem Fallback-Modell wiederholen
  - Admin-UI zur Konfiguration des Fallbacks pro Provider; Fallback-Ereignisse ins Audit-Log schreiben

- [ ] 🟠 **Web-Suche-Toggle** — ~3 Tage
  - Brave Search API oder Serper API integrieren
  - Pro-Konversations-Toggle (Nutzer) + Standard-Einstellung (Admin)
  - Suchergebnisse als Kontext in System-Prompt anhängen; Quellen in Zitierungen anzeigen
  - Nutzerkonfigurierbare Filter pro Suche: Domain-Whitelist (z.B. nur vertrauenswürdige Quellen), Zeitraum (letzte Woche/Monat/Jahr/beliebig), Compliance-Modus (schließt nicht verifizierbare Quellen aus)
  - Admin kann Standard-Filter-Presets setzen; Nutzer überschreibt pro Konversation
  - Filter-Status pro Konversation in `app_conversations.search_filter_config jsonb` gespeichert

- [ ] 🟠 **Audit-Log — Append-only erweitern** — ~0,5 Tage
  - `app_audit_logs`-Tabelle, `audit.py`-Modul und Admin-UI-Tabellenansicht existieren bereits; LLM-Calls, Logins und Admin-Aktionen werden bereits geloggt
  - **Fehlend:** RLS Append-only-Enforcement — neue Migration mit `CREATE POLICY` die DELETE/UPDATE auf `app_audit_logs` blockiert; keine solche Policy existiert heute
  - **Fehlend:** Datei-Uploads nicht geloggt — `audit.log_event()`-Aufrufe in Upload-Handlern in `main.py` und `documents.py` hinzufügen
  - **Fehlend:** Token-Counts fehlen in LLM-Audit-Einträgen — `metadata`-Payload bei `main.py:763` um `prompt_tokens` und `completion_tokens` erweitern

- [x] **DB-Sicherheits-Posture klären (Supabase Advisor 2026-05-06)** — abgeschlossen für Anon, Folge-Migrationen siehe unten
  - Vollständige Analyse + Verifikationsbefehle: `docs/SECURITY.md`
  - **2026-05-06: Anon-Rolle revoked** via `20260506_b_revoke_anon_public.sql` — auf prod angewendet, alle 6 getesteten Tabellen liefern jetzt HTTP 401. Dev: idempotent, noch nicht angewendet (Aufgabe für später, unkritisch)
  - **Folge-Lücken verbleiben** — siehe Einträge unten

- [x] **`authenticated`-Rolle revoken — Spiegel zu Anon** — ✅ 2026-05-06 angewendet auf prod via `20260507_revoke_authenticated_public.sql`. Smoke-Test (Login + Chat + Upload) erfolgreich. Dev: idempotent, noch ausstehend.

- [ ] 🟠 **Passwort-Reset für alle `app_users` erzwingen** — ~30 Min
  - **Begründung:** zwischen Setup und 2026-05-06 waren alle `bcrypt`-Hashes in `app_users.password_hash` über den Anon-Key abgreifbar. Wer den Hash hat, kann offline knacken (cost 12 ist zwar teuer aber nicht unmöglich für schwache Passwörter).
  - **Maßnahme:** alle `app_users.token_version` per `bump_token_version()` erhöhen (zwingt Logout) + Flag „bei nächster Anmeldung Passwort neu setzen". Backend hat bereits Token-Revocation-Infrastruktur (siehe `IMPLEMENTIERT.md` Token-Versions-Eintrag).

- [x] **Prod-`CORS_ORIGINS` verifizieren** — ✅ 2026-05-06: User hat bestätigt, beide Envs setzen die exakte Frontend-URL (kein Wildcard).
  - Folge-TODO 🟢: Startup-Assert in `backend/app/main.py` ergänzen, der bei `ENVIRONMENT=production` und leerer/`*`-CORS-Liste den Container nicht starten lässt — verhindert versehentliche Lockerung in Zukunft

- [x] **Supabase Studio Basic-Auth prüfen** — ✅ 2026-05-06: User hat bestätigt, lange Zufallspasswörter, nicht Coolify-Default

- [ ] 🟠 **`JWT_SECRET` rotieren — vom Supabase-JWT-Secret entkoppeln** — ~15 Min + UX-Folge
  - **Befund 2026-05-06:** Backend-`JWT_SECRET` und Supabase-`SERVICE_PASSWORD_JWT` haben den gleichen Wert. Defense-in-depth-Lücke: ein Leak gibt beide Capabilities gleichzeitig (Nutzer-Token-Forge + Service-Role-Token-Forge).
  - **Maßnahme:** `JWT_SECRET` auf prod + dev neu generieren (`openssl rand -base64 32`), beide Backend-Container neu starten
  - **Nebenwirkung:** alle aktiven Sessions werden ungültig, Nutzer müssen sich neu anmelden. Refresh-Tokens werden ebenfalls ungültig — Token-Version-Logik im Backend handhabt das aber bereits sauber
  - `SERVICE_PASSWORD_JWT` *nicht* anfassen (Rotation dort regeneriert alle Supabase-API-Keys, viel mehr Aufwand)

- [ ] 🟡 **`SET search_path` auf RPCs ergänzen** — ~30 Min, Hygiene
  - Migration `supabase/migrations/20260508_function_search_path.sql`: an `match_document_chunks`, `match_document_assets`, `keyword_search_chunks` jeweils `SET search_path = public, pg_catalog` ergänzen via `CREATE OR REPLACE FUNCTION`
  - Schließt entsprechende Advisor-Warnungen ohne Verhaltensänderung

- [ ] 🟢 **Langfristig: RLS aktivieren** — mehrwöchig, größter struktureller Gewinn
  - Auf `app_users`, `pool_*`, `app_documents`, `app_chunks`, `app_audit_logs` RLS einschalten + Policies pro Tabelle
  - Backend-Code so umstellen, dass user-scoped Reads den User-JWT durchreichen statt universellem `SUPABASE_KEY`
  - Schließt das Perimeter-Risiko (Service-Role-JWT-Leak = Total-Compromise) endgültig
  - Detail siehe `docs/SECURITY.md` Abschnitt „Offene Lücken" Punkt 8

- [ ] 🟢 **`vector` Extension nach `extensions`-Schema verschieben** — Hygiene
  - Invasive Migration (alle pgvector-Operatoren müssen fully-qualified werden); niedrige Priorität

- [ ] 🟢 **Automatischer Migration-Runner (parkiert hinter Backups)** — ~1–2 Tage
  - **Ziel:** SQL-Migrationen automatisch beim Backend-Startup anwenden statt manuell in Studio einzufügen
  - **Vorbedingung:** automatisierte Postgres-Backups + verifizierter Restore (sonst kein Sicherheitsnetz für eine Migration die etwas zerstört)
  - **Designvorschlag (recherchiert 2026-05-06, in Memory dokumentiert):** Modul `backend/app/migrate.py` postet via `httpx` SQL an `{SUPABASE_URL}/pg/query` mit dem bestehenden `SUPABASE_KEY` (kein neues Secret), trackt angewendete Filenames in `_app_migrations`-Tabelle (PRIMARY KEY = filename, atomarer apply+record per einzelnem `/pg/query`-Request mit `BEGIN…COMMIT`), Bootstrap-Heuristik: wenn `_app_migrations` fehlt aber `app_users` existiert → alle aktuellen Files als „bereits angewendet" markieren ohne SQL auszuführen
  - **Sicherheits-Caveat:** kritische Bugs in der ersten Implementierung wurden in einem Audit gefunden (siehe Memory `project_xqt5_supabase.md` und Conversation 2026-05-06): nicht-atomarer apply+record, fehlender DB-Namens-Check, leere-Tracking-Tabelle-Edge-Case. Bei Wiederaufnahme der Arbeit: Audit-Findings vor Implementation nachlesen
  - **Build-Anforderung:** Dockerfile muss `supabase/migrations/` ins Image kopieren; Build-Context-Anpassung in `docker-compose.coolify.yml` nötig (dev) plus parallele Anpassung der Coolify-Base-Dir auf prod (Backend und Frontend sind dort separate Apps)

- [ ] 🟢 **`20260506_b_revoke_anon_public.sql` auf dev anwenden** — idempotent, ~1 Min
  - Dev hat aktuell keine Anon-Rolle exponiert, daher kein akutes Risiko. Migration trotzdem anwenden um Konsistenz zwischen Envs herzustellen und gegen künftige Supabase-Template-Updates zu schützen, die anon ggf. wiederaktivieren

- [ ] 🟠 **Token-Budgets und EUR-Kostenlimits** — ~2–3 Tage
  - Token-Nutzung pro Nutzer pro Zeitraum in `app_usage`-Tabelle verfolgen
  - Admin: max. Tokens/Tag pro Nutzer, max. EUR/Monat pro Gruppe setzen
  - Soft-Warnung bei 80%, Hard-Block bei 100%; Nutzungs-Dashboard im Admin-Panel

- [x] 🟠 **Bild-Generierung v1 — Bilder-Tab** — umgesetzt 2026-05-13 (~4 Tage)
  - OpenAI + xAI als Provider; Bilder-Tab (NavRail)
  - Admin: Bildmodelle-Tab, Bild-Stil-Tab, Bild-Kosten in Kosten-Tab, per-User-Tageslimit
  - Status-Spalte für finanzielle Integrität; tägliches Kostenlimit mit System-Default-Fallback
  - Storage v1: Provider-URLs mit `storage_kind`-Discriminator
  - Korrektheit-Fix `admin.py:204-205`: `is_default`-Reset scoped auf `model_type`
  - Details: `docs/IMPLEMENTIERT.md` — Abschnitt „Bildgenerierung"
  - **/bild-Slash-Command aus v1 herausgenommen** — Frontend-Parser entfernt (2026-05-13)

- [ ] 🟡 **Bildgenerierung v2 — `/bild`-Slash-Command im Chat**
  - Erfordert: (a) beim Generieren mit `chat_id`/`pool_chat_id` auch `chat_messages`-Zeile mit `generated_image_id` setzen; (b) Entscheidung Message-Struktur (einzelne Assistenten-Nachricht vs. User+Assistant-Paar); (c) Frontend-Slash-Parser in `MessageInput.jsx` + `PoolChatArea.jsx` wiederherstellen; (d) `App.jsx`-Handler `handleGenerateImageInChat`/`handleGenerateImageInPoolChat` + `poolChatRefreshKey` + ChatArea/PoolDetail-Prop-Threading wiederherstellen; (e) i18n-Key `chat.slash.image.help` wiederherstellen; (f) ~~Migration: ALTER CHECK constraint~~ — **erledigt 2026-05-13 vorgezogen via `supabase/migrations/20260513_b_widen_source_check.sql`**. v2 muss nur noch `models.py` `ImageGenerationRequest.source` Literal um `'chat_slash'` und `'pool_chat_slash'` erweitern.
  - Pool-Sichtbarkeit: Shared Chat → alle Mitglieder sehen Bild; Private Chat → nur Ersteller

- [ ] 🟡 **Bildgenerierung v2 — Supabase Storage Migration** — nach v1-Stabilisierung
  - `storage_kind = 'supabase'` in `image_storage.resolve_image_url()` implementieren
  - Bilder in Supabase Storage unter `{user_id}/{image_id}.{ext}` ablegen
  - Signed URLs mit TTL statt temporärer Provider-URLs
  - Hängt ab von: Google Imagen Support (gleicher Migrationsschritt)

- [ ] 🟡 **Bildgenerierung v2 — Bild-zu-Bild / Edit / Inpaint** — nach Supabase Storage
  - Bildbearbeitung über OpenAI Edits-API oder vergleichbare xAI-Funktion
  - Inpainting: Maske auf bestehendem Bild zeichnen + Prompt

- [ ] 🟡 **Bildgenerierung v2 — Per-Team und Per-Pool Stil-Presets**
  - `scope_type = 'team'` und `scope_type = 'pool'` in `app_image_style_presets` befüllen
  - Datenmodell bereits vorhanden; nur Backend-Lookup-Logik und Admin-UI ergänzen

- [ ] 🟡 **Bildgenerierung v2 — Wasserzeichen auf generierten Bildern**
  - Optionales Corporate-Wasserzeichen serverseitig einbetten (pillow/cairosvg)
  - Admin-Toggle; Wasserzeichen-Text/-Logo konfigurierbar

- [ ] 🟡 **Bildgenerierung v2 — Multi-Währungs-Kostenansicht**
  - Kosten in EUR neben USD anzeigen (Wechselkurs via konfigurierbarem Faktor)

- [ ] 🟡 **Bildgenerierung v2 — Google Imagen Support**
  - Abhängt von Supabase Storage (Google liefert keine temporären CDN-URLs)

- [ ] 🟠 **UI-Lokalisierung (Deutsch)** — ~1 Tag
  - Alle UI-Strings (Buttons, Labels, Platzhalter, Fehlermeldungen, Onboarding) auf Deutsch verfügbar
  - Sprach-Toggle in Nutzer-Einstellungen; Standard durch Browser-Locale oder Admin-Konfiguration bestimmt
  - Minimum: vollständige deutsche Sprachdatei für alle aktuellen UI-Flächen
  - Implementierung: hartcodierte Strings in Locale-Objekt extrahieren (`de.js` / `en.js`), zur Laufzeit laden

- [ ] 🟠 **No-Code-Agent / Workflow-Editor** — ~5–7 Tage
  - Visueller Editor für nicht-technische Nutzer zur Definition mehrstufiger Agent-Workflows: Tools verketten, Bedingungen setzen, Ein-/Ausgabe-Mappings definieren
  - Jeder Workflow-Knoten kann sein: LLM-Call, Web-Suche, RAG-Lookup, MCP-Tool-Call, Code-Ausführung, bedingter Zweig
  - Workflows als JSON in DB gespeichert, als benutzerdefinierter Assistent ausführbar
  - UI: Drag-and-Drop-Canvas oder sequenzielle Schritt-Liste (Schritt-Liste geringerer Aufwand und für Initialversion ausreichend)
  - Hängt ab von MCP-Support für Tool-Ausführung
  - Datei: neue `WorkflowEditor.jsx`, `workflows.py`-Router, `app_workflows`-Tabelle
  - Alternative: bestehenden Agent-Builder in Form von Flowise (Apache 2.0) integrieren und in den xqt5-AI-Arbeitsplatz einbinden

- [ ] 🟠 **SharePoint RAG-Connector** — ~4–5 Tage
  - Verbindung zu Microsoft SharePoint via Microsoft Graph API (`/sites/{site}/drives/{drive}/items`)
  - Auth: OAuth 2.0 mit delegierten Berechtigungen (Nutzer wählt welche SharePoint-Sites/Ordner zugänglich sind)
  - Nutzer wählt explizit relevante SharePoint-Quellen pro Anwendungsfall — keine automatische Vollrepository-Indexierung
  - Ausgewählte Dokumente abgerufen, in bestehende RAG-Pipeline gechunkt und eingebettet (in `app_document_chunks` wie andere Dokumente gespeichert)
  - SharePoint-Berechtigungen werden respektiert: Access-Token-Scope begrenzt abrufbare Dateien
  - Admin: erlaubte SharePoint-Tenants konfigurieren; Nutzer: Quellen im Pool-Dokumenten-Manager durchsuchen und auswählen
  - Re-Sync auf Zeitplan oder on demand; `sharepoint_item_id` + `last_modified` für inkrementelle Updates verfolgen
  - Datei: neuer `sharepoint.py`-Connector, Integration in `documents.py`-Upload-Pipeline

### Governance & Compliance

- [ ] 🟡 **Admin-Feature-Toggles pro Nutzergruppe** — ~2 Tage
  - `app_group_settings`-Tabelle: `group_id`, `feature_key`, `enabled`
  - Features: web_search, file_upload, rag, pool_creation, model_selection

- [ ] 🟡 **PDF-Export / Konversations-Download** — ~1 Tag
  - Konversation als PDF (reportlab) oder JSON exportieren; Download-Button im Chat-Header
  - Enthält: Modell-Info, Zeitstempel, alle Nachrichten

- [ ] 🟡 **Auto-Lösch-Dateiaufbewahrungsrichtlinien** — ~1–2 Tage
  - `retention_days`-Feld bei Pools + globale Einstellung
  - Nächtliche APScheduler-Aufgabe löscht abgelaufene Dateien + Chunks; Admin-Konfigurations-UI

- [ ] 🟡 **Upload-Richtlinien-Konfiguration** (Dateitypen, Größenlimits) — ~1 Tag
  - Admin-konfigurierbar: erlaubte MIME-Typen, max. Dateigröße (MB), max. Dateien pro Pool

- [ ] 🟡 **Standard-Modell pro Nutzergruppe** — ~0,5 Tage
  - `default_model_id` in Gruppeneinstellungen speichern; als initiale Modellauswahl anwenden

- [ ] 🟡 **Tenant-Einschränkung** (nur spezifische Entra-Accounts) — ~0,5 Tage
  - Konfiguration: `ALLOWED_ENTRA_TENANT_IDS` (komma-getrennt); andere Tenant-Tokens beim Callback ablehnen

- [ ] 🟡 **PII-Bereinigung** (Presidio) — ~5–7 Tage
  - `presidio-analyzer` + `presidio-anonymizer` integrieren
  - PII aus ausgehenden LLM-Prompts bereinigen; Admin-Toggle pro Pool oder global

- [ ] 🟡 **Ollama Modelfile-Builder mit erweitertem `num_ctx`** *(rag-vrm `helpers/ollama_model_builder.py`-Pattern)*
  - Out-of-the-box laufen Ollama-Modelle mit Default `num_ctx` von 2k–8k — viel zu wenig für RAG mit 6k+ Token-Kontext. Aktuell muss Admin manuell auf dem Host `ollama create` ausführen
  - Admin-Button „Modell mit erweitertem Kontext anlegen": Backend ruft Ollama-API `POST /api/create` mit Modelfile-Content (`FROM <base>\nPARAMETER num_ctx <N>\nPARAMETER num_predict <M>`); neues Modell erscheint automatisch in Provider-Modell-Liste
  - Bei der Auswahl eines Ollama-Modells: VRAM-Sizing-Hinweis aus `model_info.size` anzeigen + Warnung wenn `chat_model + embedding_model` einen konfigurierbaren VRAM-Headroom überschreitet (rag-vrm `documentation/install_new_models.md` warnt explizit „account for the embedding model aswell")
  - Datei: `providers.py` (neuer `OllamaModelBuilder`-Service) + `AdminDashboard.jsx`-Sektion
  - **Aufwand:** Klein-Mittel | **Wert:** Mittel für Self-Hosted-Kunden

- [ ] 🟡 **Konfigurierbare Daten-Routing-Regeln** (Datentyp → Modell, BYOM / On-Prem-Routing)
  - Admin kann Regeln definieren: z.B. "wenn Dokumenttyp = Vertrag → nur lokale/On-Prem-Modelle erlauben"
  - Regeln in `app_routing_rules`-Tabelle gespeichert: `condition` (document_type, pool_id, group_id) + `allowed_model_ids[]`
  - In `llm.py` vor LLM-Call durchgesetzt; gibt 403 mit Nachricht zurück wenn Regel verletzt
  - **BYOM-Anwendungsfall:** Organisationen mit self-hosted Inferenz (Llama, Qwen via Ollama oder vLLM) können sensible Pools ausschließlich an lokale Endpunkte routen — custom base_url + API-Key bereits in `providers.py` unterstützt; diese Regel-Schicht macht das Routing automatisch und durchsetzbar statt manuell
  - Anwendungsfall: sensible/soziale Datenpools auf EU/lokale Modelle beschränkt; allgemeiner Chat erlaubt Cloud-Modelle

- [ ] 🟡 **Conditional Access / IP-Allowlist-Middleware**
  - Admin-konfigurierbare IP-Bereiche die auf die Plattform zugreifen dürfen
  - FastAPI-Middleware prüft `X-Forwarded-For` / `request.client.host` gegen Allowlist
  - Bei Blockierung: 403 mit "Access restricted to authorized networks" zurückgeben
  - Konfiguration: `ALLOWED_IP_RANGES` Env-Var (CIDR-Notation, komma-getrennt)
  - Außerdem: Entra ID Conditional Access Policies (in Token-Claims markiert) post-SSO respektieren

- [ ] 🟡 **Eigenständige MFA / TOTP** (ohne Entra ID)
  - TOTP-Einrichtung via QR-Code (`pyotp` + `qrcode`-Bibliotheken)
  - Admin kann MFA pro Nutzergruppe vorschreiben
  - Beim Login: wenn MFA aktiviert, zweiter Schritt vor JWT-Ausstellung
  - Hinweis: wenn Entra SSO implementiert, deckt Entras eigene MFA Enterprise-Nutzer ab; TOTP deckt lokale/Dev-Accounts ab
  - Datei: `auth.py`, neue `MFASetup.jsx`-Komponente

- [ ] 🟡 **Vollständiger Datenexport / Exit-Management**
  - Nutzer kann Export aller eigenen Daten anfordern: Konversationen, Dokumente, Einstellungen → ZIP-Datei
  - Admin kann vollständigen Tenant-Datenexport auslösen (alle Nutzer)
  - Exportiertes ZIP enthält: `chats.json`, `documents/`-Ordner, `settings.json`
  - Entspricht DSGVO Art. 20 (Datenportabilität) und Audit-Anforderungen
  - Datei: neuer `/api/export/me`-Endpunkt in `main.py`

- [ ] 🟢 **SIEM / strukturierter Log-Export**
  - Audit-Log um strukturierte Exportformate erweitern: CSV, JSON, Syslog (RFC 5424), CEF
  - Neuer Admin-Endpunkt: `GET /api/admin/audit/export?format=json&from=...&to=...`
  - Ermöglicht Integration mit Enterprise-SIEM-Systemen (Splunk, Microsoft Sentinel)
  - Datei: `audit.py`

- [ ] 🟢 **Anwendungs-Monitoring** (Prometheus + Grafana)
  - `prometheus-fastapi-instrumentator` für automatische Endpunkt-Metriken hinzufügen
  - `/metrics`-Endpunkt (admin-auth-geschützt) bereitstellen
  - Wichtige Metriken: Request-Latenz p50/p95, LLM-Call-Dauer, RAG-Retrieval-Zeit, Fehlerraten, aktive Nutzer
  - Optional: Grafana-Dashboard-Konfiguration als Code in `infra/`

- [ ] 🟢 **WCAG 2.1 Barrierefreiheit**
  - Systematischer Barrierefreiheits-Durchlauf aller UI-Komponenten
  - Kernanforderungen: Tastaturnavigation für alle interaktiven Elemente, ARIA-Labels bei Icon-only-Buttons, ausreichende Farbkontraste (4,5:1 für Text), sichtbare Fokusindikatoren, Screen-Reader-freundliche Semantik (`role`, `aria-live` für Streaming-Ausgabe)
  - Automatisierte Prüfungen: `axe-core` oder `eslint-plugin-jsx-a11y`
  - Hoher Aufwand (7+ Tage für vollständige Compliance), aber langfristig richtige Richtung für Enterprise-Produkt
  - Datei: alle `.jsx`-Komponenten; beginnen mit `MessageBubble.jsx`, `Sidebar.jsx`, `MessageInput.jsx`

- [ ] 🟢 **Self-hosted / austauschbare Vektordatenbank-Unterstützung**
  - Aktuell ist die RAG-Schicht fest an Supabase pgvector RPCs gekoppelt
  - Retrieval hinter `VectorStore`-Interface abstrahieren mit pgvector-Implementierung als Standard; alternative Backends (Qdrant, ChromaDB) für Kunden mit On-Prem-RAG-Bedarf erlauben
  - Minimum: Vektordatenbank-Verbindungsstring und RPC-Namen via Env-Vars konfigurierbar machen sodass self-hosted pgvector ohne Code-Änderungen funktioniert
  - Vollständige Abstraktion (Qdrant/ChromaDB-Support) ist großer Aufwand — nur bei konkreter Kundennachfrage nach On-Prem-RAG
  - Datei: `rag.py` (Retrieval-Aufrufe in dünne Adapter-Klasse extrahieren)

- [ ] 🟢 **BYOK — Bring-your-own-Key Verschlüsselungs-Support**
  - Aktuell werden Verschlüsselungsschlüssel (Fernet für gespeicherte API-Keys) intern verwaltet; Hosting-Provider-Festplattenverschlüsselung schützt ruhende Daten
  - BYOK erlaubt Kunden eigenen Verschlüsselungsschlüssel bereitzustellen, außerhalb des Hosting-Providers gehalten — die Plattform umhüllt alle ruhenden Secrets mit dem Kundenschlüssel vor dem Speichern
  - Implementierung: KMS-Integration (AWS KMS, Azure Key Vault oder HashiCorp Vault) als Key-Provider; Envelope-Encryption-Muster (Datenschlüssel mit Kunden-Master-Key verschlüsselt)
  - Hoher Aufwand und fügt betriebliche Komplexität hinzu; nur relevant für Organisationen mit strikten Key-Custody-Anforderungen
  - Datei: `encryption.py`

- [ ] 🟡 **SCIM 2.0 Nutzer-Provisionierung**
  - Automatisches Nutzer-Lifecycle-Management vom Enterprise IdP (Azure AD, Okta)
  - SCIM 2.0 Endpunkte: `POST /scim/v2/Users`, `PUT /scim/v2/Users/{id}`, `DELETE /scim/v2/Users/{id}`, `GET /scim/v2/Groups`
  - Wenn IdP einen Nutzer deaktiviert: Sessions werden widerrufen, JWT-Version inkrementiert
  - Ergänzt geplantes Entra SSO — SCIM übernimmt Provisionierung, OIDC übernimmt Authentifizierung
  - Referenz: Open WebUI hat vollständige SCIM 2.0-Implementierung als Referenz
  - Datei: neuer `scim.py`-Router

---

## Teil 4: RAG-Verbesserungen — Baseline-Code-Techniken

Das `basline-code/rag-vrm/`-Verzeichnis enthält ein C++-Codebase-RAG-System mit grundlegend anderer Architektur. Trotz Auslegung auf Code sind mehrere Techniken direkt auf Dokument-RAG anwendbar.

**Legende:** ✅ = bereits vorhanden | ❌ = nicht vorhanden | ➡️ = Anpassung nötig

| Technik | Latest | DRI | Aktion |
|---------|--------|-----|--------|
| Gewichtetes RRF (3 Signale) | ❌ gleiche Gewichte | ❌ gleiche Gewichte | **Übernehmen** — 4.1 |
| Payload-/Metadaten-Suche (3. Retrieval-Signal) | ❌ | ❌ | **Übernehmen** — 4.2 |
| Custom Reranking mit expliziten Boost-Signalen | ❌ | ❌ | **Anpassen** — 4.3 |
| BM25-Corpus-Caching (Redis, Hash-basiert) | ❌ | ❌ | **Anpassen** — 4.4 |
| Pro-Chunk-Symbol-/Keyword-Extraktion | ❌ | ❌ | **Übernehmen** — 4.5 / 4.6 |
| Datei-Typ-Dispatch → typspezifischer Parser + Chunker | ❌ | ❌ | **Übernehmen** — 4.6 |
| Content-Type-Heuristik-Erkennung (über Extension hinaus) | ❌ | ❌ | **Neu** — 4.6 |
| Code-Symbol-Extraktion (AST/Regex) pro Chunk | ❌ | ❌ | **Anpassen** — 4.6 |
| start_line / end_line pro Chunk | ❌ | ❌ | **Übernehmen** — 4.6 |
| Code-Symbol-Payload-Suche + Dateiname-Boost | ❌ | ❌ | **Anpassen** — 4.7 |
| Token-aware Embedding-Batch-Splitting | ✅ | ✅ | Überspringen — bereits vorhanden |
| Query-Intent-Erkennung | teilweise | ✅ 3-fach | Bereits im DRI |
| Gestaffeltes Fallback-Retrieval | teilweise | ✅ mehrstufig | Bereits im DRI |
| Tabellen-bewusstes Chunking | ❌ | ✅ | Bereits im DRI — über Teil 1 portiert |
| Heading-Breadcrumb-Injektion | ✅ | ✅ | Bereits vorhanden |

---

### 4.1 Gewichtetes RRF

**Was Baseline macht:** Drei unabhängige Signale mit unterschiedlichen Gewichten via RRF fusioniert:
```
rrf_score = vector_w/(k+rank_v) + bm25_w/(k+rank_b) + payload_w/(k+rank_p)
  vector_weight = 0.5, bm25_weight = 0.3, payload_weight = 0.2, k = 60
```

**Was xqt5 macht (beide Versionen):** Gleiches Gewicht `1/(k+rank+1)` über nur zwei Signale (Vektor + BM25).

- [ ] 🟠 **Gewichtetes RRF übernehmen** — von gleichen Gewichten auf `vector=0.6, BM25=0.25, payload=0.15` wechseln (Vektor leicht erhöht für Dokumentsemantik, BM25 leicht reduziert da deutsches FTS schwächer als englisches)
  - Datei: `rag.py` → `_reciprocal_rank_fusion()`
  - Die `k=60`-Konstante ist korrekt (aus originalem RRF-Paper); beibehalten
  - **Hinweis:** Reine Code-Änderung, kein Schema nötig

---

### 4.2 Payload-/Metadaten-Suche als drittes Retrieval-Signal

**Was Baseline macht:** Führt separate Exact-Match-Abfrage gegen indexierte Metadatenfelder (Entity-Namen, Dateinamen, Klassen-Arrays) vollständig parallel zu Vektor- und BM25-Suche aus, fusioniert dann alle drei Ergebnisse via RRF. Chunks in der Payload-Match-Liste erhalten ein dediziertes Score-Signal unabhängig von semantischer Ähnlichkeit.

**Was xqt5 macht:** Nur zwei Signale — Vektor + BM25 Volltext. Kein Metadaten-Vorfilter als Retrieval-Signal.

- [ ] 🟠 **Metadaten-Retrieval als drittes RRF-Signal hinzufügen** — für Dokumente sind die relevanten Payload-Felder:
  - `document_type` (Exact-Match: "Rechnung", "Protokoll", "Vertrag")
  - `section_heading` (Exact- oder Partial-Match gegen Anfrage)
  - `keywords`-Array (Top-TF-IDF-Terme, bei Upload-Zeit extrahiert, pro Chunk oder Dokument gespeichert)
  - Implementierung: neues Supabase RPC `payload_search_chunks(query_terms text[], doc_filter jsonb)` das Array-Overlap / ILIKE auf obige Spalten macht
  - Gibt Chunk-IDs + Boolean-Hit-Marker zurück; Gewicht 0.15 in RRF
  - **Erfordert:** neue Spalten `document_type varchar`, `keywords text[]` in `app_document_chunks` (oder `app_documents` joined)
  - **Hinweis:** Dies ist die dokumentenangepasste Version von baselines `_payload_search()`

- [ ] 🟡 **Metadaten als Pre-Filter VOR Vektor-Suche** *(zweites, sequenzielles Muster ergänzend zum RRF-Signal oben)*
  - Quelle: `articles/medium_rag.txt` Lösung 4. Zwei verschiedene Modi:
    - *Parallel (oben, RRF):* drei Listen, RRF-Fusion am Ende — Recall-orientiert
    - *Sequenziell (dieser Punkt):* erst harte Metadata-Bedingung (Datum-Range, doc_type, author), dann Suche im Rest — Latenz-orientiert, schneidet 80% des Korpus weg
  - **Wichtig:** `parse_document_filters()` in `rag.py:393` extrahiert bereits Filter-Hints aus Queries — wird aktuell nur für `fetch_filtered_document_ids` (Pre-Selection) genutzt. Diese sollten konsequent als WHERE-Clause direkt in `match_document_chunks` durchgereicht werden, nicht nur als Pre-Selection
  - Wenn Anfrage explizite Filter ergibt (Date-Range, Dokumenttyp aus Intent-Detection), als WHERE-Clause durchreichen → BM25/Vektor-Suche läuft auf 20% des Korpus, viel schneller und genauer
  - **Aufwand:** Klein (RPC-Update) | **Wert:** Hoch für Anfragen mit expliziten Datums-/Typ-Hinweisen

---

### 4.3 Custom Reranking mit expliziten Boost-Signalen

**Was Baseline macht:** Nach RRF-Fusion zweiten Reranker anwenden der explizite numerische Boosts zum Basis-Score addiert/subtrahiert. Boosts sind kumulativ, auf [0, 1] geclippt:
- Entity-Name-Exact-Match in Anfrage: +0.5
- Dateiname-Match: +0.4
- Chunk-Typ passt zu Anfrage-Intent: +0.3
- Anfrage-Term-Frequenz in Chunk-Text: bis +0.25
- Payload-Match-Flag: +0.15
- Länge-/Qualitätssignale: ±0.03–0.05

**Was xqt5 macht:** Kein Custom Reranking. Optionaler Cohere Cross-Encoder (`_apply_optional_rerank()`), aber das ist ein Remote-API-Call mit Latenz und Kosten.

- [ ] 🟡 **Leichtgewichtigen lokalen Reranker implementieren** — angepasste Boost-Signale für Dokument-RAG (kein Remote-API):
  - `+0.4` wenn Anfrage den `section_heading` des Chunks enthält (Breadcrumb-Match)
  - `+0.3` wenn `document_type` ein Typ-Schlüsselwort in der Anfrage matcht ("Protokoll", "Rechnung", "Vertrag", etc.)
  - `+0.2` wenn ein in der Anfrage genanntes Datum im Datumsbereich des Dokuments liegt
  - `+0.15` wenn Chunk aus einem Payload-Match-Ergebnis stammt (exakter Metadaten-Treffer)
  - `+0.05 pro Anfrage-Term` im Chunk-Text gefunden (auf +0.25 gedeckelt)
  - `-0.1` wenn Chunk sehr kurz ist (<80 Zeichen) und kein Tabellen- oder Überschriften-Chunk
  - Endpunktzahl: `max(0, min(rrf_score + boost, 1.0))`
  - Datei: neue `_rerank_chunks(chunks, query, intent)`-Funktion in `rag.py`
  - **Hinweis:** Das aktuelle Latest hat bereits optionales Cohere Cross-Encoder Reranking (`_apply_optional_rerank()`). Dieser lokale Reranker ist ein Zero-Latenz-Zero-Cost-Komplement — kein API-Key erforderlich, läuft in-process. Beide können koexistieren: lokaler Reranker zuerst, dann optionaler Cohere-Durchlauf auf den Top-N.
  - **Außerdem:** Recency- und Authority-Boost-Signale (Teil 5.7) sollten als zusätzliche Cases in diesem Reranker implementiert werden — nicht separat.
  - **Boost-Werte aus `app_settings` lesen — nicht hartcodieren** (rag-vrm `.env.prod`-Pattern). Setting-Schlüssel: `boost_section_heading`, `boost_doc_type`, `boost_date_in_range`, `boost_payload_match`, `boost_term_freq_max`, `boost_short_chunk_penalty`, `boost_filename_match`, `boost_recency`, `boost_authoritative`. Vorteil: A/B-Vergleich von Rankings ohne Deploy; Pro-Pool oder Pro-Mandant unterschiedliche Werte möglich (BYOM-Szenario aus Teil 3). Admin-UI-Sektion „Reranker-Tuning".

---

### 4.4 BM25-Corpus-Caching (Redis)

**Was Baseline macht:** Vor BM25-Score-Berechnung wird Corpus-Inhalt gehasht, Redis auf gecachtes tokenisiertes Corpus geprüft, nur tokenisiert bei Cache-Miss. TTL = 1 Stunde.

**Was xqt5 macht:** Verlässt sich auf PostgreSQL's eingebautes FTS (`ts_rank`, `tsvector`) das nicht im Anwendungsspeicher gecacht ist.

- [ ] 🟢 **BM25-Ergebnis-Caching in Redis** — gemergtes RRF-Ergebnis-Set cachen (nicht das tokenisierte Corpus, da pgvector BM25 via Postgres FTS verarbeitet), gehasht auf `sha256(query + scope_id + threshold)[:16]`:
  - Treffer im selben Konversations-Turn (z.B. Streaming-Retry) überspringen das vollständige Retrieval
  - TTL: 300 Sekunden (kurz, Konversationen ändern sich)
  - Nur cachen wenn Ergebnis-Set nicht leer
  - **Hinweis:** Niedrigere Priorität als Signal-/Reranking-Punkte oben; Postgres FTS ist bereits schnell

---

### 4.5 Pro-Chunk-Keyword-Extraktion (für Payload-Suche)

**Was Baseline macht:** Extrahiert `called_functions` aus jedem Chunk einzeln (nicht auf Datei-Ebene) via Regex, speichert dann als Array in Chunk-Metadaten. Dies treibt das Payload-Suche-Signal an.

**Dokument-Äquivalent:** Top-Keywords (TF-IDF-gewichtet) aus jedem Chunk bei Indexierungszeit extrahieren.

- [ ] 🟡 **`keywords[]` pro Chunk extrahieren und speichern** bei Upload-/Chunking-Zeit:
  - TF-IDF für Tokens im Chunk relativ zum vollständigen Dokument berechnen (Chunk-TF × inverse Dokument-Frequenz)
  - Top-10-Keywords als `keywords text[]` in `app_document_chunks` speichern
  - Verwendet von: Payload-Suche (4.2 oben), Reranker-Term-Matching (4.3 oben)
  - Bibliothek: `sklearn.feature_extraction.text.TfidfVectorizer` oder einfacher Token-Frequenz-Zähler
  - Deutsche Stopwort-Liste nötig (NLTK hat eine, oder `spacy` de_core_news_sm verwenden)
  - **Schema:** `ALTER TABLE app_document_chunks ADD COLUMN keywords text[] DEFAULT '{}';`
  - Außerdem GIN-Index erstellen: `CREATE INDEX ON app_document_chunks USING GIN (keywords);`

---

### 4.6 Content-Type-Erkennung + Adaptive Upload-Strategie

**Was Baseline macht:** Der Indexer routet jede Datei zu einem komplett anderen Parser und Chunker basierend auf Dateiextension: C++-Dateien → syntax-bewusster LangChain CPP Splitter mit Entity-Extraktion; Config-Dateien (.json/.yaml/.xml) → Config-Parser; Skripte (.py/.sh) → Skript-Parser mit Funktionsanzahl; Docs (.md/.txt) → generischer Prose-Chunker. Jede Route erzeugt unterschiedliche Chunk-Metadaten angepasst an den Content-Typ.

**Was xqt5 macht:** Alle hochgeladenen Dateien durchlaufen unabhängig vom Inhalt die gleiche Pipeline — PDFs via Mistral OCR, Textdateien via direktes Lesen, dann der gleiche Heading/Satz-Grenz-Chunker für alles. Eine `.py`-Datei und ein Policy-Dokument erhalten identische Behandlung.

- [ ] 🟠 **Content-Type bei Upload erkennen** — `detect_content_type(filename, file_bytes) -> str`
  - **Erster Durchlauf Extension-basiert** (schnell, ~90% genau):
    - `.py` → `code_python`
    - `.js`, `.ts`, `.jsx`, `.tsx` → `code_javascript`
    - `.sql` → `code_sql`
    - `.c`, `.cpp`, `.java`, `.go`, `.rs`, `.cs` → `code_generic`
    - `.json` → `config_json`
    - `.yaml`, `.yml` → `config_yaml`
    - `.xml` → `config_xml`
    - `.md` → `markdown`
    - `.csv` → `data_csv` (bereits in Teil 2 geplant)
    - `.xlsx`, `.xls` → `data_excel` (bereits in Teil 2 geplant)
    - `.pdf`, `.docx`, `.png`, `.jpg` → `structured_doc` (aktuelle OCR-Pipeline)
    - `.txt` und unbekannt → weiter zu Inhalts-Heuristik
  - **Inhalts-Heuristik für mehrdeutige Dateien** (für `.txt`, keine Extension oder Overrides):
    - Erste 500 Bytes beginnen mit `{` oder `[` → `config_json`
    - Erste Zeile ist `---` oder hat dominantes `key: value`-Muster → `config_yaml`
    - Hat `def `, `import `, `class ` + Python-Einrückung → `code_python`
    - Hat `` ``` `` fenced Code-Blöcke → `mixed_prose_code`
    - Hat `|`-Tabellenzeilen (> 3 Zeilen passend zu `^\s*\|`) → `markdown`
    - Hat `function `, `const `, `let `, `=>` → `code_javascript`
    - Sonst → `prose`
  - Erkannten Typ als `content_type varchar` in `app_documents` speichern
  - **Schema:** `ALTER TABLE app_documents ADD COLUMN content_type varchar DEFAULT 'prose';`
  - Datei: `documents.py` → neue `detect_content_type()`-Funktion; bei Upload vor OCR/Chunking aufgerufen

- [ ] 🟠 **Zu typspezifischer Chunking-Strategie routen** — basierend auf `content_type`:
  - **`prose` / `structured_doc`:** aktuelle Pipeline (Heading-Boundary + Satz-Splitter) — keine Änderung
  - **`markdown`:** Heading-Boundary-Chunking (bereits gut) + Fenced-Code-Blöcke als atomare Einheiten behandeln (gleiches Mechanismus wie tabellen-bewusstes Chunking aber für `` ``` ``-Begrenzer)
  - **`code_python` / `code_javascript` / `code_generic` / `code_sql`:** `RecursiveCharacterTextSplitter.from_language()` aus LangChain mit passendem `Language`-Enum verwenden — teilt an Funktions-/Klassen-/Methoden-Grenzen, nicht Satz-Grenzen; erhält semantische Einheiten in Code
    - LangChain `Language.PYTHON`, `Language.JS`, `Language.SQL`, `Language.CPP` etc.
    - Kein OCR-Schritt — Datei direkt als UTF-8-Text lesen
    - Overlap zwischen Chunks: 1–2 Funktions-Signaturen (damit Aufrufer-Chunk immer die referenzierte Signatur sieht)
  - **`config_json` / `config_yaml` / `config_xml`:** als einzelnen atomaren Chunk speichern wenn ≤ 2000 Tokens; bei größeren Configs nur an Top-Level-Keys aufteilen — niemals mitten in einem Key
  - **`data_csv`:** Zeilen-Level-Chunking mit Spalten-Überschriften in jedem Chunk wiederholt (gleiches Prinzip wie Tabellen-Fortsetzung, bereits in Teil 2 geplant)
  - Datei: `documents.py` → `_chunk_by_content_type()`-Dispatcher

- [ ] 🟠 **Code-Symbole pro Chunk extrahieren** — für `content_type` in `{code_python, code_javascript, code_sql, code_generic}`:
  - **Python:** `ast.parse()` verwenden um Funktionsnamen, Klassennamen, importierte Modulnamen aus jedem Chunk zu extrahieren — weit genauer als TF-IDF-Keywords für Code
  - **JS/TS:** Regex für `function\s+(\w+)`, `class\s+(\w+)`, `const\s+(\w+)\s*=\s*(async\s*)?(function|\()`
  - **SQL:** Regex für Tabellennamen aus `FROM`, `JOIN`, `INTO`, `UPDATE`, `CREATE TABLE`; Operationstyp (`SELECT`/`INSERT`/`UPDATE`/`DELETE`/`CREATE`)
  - **Generischer Code:** Funktionsaufruf-Extraktion (gleiches Muster wie baselines `extract_called_functions`)
  - Als `symbols text[]` in `app_document_chunks` speichern — getrennt von `keywords[]` (TF-IDF für Prose)
  - **Schema:** `ALTER TABLE app_document_chunks ADD COLUMN symbols text[] DEFAULT '{}';`
    `CREATE INDEX ON app_document_chunks USING GIN (symbols);`
  - Datei: `documents.py` → `_extract_code_symbols(content, content_type) -> List[str]`

- [ ] 🟠 **`start_line` / `end_line` pro Chunk speichern** — für alle Content-Typen:
  - Baseline verfolgt exakte Zeilenbereiche für jeden Chunk. xqt5 verfolgt aktuell `page_number` für PDF-Chunks aber nichts für Text-/Code-Dateien
  - `start_line int` und `end_line int` zu `app_document_chunks` hinzufügen ermöglicht: präzise Zitierungen ("Zeile 42–67 von auth.py"), Jump-to-Source-Links im Frontend, Debugging von Chunking-Qualität
  - Für PDFs: aus bereits verfolgten `<!-- page:N -->`-Markern ableiten
  - Für Text/Code: direkt beim Chunking verfolgen
  - **Schema:** `ALTER TABLE app_document_chunks ADD COLUMN start_line int, ADD COLUMN end_line int;`

---

### 4.7 Code-Symbol-Payload-Suche (erweitert 4.2 + 4.6)

**Was Baseline macht:** Payload-Suche auf `entity_name`, `all_functions`, `all_classes` gibt starkes Exact-Match-Signal wenn eine Anfrage einen spezifischen Funktions- oder Klassennamen nennt. Dies ist der leistungsstärkste Anwendungsfall der Payload-Suche.

**Was xqt5 durch 4.6 gewinnt:** Sobald `symbols[]` pro Chunk existiert (aus 4.6 oben), erschließen Code-Dateien die gleiche Fähigkeit.

- [ ] 🟡 **Payload-Suche RPC um `symbols[]` erweitern** — wenn `content_type` ein Code-Typ ist:
  - `symbols` zu den Suchzielen des `payload_search_chunks`-RPCs hinzufügen (neben `keywords[]`)
  - Boost-Gewicht in RRF: Code-Symbol-Exact-Match → gleiches Gewicht wie `keywords`-Payload-Signal (0.15)
  - Im Reranker (4.3): `+0.5` hinzufügen wenn ein `symbols[]`-Eintrag wörtlich in der Anfrage vorkommt (höchster Boost — Code-Symbol-Exact-Match ist sehr starkes Signal, äquivalent zu baselines entity_name-Boost)
  - Datei: Supabase RPC Update + `rag.py` → `_payload_search_chunks()`

- [ ] 🟡 **Dateiname als Retrieval-Signal für Code-Dateien** — Baseline boosted Chunks aus Dateien deren Name Anfrage-Terme matcht (z.B. Anfrage "authentication" trifft `auth.py` mit `+0.4`):
  - Im Reranker (4.3): `+0.35` hinzufügen wenn `app_documents.filename` (ohne Extension, kleingeschrieben) ein Teilstring der Anfrage ist oder umgekehrt
  - Content-Typ-unabhängig — funktioniert für jeden Dateityp aber ist am nützlichsten für Code
  - Kein Schema-Change nötig — `filename` bereits in `app_documents` gespeichert

---

### 4.8 Code-Tools & Datei-Rekonstruktion (Baseline `agentic_rag/tools/`)

**Quelle:** `basline-code/rag-vrm/agentic_rag/tools/handlers/` und `tools/core/file_assembly.py`

Baseline exponiert spezialisierte Code-Retrieval-Endpunkte (`find_usages`, `get_inheritance_tree`, `trace_call_flow`, `grep_code`, `resolve_stack_trace`, `analyze_file`, `git_history`, `search_code`) als MCP-Tools. xqt5 plant durch Teil 4.6/4.7 die nötigen Daten (`symbols[]`, `start_line`/`end_line`, `content_type`) — diese Endpunkte hebeln sie als agentische Werkzeuge.

- [ ] 🟡 **Code-aware MCP-Tools** — agentische Retrieval-Endpunkte über `app_document_chunks`:
  - `find_usages(symbol)` — alle Chunks mit Symbol in `symbols[]`
  - `get_definition(symbol)` — Chunk mit Symbol in `chunk_type=function|class`
  - `grep_code(pattern, file_pattern)` — Regex-Suche über `content` (PostgreSQL `~`)
  - `resolve_stack_trace(trace)` — Frame für Frame zu Datei:Zeile auflösen
  - Hängt ab von: Teil 4.6 (`symbols[]`, `start_line`/`end_line`) und Teil 3 MCP-Server
  - Datei: neue `backend/app/code_tools.py` + MCP-Tool-Definitionen
  - **Mehrwert:** wandelt RAG-Daten in agentische Werkzeuge — Modell kann gezielt Code-Strukturen abfragen statt nur semantische Suche

- [ ] 🟡 **`file_assembly` — Chunk-Rekonstruktions-Endpunkt** — `GET /api/documents/{id}/reconstruct?start_line=42&end_line=67`
  - Aus den Chunks eines Dokuments einen geordneten, deduplizierten Slice zusammensetzen (Baseline: `tools/core/file_assembly.py`)
  - Verwendung: Inline-Quellvorschau im Frontend, "Jump-to-Source"-Link aus Zitierung, präzise Kontext-Vergrößerung in Antworten
  - Hängt ab von: Teil 4.6 (`start_line`/`end_line` pro Chunk)
  - Datei: neuer Endpunkt in `documents.py` + Vorschau-Integration in `SourceDisplay.jsx`

- [ ] 🟡 **Automatischer `grep_code`-Fallback bei leerem Retrieval** *(rag-vrm `FALLBACK_TO_GREP=1`-Pattern)*
  - Quelle: `basline-code/rag-vrm/documentation/info_other_rags` argumentiert „grep works ~99% of the time when used well". xqt5 4.8 plant `grep_code` als MCP-Tool, aber NUR für Code-Dokumente und über Chunks
  - Der **automatische Fallback-Pfad** für *alle* Dokumente fehlt: Wenn `apply_relevance_gate()` (bereits in IMPLEMENTIERT) alle Chunks verwirft → PostgreSQL `~`/`ILIKE` über `app_document_chunks.content` mit den 2–3 Hauptbegriffen aus der Anfrage. Liefert mindestens *etwas* statt „kein Treffer"
  - Konfiguration: `RAG_FALLBACK_TO_KEYWORD_SEARCH: bool` in `app_settings`
  - Datei: `rag.py` (`build_rag_context` Fallback-Zweig)
  - **Aufwand:** Mittel | **Wert:** Mittel-Hoch — verhindert „leere"-RAG-Antworten

- [ ] 🟢 **Pre-Ingestion-Filetype-Analyzer** — Vor-Index-Endpunkt der hochgeladene Dateien (oder Repos) scannt und Verteilung erkannter `content_type` + gewählter Chunking-Strategie meldet, bevor verarbeitet wird
  - Ermöglicht Admin-Bestätigung vor langen Verarbeitungsläufen großer Sammlungen
  - Dünner Wrapper um `detect_content_type()` aus Teil 4.6
  - Datei: neuer Endpunkt in `documents.py`, Vorschau-Anzeige in `FileUpload.jsx`

---

## Teil 5: RAG-Verbesserungen — Artikel-Best-Practices

Folgende Punkte kommen direkt aus den Artikeln in `/articles/` und sind noch nicht im bestehenden Plan oder Code abgedeckt.

---

### 5.1 Chunking: Figur+Beschriftung-Kohäsion

**Quelle:** `chatgpt_ocr_pipeline_recommendations.txt` Schritt 5

- [ ] 🟠 **Figur + Beschriftung als einzelne atomare Chunk-Einheit beibehalten**
  - Wenn Docling eine Figur gefolgt von einem Beschriftungs-Absatz extrahiert, als eine Einheit behandeln — nicht dazwischen aufteilen
  - Ähnlich: Tabelle + unmittelbar vorhergehender/nachfolgender Titel-Absatz sollten zusammenbleiben
  - Implementierung: in der OCR-Abstraktionsschicht (Phase 2), Elemente mit `element_type` taggen (figure, caption, table, table_title); Chunker prüft Figur→Beschriftung-Nachbarschaft vor Aufteilung
  - Dies ist das Dokumentenäquivalent von baselines `entity_name`-Kohäsion für Code-Blöcke

---

### 5.2 Docling HierarchicalChunker als Drop-In-Alternative

**Quelle:** `medium_ocr.txt` Stufe 2

- [ ] 🟡 **Docling's HierarchicalChunker evaluieren** bei Docling-Integration (Phase 2)
  - `HierarchicalChunker` aus `docling_core.transforms.chunker` respektiert H1/H2/H3-Grenzen, Absatzumbrüche und Listenstrukturen nativ
  - Jeder Chunk trägt Docling-Provenienz: Seitenzahl, Überschriftspfad, Bounding Box
  - Wenn es den Custom-Chunker ersetzt: bessere Überschriften-Metadaten, Provenienz-basierte Seitenzahlen (kein `<!-- page:N -->`-Parsing nötig), Formel-/Tabellen-Bewusstsein eingebaut
  - Abwägung: verliert deutsche Satz-Grenz-Logik und Custom-Tabellen-Fortsetzungs-Header-Logik aus Phase 5.1
  - **Empfehlung:** HierarchicalChunker als Basis verwenden; Ausgabe nachverarbeiten um hinzuzufügen: Tabellen-Fortsetzungs-Headers (5.1), Kontextuelles-Retrieval-Prefix (4.2) und Breadcrumb-Injektion

- [ ] 🟠 **Bounding-Box pro Chunk speichern** *(kommt fast frei mit Docling)*
  - Docling-Provenance enthält **Seitenzahl + Heading-Pfad + Bounding-Box** pro Element. xqt5 speichert aktuell nur `page_number` und `section_path` — die Bounding-Box ist neu
  - Schema: `ALTER TABLE app_document_chunks ADD COLUMN bbox jsonb;` (`{x0, y0, x1, y1, page}`)
  - **Frontend-Hebel:** „Highlight-in-PDF"-Quellvorschau möglich, die das exakte Snippet im Original-PDF visuell hervorhebt — derzeit unmöglich. Wichtiges Vertrauenssignal für Enterprise-Akzeptanz
  - Ergänzt das geplante `file_assembly`-Endpunkt (Teil 4.8) und Inline-Zitierungen (Teil 2)
  - Quelle: `articles/medium_ocr.txt`, bestätigt durch `ocr-benchmark/pipeline/models.py:provenance.bbox`
  - **Aufwand:** Klein (kommt frei mit Docling) | **Wert:** Hoch für UX

---

### 5.3 Dynamischer Vision-Prompt pro Bildtyp

**Quelle:** `medium_ocr.txt` (VisionRagParser Standard-Prompt + Verbesserungs-Abschnitt)

- [ ] 🟡 **Bildtyp-bewusstes Vision-Prompting implementieren**
  - Strukturierten Prompt mit bedingten Abschnitten verwenden:
    ```
    If CHART/GRAPH: State title + subtitle, key insights sufficient to answer any question
    If DIAGRAM/INFOGRAPHIC: Interpretation + key insights
    If PHOTOGRAPH: Brief description only
    Format: [Type]: [Title]\n- Key insight 1\n- Key insight 2
    ```
  - Erster Durchlauf: VLM nach Bildtyp klassifizieren lassen, dann typspezifischen Follow-up-Prompt verwenden
  - Oder: einzelner Prompt mit bedingten Format-Anweisungen (einfacher, geringere Kosten)
  - Admin-konfigurierbarer `vision_interpretation_prompt` bereits geplant — standardmäßig zu diesem strukturierten Prompt

- [ ] 🟡 **Vision-Inferenz für Low-Value-Bilder überspringen**
  - Vor VLM-Sendung schnelle Größen-/Seitenverhältnis-Heuristik ausführen: Bilder < 50×50px oder mit Seitenverhältnis typisch für Logos (sehr breit und kurz oder kleine Quadrate) können übersprungen werden
  - **Konkrete Größen-Schwelle aus `ocr-benchmark/pipeline/image_handler.py`:** Default `vision_skip_below_kb: float = 15.0` als Admin-Setting; Bilder unter 15 KB überspringen
  - Alternativ: erster VLM-Call klassifiziert als "Logo/Dekorativ" → aufwändigen Interpretations-Call überspringen
  - Spart Kosten und vermeidet Verschmutzung von Chunks mit Logo-Beschreibungen
  - Verzahnt mit VLM-Cache (siehe „Dedup & Cache-Disziplin"-Sektion oben) und Bild-Hash-Dedup

- [ ] 🟡 **Zwei separate VLM-Calls pro Figur — Text-Extraktion getrennt von Beschreibung**
  - Quelle: `ocr-benchmark/pipeline/prompts.py` strikte Trennung `FIGURE_TEXT_PROMPT` (Suite B, „Extract ALL readable text … verbatim") und `FIGURE_DESCRIBE_PROMPT` (Suite C, „describe each visual element"); beide Modi haben unterschiedliche Anforderungen, ein einziger Prompt verwässert beide
  - Bei Klassifikation `text_document` / `mixed` / `table_image` → nur Text-Extract (1 Call)
  - Bei `chart` / `diagram` / `logo` / `photograph` → Description (1 Call). Bei `mixed` zusätzlich Text-Extract (2 Calls)
  - Folge fürs `OCRResult`-Schema: `embedded_text` und `image_description` als zwei separate Felder (siehe Phase 2 oben)
  - **Aufwand:** Klein | **Wert:** Hoch — hebt Mistral-Suite-B-Score laut Benchmark von 60% auf erwartet >90% (Nanonets liefert 100%)

- [ ] 🟡 **Mehrseitige Figur-Interpretationen zusammenführen**
  - Wenn Docling erkennt dass eine Figur oder Tabelle sich über Seitengrenzen erstreckt (gleiche `figure_id` oder passende Beschriftung), Interpretationen vor Chunk-Embedding zu einem kohärenten Block zusammenführen
  - Verhindert: "Fortsetzung von voriger Seite"-Beschreibungen ohne Kontext
  - Docling-Provenienz enthält Bounding Box und Seite; damit Fortsetzungskandidaten erkennen

---

### 5.4 Formel-Extraktion via Docling

**Quelle:** `medium_ocr.txt` (VisionRagParser-Konstruktor)

- [ ] 🟡 **Formel-Anreicherung in Docling-Pipeline aktivieren**
  - `do_formula_enrichment=True` in `DocumentConverter`-Pipeline-Kwargs setzen
  - Relevant für: technische Berichte, wissenschaftliche Paper, finanzielle Formeln
  - Formeln werden durchsuchbarer Text statt verzerrter OCR-Ausgabe
  - Geringer Aufwand sobald Docling integriert (einzelnes Boolean-Flag); in `OCRResult`-Schema als `has_formulas: bool` einschließen

---

### 5.5 Themenverschiebungs-Erkennung für adaptive Chunk-Grenzen

**Quelle:** `medium_rag.txt` Lösung 3 — Adaptives Chunking

- [ ] 🟡 **Themenverschiebungs-Erkennung innerhalb langer Abschnitte**
  - Für Abschnitte die ~800 Tokens überschreiten (weit über Chunk-Größe), zusätzlichen Split-Durchlauf ausführen:
    1. Satz-Level-Embeddings für den Abschnitt generieren (schnell, lokal, z.B. `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`)
    2. Kosinus-Ähnlichkeit zwischen aufeinanderfolgenden Sätzen berechnen
    3. Positionen wo Ähnlichkeit unter Schwellenwert fällt (z.B. < 0.4) als Kandidaten-Split-Punkte markieren
    4. Sub-Chunks an diesen Grenzen erstellen
  - Verschieden von Überschriften-basiertem Splitting — erfasst Themenverschiebungen innerhalb eines einzelnen Überschriften-Abschnitts
  - **Kosten:** erfordert lokales Satz-Embedding-Modell; kann dasselbe bereits konfigurierte Embedding-Modell verwenden, das aber zu groß für Satz-Level-Inferenz sein kann. Alternative: leichtgewichtiges lokales Modell nur für Grenz-Erkennung
  - **Deutsch-Support:** `paraphrase-multilingual-MiniLM-L12-v2` unterstützt Deutsch nativ

---

### 5.6 Vorheriger/nächster Chunk-Kontext in jedem Chunk

**Quelle:** `medium_rag.txt` Lösung 3 — Kontext-Erhaltung

- [ ] 🟡 **Vorherige/nächste Chunk-Vorschau bei Indexierungszeit einbetten**
  - Nach Chunking, Chunk-Liste nachverarbeiten: für jeden Chunk 1-Satz-Zusammenfassung des vorherigen Chunks voranstellen und 1-Satz-Vorschau des nächsten Chunks anhängen
  - Format:
    ```
    [Vorheriger Abschnitt: {prev_summary}]
    {chunk_content}
    [Nächster Abschnitt: {next_preview}]
    ```
  - `prev_summary` / `next_preview`: erster Satz des benachbarten Chunks (kein LLM-Call nötig, nur Text-Extraktion)
  - **Abwägung:** erhöht Chunk-Token-Anzahl um ~30–50 Tokens pro Chunk; erhöht Embedding-Kosten leicht
  - **Vorteil:** Retrieval eines isolierten Chunks hat immer richtungsbezogenen Kontext, auch ohne Nachbar-Anreicherung
  - Ergänzt Phase 5.3 (Nachbar-Anreicherung) statt sie zu ersetzen

- [ ] 🟡 **Thematische Cross-Chunk-Beziehungs-Links (`related_chunk_ids[]`)** *(thematisch statt sequenziell)*
  - Quelle: `articles/medium_rag.txt`. Aktuell hat xqt5 nur `chunk_index ± 1`-Nachbarn (Phase 5.3) — sequenziell, nicht thematisch
  - Bei Indexierung pro Chunk Top-3 ähnlichste Chunks im *gleichen Dokument* via Kosinus berechnen (kostet nur Embeddings die schon vorhanden sind), als `related_chunk_ids uuid[]` speichern
  - Bei Retrieval optional 1–2 Top-Related-Chunks pro Top-Treffer mitziehen (analog `enrich_with_neighbors()` in `rag.py:1125`, aber thematisch)
  - Schema: `ALTER TABLE app_document_chunks ADD COLUMN related_chunk_ids uuid[] DEFAULT '{}';`
  - **Aufwand:** Klein-Mittel | **Wert:** Mittel — fängt Querbezüge in langen Dokumenten ab, die `chunk_index ± 1` verfehlt

---

### 5.6.1 Multi-Modal Retrieval als drittes paralleles Signal

**Quelle:** `articles/chatgpt_ocr_pipeline_recommendations.txt` Schritt 8

- [ ] 🟡 **Image-Retrieval immer parallel zu Text/Tabellen-Retrieval ausführen** (Multi-Modal RRF)
  - Aktuell: `search_similar_assets()` in `rag.py:1032` existiert, wird aber nur bedingt eingehängt (`should_use_image_retrieval` Gate in `rag.py:564`)
  - Multi-Modal-Retrieval als drittes RRF-Signal für Asset-Treffer (komplementär oder kombiniert mit „Payload-Suche als drittes RRF-Signal" Teil 4.2 — beide nutzen denselben RRF-Slot je nach Anfrage-Intent)
  - Setting: `image_retrieval_strategy: "never" | "on_demand" | "always"` in `app_settings`
  - **Aufwand:** Klein-Mittel | **Wert:** Mittel für bilderlastige Dokumente

---

### 5.7 Aktualitäts- und Autoritäts-Scoring-Signale

**Quelle:** `medium_rag.txt` Lösung 4 — Intelligente Fusion

- [ ] 🟡 **Aktualitäts-Bonus im Reranker** (+10% für aktuelle Dokumente)
  - Wenn `app_documents.created_at` (oder extrahiertes `document_date`) innerhalb der letzten 90 Tage → +0.10 Boost im Reranker anwenden
  - Konfigurierbar: Admin-Toggle + Aktualitätsfenster (Tage) + Boost-Größe
  - Begründung: für Anfragen ohne expliziten Datums-Kontext sind neuere Dokumente generell relevanter für Policy-/Verfahrens-Docs

- [ ] 🟡 **Autoritäts-/Quell-Bonus** (+15% für offizielle/autoritative Dokumente)
  - Pool-Admins können Dokumente als "autoritativ" taggen (z.B. offizielle Richtlinie, unterzeichneter Vertrag, finale Version)
  - Neue Spalte: `app_documents.is_authoritative bool DEFAULT false`
  - +0.15 Boost im Reranker für autoritative Dokumente anwenden
  - Admin-/Pool-Owner-UI: Checkbox beim Dokument-Upload oder in Dokumentenliste

- [ ] 🟡 **Datengetriebene Chunk-Confidence aus Near-Duplicate-Detection** *(komplementär zu `is_authoritative` oben)*
  - GraphRAG-Idee aus `articles/medium_rag.txt` Lösung 5: Wenn dieselbe Aussage (sehr ähnlicher Text-Hash, near-duplicate) in mehreren Dokumenten auftaucht, gewinnt sie an Vertrauen — datengetrieben statt manuell vergeben
  - Schema: `app_document_chunks.confidence_score float DEFAULT 0.5`
  - Beim Indexieren MinHash/LSH-Detect für near-duplicates über alle Chunks im Pool (`datasketch`-Lib); bestätigte Chunks bekommen Boost
  - Im Reranker (4.3): zusätzliches Boost-Signal `+0.05 * (confidence_score - 0.5)` einbauen
  - Verschieden vom `is_authoritative`-Flag (manuell, oben) — Confidence ist datengetrieben/automatisch; beide Signale koexistieren

---

### 5.8 Retrieval-Qualitätsmetriken / Evaluierungs-Framework

**Quelle:** `medium_rag.txt` — Erfolgsmetriken-Abschnitt

- [ ] 🟢 **Retrieval-Evaluierungs-Endpunkt hinzufügen** (nur Dev/Admin)
  - Neuer Admin-Endpunkt `POST /api/admin/rag/evaluate` der akzeptiert: `query`, `expected_document_ids[]`, `expected_chunk_ids[]`
  - Gibt zurück: Precision@5, Recall@10, MRR (Mean Reciprocal Rank), NDCG
  - Precision@5: Anteil der Top-5 abgerufenen Chunks die im erwarteten Set sind
  - Recall@10: Anteil der erwarteten Chunks die in Top-10-Ergebnissen gefunden werden
  - MRR: `1 / rank_of_first_relevant_result`
  - NDCG: Normalized Discounted Cumulative Gain (berücksichtigt Ranking-Position)
  - Anwendungsfall: Vorher-/Nachher-Vergleich beim Testen von RAG-Parameter-Änderungen

- [ ] 🟢 **RAG-Qualitäts-Dashboard im Admin-Panel**
  - `max_similarity`, `chunk_count_returned`, `gate_passed` (bool) für jeden RAG-Call zu `app_audit_log` loggen
  - Admin-Chart: durchschnittliche Ähnlichkeitswerte über Zeit, Gate-Ablehnungsrate, Top-Anfragen mit niedriger Ähnlichkeit
  - Hilft `RAG_RELEVANCE_GATE`-Schwellenwert ohne Raten zu tunen

- [ ] 🟠 **OCR-Regressionstest-Harness aus `ocr-benchmark/scorers.py`** *(direkt portierbar — pure Python + rapidfuzz)*
  - **Motivation:** Mistral-OCR hat sich laut `ocr-benchmark/CLAUDE.md` nachweislich von `mistral-ocr-2505` auf `mistral-ocr-2512` verschlechtert. Ohne Harness merkt es niemand
  - Verzeichnis `backend/tests/ocr_regression/` mit Benchmark-PDFs und Ground-Truth-JSONs anlegen (Vorlage: `ocr-benchmark/eval/ground_truth.json`)
  - **Vier-Suite-Score** (`scorers.py` direkt importierbar):
    - Suite A (Text, Gewicht 2.0, Schwelle 95)
    - Suite B (Embedded Text in Figures, 2.0, 85)
    - Suite C (Figure Description Keyword Groups, 1.0, 80)
    - Suite D (Tables, 1.5, 90)
  - Ausführbar als pytest-Marker `@pytest.mark.ocr_regression` — läuft nur on-demand (kostet Tokens)
  - **CI-Variante:** Stub-OCR-Adapter mit aufgezeichneten Responses aus `eval/results/<model>/raw_data.json` (das `--rerender`-Pattern) — Tests laufen offline
  - Optional: Multi-Run-Konsistenzmessung wie `scorers.py:compute_run_stats()` — Alarm wenn `std > 0.05` (entdeckt nicht-deterministische Cloud-Endpoints)
  - **Aufwand:** Mittel (1–2 Tage) | **Wert:** Sehr hoch — verhindert stille Regression bei Provider-Versionswechseln

---

### 5.9 Mehrsprachiges Embedding-Modell-Evaluation

**Quelle:** `chatgpt_ocr_pipeline_recommendations.txt` Schritt 6

- [ ] 🟢 **bge-m3 oder E5-Mistral als Embedding-Modell evaluieren**
  - `bge-m3`: unterstützt 100+ Sprachen inklusive Deutsch, verarbeitet bis 8192 Tokens pro Eingabe, Open-Source (BAAI), kann self-hosted betrieben werden
  - `E5-Mistral-7B-Instruct`: state-of-the-art mehrsprachige Embeddings, deutlich größer aber höchste Qualität
  - Aktuell `text-embedding-3-small`: 8191 Token-Limit, gutes Englisch, akzeptables Deutsch
  - **Test:** Set deutscher Dokument-Chunks mit jedem Modell einbetten, Standard-Retrieval-Anfragen ausführen, Precision@5 vergleichen
  - **Deployment-Überlegung:** bge-m3 kann via Ollama oder HuggingFace Inference API laufen; keine neue Infrastruktur wenn diese bereits genutzt werden
  - **Bei Wechsel:** alle bestehenden Chunks müssen neu eingebettet werden (vollständige Re-Indexierung); Migrationsfenster planen

---

## Teil 6: Aktuelle Best Practices & Plattform-Features

Quellen: Web-Recherche zu RAG Best Practices 2025/2026, Open WebUI Feature-Set, Enterprise AI Platform Requirements, LLM Observability und AI Security Standards.

---

### 6.1 RAG — Neue Techniken

- [ ] 🟠 **Corrective RAG (CRAG)**
  - Nach Retrieval bewertet ein leichtgewichtiger Assessor die gesamte Chunk-Qualität vor dem LLM-Senden
  - Wenn Qualität unter Schwellenwert (z.B. alle Chunks < 0.5 Ähnlichkeit): Fallback auslösen — entweder Web-Suche (wenn aktiviert) oder Query-Reformulierungs-Schleife (ein Rewrite + Re-Retrieve)
  - Verschieden vom Relevanzfilter (Phase 1.1 — der nur ein-/ausschaltet): CRAG versucht aktiv Retrieval zu *verbessern* wenn es fehlschlägt
  - Neue Funktion: `_assess_retrieval_quality(chunks, query) -> float` in `rag.py`
  - Neue Funktion: `_corrective_retrieve(query, failed_chunks) -> list` — schreibt Anfrage um und wiederholt
  - Konfiguration: `corrective_rag_enabled: bool` (Standard: false), `corrective_rag_threshold: float` (Standard: 0.4)

- [ ] 🟠 **Adaptives RAG-Routing** (Query-Komplexitäts-Klassifikator)
  - Schneller Klassifikator entscheidet Retrieval-Strategie pro Anfrage:
    - **Einfach/faktisch** → RAG vollständig überspringen, aus Modellwissen antworten (z.B. "Was ist 2+2?")
    - **Mittel** → Standard Single-Pass RAG
    - **Komplex/Multi-Hop** → Mehrstufiges agentisches Retrieval (mehrere Retrieval-Runden)
  - Klassifikator: bestehende `detect_query_intent()` um Komplexitätswert erweitern; oder dediziertes kleines Modell verwenden
  - Reduziert unnötigen Retrieval-Overhead und Latenz für einfache Anfragen
  - Datei: `rag.py` → `detect_query_intent()`-Erweiterung, `main.py` → Routing-Logik

- [ ] 🟠 **Hierarchisches Domain-Routing (4-Level: Domain → Kategorie → Doc → Chunk)** *(Antwort auf „Stanford Semantic Collapse" ab ~10k Dokumenten)*
  - Quelle: `articles/medium_rag.txt`. xqt5 hat aktuell flache Vektorsuche pro Pool. Ab größeren Pools (Tausende von Dokumenten) fällt Genauigkeit drastisch — quantifizierter Effekt: 10× Latenz, 2× Genauigkeitsverlust ab 10k Docs ohne Hierarchie
  - **Schema:** Neue Spalten in `app_documents`: `domain varchar` (z.B. „HR", „Finanzen", „Recht", „Technik"), `category varchar` (z.B. innerhalb HR: „Verträge", „Richtlinien", „Onboarding"). Werte LLM-klassifiziert beim Upload (parallel zu `summary` in `_summarize_document()`)
  - Erweiterung von `detect_query_intent()` in `rag.py:554` um `detect_query_domain(query) -> Optional[str]` (Few-Shot Klassifikator gegen die in `app_settings` registrierten Domains)
  - `match_document_chunks` RPC um `filter_domain` und `filter_category` erweitern (Pre-Filter VOR Vektor-Distanz). Massive Suchraum-Reduktion
  - Admin-UI: editierbare Domain-Taxonomie pro Pool; Nutzer kann manuell Domain überschreiben
  - Verzahnung mit Phase 4.1: deren `doc_type` ist eng verwandt mit „category" — diese Idee ist die zwei-stufige Variante (Domain als oberer Layer)
  - **Aufwand:** Mittel-Groß | **Wert:** Sehr hoch bei Pool-Größen >1k Dokumente

- [ ] 🟠 **Semantic Clustering als Two-Stage Retrieval (HDBSCAN)** *(unsupervised Alternative/Ergänzung zu Domain-Routing oben)*
  - Quelle: `articles/medium_rag.txt` Lösung 2. Beispiel: 50k Dokumente → 127 Cluster (∅ 89 Docs/Cluster) → erst Top-3-Cluster matchen, dann darin tief suchen. 99.2% Suchraum-Reduktion, 8× Latenz-Verbesserung gemessen
  - **Vorteil gegenüber Domain-Routing oben:** unsupervised, keine manuelle Taxonomie nötig — auto-organisiert
  - **Schema:**
    - Neue Tabelle `app_document_clusters(id, pool_id, label_keywords text[], summary text, centroid vector(1536), member_count int)`
    - Spalte `app_documents.cluster_id uuid` (nullable, FK)
  - **Job:** APScheduler-Aufgabe (passt zu „Geplante Re-Embedding-Jobs" Teil 6.4): Wenn Pool >500 Dokumente → HDBSCAN auf Dokument-Embeddings (Mittelwert der Chunk-Embeddings oder neues `summary_embedding` aus Phase 6.1) → Cluster-Zuordnung schreiben → für jeden Cluster einen Cluster-Summary via LLM generieren
  - **Bei Query:** erst Vektor-Vergleich gegen `app_document_clusters.centroid` (n=127 statt n=50.000), Top-3-Cluster auswählen, dann `match_document_chunks` mit `filter_cluster_id IN (...)`
  - Libs: `hdbscan` (BSD-Lizenz), `umap-learn` für Dimension-Reduktion vor Clustering
  - **Aufwand:** Mittel | **Wert:** Sehr hoch bei großen Pools

- [ ] 🟠 **Pre-LLM Tool-Routing — schneller Klassifikator vor teurem Hauptmodell-Call**
  - Quelle: `basline-code/rag-vrm/agentic_rag/todo` (OpenWebUI-Pipelines-Pattern). Komplementär zu „Adaptives RAG-Routing" oben — nicht „RAG ja/nein" sondern „welches Werkzeug" (Web-Suche / RAG / Code-Tool / nur Modell-Wissen)
  - Wertvoll vor allem für lokale Ollama-Modelle, die natives Tool-Calling schlecht beherrschen
  - Neue Funktion `_route_to_tool(query, available_tools) -> Optional[ToolCall]` in `llm.py`: ruft kleines Schnell-Modell (z.B. `llama3.2:3b` oder Haiku) mit Routing-Tabelle als Prompt auf; bei Tool-Treffer Tool ausführen + Ergebnis als Kontext einfügen, dann Hauptmodell
  - Datei: neuer `tool_router.py`, `llm.py`-Erweiterung
  - **Aufwand:** Mittel-Hoch | **Wert:** Mittel — entkoppelt Tool-Auswahl von Modell-Fähigkeiten

- [ ] 🟡 **GraphRAG — Entity-Graph neben Vektorsuche**
  - Bei Dokument-Upload: Entity-Tripel (Person, Org, Konzept, Datum, Betrag + Beziehung) via LLM extrahieren
  - Als Graph speichern: kann PostgreSQL + Apache AGE Extension verwenden (Cypher-Abfragen, keine separate Graph-DB nötig)
  - Bei Anfrage-Zeit: Entities aus Anfrage extrahieren → Graph-Traversierung (2–3 Hops) → zugehörige Dokument-Chunks abrufen → mit Vektor-Ergebnissen kombinieren
  - Massive Genauigkeitsverbesserung für Multi-Entity-Relationsanfragen ("Wer hat das Q3-Budget genehmigt?")
  - Referenz: Microsoft GraphRAG (Open Source), `postgres-graph-rag` Python-Bibliothek
  - Schema: `app_entities(id, name, type, doc_id)`, `app_entity_relations(source_id, relation, target_id, doc_id)`
  - **Aufwand:** Groß — als separate Projektphase nach stabiler Kern-RAG behandeln

- [ ] 🟡 **Automatisierte RAG-Evaluation — LLM-als-Richter auf Live-Traffic**
  - Geht über den geplanten Eval-Endpunkt (Teil 5.8) hinaus: bewertet *jede* Produktions-RAG-Antwort asynchron
  - Metriken pro Antwort: **Groundedness** (folgt Antwort aus abgerufenen Chunks?), **Faithfulness** (keine Widersprüche zur Quelle?), **Antwort-Relevanz** (beantwortet es die Frage?)
  - Kleines/günstiges Modell als Richter; läuft als Hintergrundaufgabe nach Antwort-Auslieferung
  - Scores in `app_audit_log` gespeichert; Admin-Dashboard zeigt Trends über Zeit
  - Referenz: RAGAS-Bibliothek für Metrik-Definitionen
  - Konfiguration: `rag_auto_eval_enabled: bool` (Standard: false) — opt-in wegen Kosten

---

### 6.2 Sicherheit — Enterprise-Anforderungen

- [ ] 🟠 **Dokument-Level-Zugriffskontrolle in RAG**
  - Aktuell: jedes Pool-Mitglied ruft aus allen Dokumenten im Pool ab
  - `allowed_group_ids text[]`-Spalte zu `app_documents` hinzufügen; leer = zugänglich für alle Pool-Mitglieder
  - `match_document_chunks`-RPC erweitern um nach Nutzer-Gruppenmitgliedschaften vor Ranking zu filtern
  - Pool-Owners/-Admins können Dokument-Level-Einschränkungen beim Upload oder in der Dokumentenliste setzen
  - Kritisch für gemischt-sensitive Pools (z.B. HR-Dokumente nur für HR-Gruppe sichtbar)
  - Schema: `ALTER TABLE app_documents ADD COLUMN allowed_group_ids text[] DEFAULT '{}';`

- [ ] 🟠 **Input-Guardrails — Prompt-Injection-Erkennung**
  - Schicht zwischen Nutzereingabe und LLM-Call die prüft auf:
    - **Pattern-Matching**: Blocklist bekannter Injektions-Phrasen ("ignore previous instructions", "you are now DAN", "new system prompt:", etc.)
    - **Semantische Anomalie**: Eingabe einbetten und Kosinus-Ähnlichkeit gegen Bibliothek bekannter Angriffs-Embeddings vergleichen; markieren wenn Ähnlichkeit > 0.85
  - Bei Erkennung: 400 mit generischem "Input policy violation"-Nachricht zurückgeben; ins Audit-Log loggen
  - Implementierung: `LLMGuard`-Python-Bibliothek (MIT-Lizenz) oder Custom-Pattern-Liste in Konfiguration
  - Konfiguration: `input_guardrails_enabled: bool` (Standard: true), `blocklist_patterns: list` (Admin-konfigurierbar)
  - Datei: neues `guardrails.py`-Modul; in `main.py` vor jedem LLM-Dispatch aufgerufen

- [ ] 🟠 **Output-Guardrails — Antwort-Filterung**
  - Nach LLM-Generierung, vor Rückgabe an Nutzer: Antwort scannen auf:
    - PII die das Modell eingeführt haben könnte (getrennt von Input-PII-Bereinigung)
    - Policy-Verletzungs-Muster (gleiche Blocklist wie Input-Guardrails)
    - Anomales Instruction-Following (Antwort enthält direktiven Text der Jailbreak suggeriert)
  - Bei Erkennung: entweder betroffenen Abschnitt redigieren oder Fallback-Nachricht zurückgeben
  - Datei: `guardrails.py` (gemeinsames Modul mit Input-Guardrails)

- [ ] 🟡 **MCP Tool-Call-Autorisierungs-Token**
  - Wenn MCP implementiert: jeder Tool-Aufruf erfordert explizit vom Nutzer gewährten Capability-Token
  - Pro-Session Tool-Whitelist: Nutzer genehmigt welche Tools das Modell zu Session-Start aufrufen darf
  - Tool-Calls pro Session rate-limitieren (konfigurierbar: max N Tool-Calls pro Konversation)
  - Verhindert dass Modell autonom sensitive Tools ohne Nutzer-Bewusstsein aufruft
  - Datei: `mcp.py` (wenn implementiert)

- [ ] 🟡 **Sandboxed Code-Ausführung** (für Canvas/Artifacts)
  - Das Canvas-Feature plant iframe-Vorschau — wenn aber echte Code-*Ausführung* unterstützt wird, muss sie sandboxed sein
  - Optionen: Pyodide (Python in WASM, läuft im Browser, kein Server-Zugriff), oder serverseitiger Docker-Sandbox ohne Netzwerk-/Dateisystem-Zugriff
  - Beliebigen Code nicht im gleichen Prozess wie Backend oder mit Zugriff auf Env-Vars laufen lassen
  - Datei: `Artifacts.jsx` (browser-seitiges Pyodide), oder neues `sandbox.py` (server-seitiger Docker)

---

### 6.3 Observability — Produktionsqualität

- [ ] 🟠 **Langfuse / OpenTelemetry Trace-Integration**
  - Vollständige LLM-Observability: jede Anfrage generiert strukturierten Trace der nach Langfuse (Open-Source, self-hostable) oder beliebiges OTel-Backend exportiert wird
  - Trace-Hierarchie: **Session** → **Turn** → **Spans** (LLM-Call, Embedding, Retrieval, Reranking, Tool-Call)
  - Jeder Span erfasst: Latenz ms, Token-Anzahl, Kosten, Modell, RAG-Chunk-Scores, Tool-Name/Input/Output
  - Granularer als Audit-Log (der Metadaten verfolgt); Traces erfassen vollständigen Inhalt
  - Langfuse hat Supabase-kompatibles PostgreSQL-Backend — kann neben bestehender DB laufen
  - Env-Var: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
  - Datei: neues `observability.py`-Modul; `llm.py`, `rag.py`, `main.py` instrumentieren

- [ ] 🟠 **Prompt-Versionierungs-Registry**
  - System-Prompts sind aktuell in `main.py` hartcodiert (`_inject_document_policy()`, `_auto_name_conversation()`, etc.)
  - In versionierte DB-Tabelle verschieben: `app_prompts(id, name, version, environment, content, author, created_at, eval_score)`
  - Umgebungen: `dev`, `staging`, `prod` — über Admin-UI promoten
  - Backend liest aktive `prod`-Version zur Laufzeit; kann ohne Redeployment hot-geswapped werden
  - Ermöglicht A/B-Testing zwischen Prompt-Versionen (x% des Traffics zu Version B routen)
  - Datei: neues `prompts.py`-Modul, Admin-UI-Tab

- [ ] 🟡 **RAG-Statistik-Tab im Admin-Dashboard** *(rag-vrm `manage_collections.py`-Pattern)*
  - Aktuell: keine Datendichte-Statistik pro Pool — wie viele Dokumente, Chunks, Embedding-Tokens, durchschnittliche Doc-Größe, letztes Indexierungsdatum?
  - Neuer Admin-Tab „RAG-Statistik" mit Tabelle `pool_id | doc_count | chunk_count | total_tokens | last_indexed | size_mb` + Pie-Chart Content-Type-Verteilung (sobald Teil 4.6 implementiert)
  - Endpoint: `GET /api/admin/rag/stats`
  - Datei: `admin.py` neue Endpoint, `AdminDashboard.jsx` neuer Tab
  - **Aufwand:** Mittel | **Wert:** Mittel — ohne Statistik kein Tuning-Feedback

- [ ] 🟡 **Kosten-Observability-Dashboard**
  - `token_tracking.py` verfolgt Nutzung bereits — richtig surfacen:
  - Admin-Charts: Ausgaben pro Nutzer, pro Modell, pro Tag/Woche/Monat
  - Budget-Alerts: benachrichtigen (E-Mail oder In-App) wenn Nutzer/Gruppe sich dem Token-Budget-Schwellenwert nähert
  - Token-Effizienz: durchschnittliche Kontext-Auslastung verfolgen (werden lange Kontexte tatsächlich verwendet?)
  - Export: CSV-Download der Nutzungsdaten pro Datumsbereich
  - Datei: `AdminDashboard.jsx` (neuer Nutzungs-Tab), `token_tracking.py` (Aggregations-Abfragen)

---

### 6.4 Infrastruktur

- [ ] 🟢 **Application Monitoring** (Prometheus + Grafana)
  - `prometheus-fastapi-instrumentator` für automatische Endpunkt-Metriken hinzufügen
  - `/metrics`-Endpunkt (admin-auth-geschützt) bereitstellen
  - Wichtige Metriken: Request-Latenz p50/p95, LLM-Call-Dauer, RAG-Retrieval-Zeit, Fehlerraten, aktive Nutzer
  - Optional: Grafana-Dashboard-Konfiguration als Code in `infra/`

- [ ] 🟡 **`/ready` Readiness-Probe** (getrennt von `/health`)
  - `/health` = läuft der Prozess? (bereits geplant in Teil 7)
  - `/ready` = sind alle Abhängigkeiten erreichbar? Gibt 200 nur zurück wenn DB, Redis und pgvector bestätigt responsiv sind
  - Wird von Kubernetes Readiness Probes verwendet um Traffic zurückzuhalten bis App vollständig initialisiert
  - Datei: `main.py` (zwei separate Endpunkte)

- [ ] 🟠 **Geplante Re-Embedding-Jobs** — nächtlicher Diff + wöchentlicher Voll-Rebuild
  - **Nächtlich:** Dokumente mit geändertem `content_hash` erkennen (siehe „Dedup & Cache-Disziplin"-Sektion oben), nur diese neu chunken + embedden
  - **Wöchentlich:** Voll-Rebuild über alle Dokumente — deckt Embedding-Modell-Drift, Contextual-Retrieval-Backfill und Algorithmus-Änderungen ab
  - **Konflikt-Schutz via PostgreSQL Advisory-Lock:** Bei Job-Start `pg_try_advisory_lock(hashtext('rag_reindex'))`; falls schon gehalten → Job überspringen + Log. Verhindert dass nächtliche und manuell ausgelöste Jobs gleichzeitig laufen und identische Dokumente doppelt embedden (Race Condition + Token-Kosten). Coolify-kompatibel — kein Filesystem-Lock nötig
  - **Post-Run-Integritätsprüfung:** nach Job `SELECT COUNT(*) FROM app_document_chunks WHERE document_id = ?` für jedes verarbeitete Doc; bei 0 Chunks Audit-Log + UI-Warnung. Verhindert „stillen Datenverlust" wenn Indexer mitten im Lauf abstürzt (rag-vrm `scripts/reindex.sh:117–122`-Pattern)
  - **Randomized Delay (`random.randint(0, 300)` Sekunden) bei Job-Start** — verteilt Last bei Multi-Tenant, vermeidet Thundering-Herd
  - Logging in `app_audit_logs`
  - **Mehrwert:** Status-Doc warnt bereits "vorhandene Dokumente brauchen Re-Chunking" für Contextual-Retrieval — derzeit kein Automatismus, manuelle Auslösung nötig
  - Quelle: `basline-code/rag-vrm/documentation/automatic_index_update.md` + `scripts/reindex.sh`
  - Datei: neues Modul `backend/app/scheduled_jobs.py` (APScheduler) oder systemd-Timer in Coolify

- [ ] 🟢 **Inkrementelles Git/GitLab-Repo-Reindexing** — Repo per URL anbinden, Commit-Hash speichern, beim Reindex nur geänderte Dateien neu verarbeiten
  - Erweitert "Ordner-Upload" (Teil 1) zu kontinuierlichem Sync für Code-Projekte und Doku-Repos
  - Implementierung: `git clone`/`git pull`; Diff gegen `last_indexed_commit`; nur veränderte Pfade reindexen, gelöschte Pfade aus `app_documents` entfernen
  - Quelle: `basline-code/rag-vrm/documentation/gitlab_pull_reindexing.txt`
  - Schema: neue Tabelle `app_repo_sources(id, url, branch, last_indexed_commit, owner_user_id, pool_id)`
  - Datei: Erweiterung `documents.py`, neuer Tab in `AdminDashboard.jsx` oder pro Pool

- [ ] 🟢 **CLI für Collection-Management** — Admin-Skript um RAG-Collections (z.B. pro Pool / Mandant) zu erstellen, listen, löschen, swappen
  - Nur relevant wenn Multi-Collection-Isolation implementiert wird (separater Vektor-Index pro Pool statt geteilte `app_document_chunks`)
  - Quelle: `basline-code/rag-vrm/agentic_rag/manage_collections.py`
  - Datei: neues Skript `backend/manage_collections.py`

---

## Teil 7: Plattformqualität

- [ ] 🟠 **Service-Readiness-Schleife beim Start** *(rag-vrm `indexer/main.py:17–43`-Pattern)*
  - Beim FastAPI-Startup (lifespan/`@app.on_event("startup")`) Supabase + Embedding-Provider mit Retry-Loop pingen (`max_retries=30, delay=2`); bei Fehlschlag Service mit klarer Fehlermeldung verweigern statt 500-Spirale auf jede Anfrage
  - Vermeidet Crashes wenn Backend hochfährt bevor DB/Embedding-Provider verfügbar sind (Coolify-Cold-Start-Szenario)
  - Datei: `main.py` Lifespan-Handler
  - **Aufwand:** Klein | **Wert:** Mittel — robusterer Coolify-Restart-Flow

- [ ] 🟡 **Dev/Prod-Datentrennung formalisieren** *(rag-vrm `.env.dev`/`.env.prod`-Pattern)*
  - Aktuell: ein einziger `.env`. Lokale Entwicklung und Coolify-Prod treffen denselben Supabase wenn nicht manuell getrennt — Risiko für versehentliche Daten-Überschreibung
  - `ENV_NAME` env-var (`dev` | `staging` | `prod`); Tabellenname-Präfix oder Schema-Separation; Redis-Prefix (kombiniert mit Cache-Versionierung); Logs/Audit kennzeichnen Environment
  - Fail-fast wenn `ENV_NAME=prod` und `SUPABASE_URL` localhost matcht
  - Datei: `config.py`, neue Validation in Lifespan
  - **Aufwand:** Mittel | **Wert:** Mittel — verhindert Dev→Prod-Datenkollisionen

- [ ] 🟡 **Streaming-Fehler-Recovery** — Partial Content + Fehler-Marker wenn SSE-Stream mitten in Antwort abbricht
- [ ] 🟡 **Request-Deduplizierung** — Idempotency-Key bei `POST /chat` um Doppel-Submissions zu verhindern
- [ ] 🟡 **Hintergrund-Job-Queue für Dokumentenverarbeitung** — PDF-Parsing + Embedding nach Celery/ARQ auslagern; sofort Job-ID zurückgeben mit Polling-Endpunkt
- [ ] 🟡 **Health-Check-Endpunkt — Abhängigkeits-Prüfungen hinzufügen** — `/api/health` existiert bei `main.py:169` als Stub (`{"status": "healthy"}`); erweitern um tatsächlich DB, Redis und pgvector-Konnektivität zu prüfen und Pro-Abhängigkeits-Status zurückzugeben
- [ ] 🟡 **Frontend: Zitierungs-Link-Rendering** — `section_path` als Breadcrumb in Quell-Tooltip rendern (Phase 1.2 fügt die Daten hinzu, dies surfact sie in der UI)
- [ ] 🟡 **Frontend: Upload-Fortschrittsanzeige** — Verarbeitungsstufen anzeigen (Hochladen → OCR → Chunking → Embedding)
- [ ] 🟢 **Semantisches Caching** — LLM-Call überspringen wenn Kosinus-Ähnlichkeit einer aktuellen Anfrage > 0.97
- [ ] 🟢 **Frontend: Modell-Kostenانzeige** — Geschätzte Kosten der Konversation aus Token-Nutzung
- [ ] 🟢 **Frontend: Tastaturkürzel** — Absenden: Ctrl+Enter, neuer Chat: Ctrl+N, Sidebar umschalten: Ctrl+B

---

## Umsetzungsreihenfolge

**Sofort: Ausstehende Admin-UI-Elemente** (Backend bereits fertig)
1. AdminDashboard.jsx Toggles für Kontextuelles Retrieval (Phase 4.2) und Nachbar-Chunks (Phase 5.3)
2. AdminDashboard.jsx Slider für Token-Budget (Phase 7.1)

**KVWL Pflicht-Kriterien**
3. Unveränderliche globale System-Prompts (1 Tag)
4. Azure Entra ID SSO (3–4 Tage)

**KVWL B-Kriterien für Scoring-Schwellenwert**
5. MCP-Support (4–5 Tage)
6. Audit-Log + Token-Budgets + Web-Suche (parallel wo möglich)

**Post-Tender: Quick Wins (klein, hoher Hebel)**
7. Content-Hash-basiertes Skip beim Upload („Dedup & Cache-Disziplin")
8. Bild-Hash-Dedup + VLM-Inferenz-Cache (Voraussetzung: Phase 3 nicht zwingend)
9. Cache-Versionierungs-Präfix für Redis (Voraussetzung für sichere Cache-Updates)
10. Reranker-Boost-Werte aus `app_settings` lesen (in Teil 4.3 verankert)

**Post-Tender: RAG-Qualität (reiner Code, kein Schema)**
11. Phase 6.2 — Query Expansion
12. Gewichtetes RRF (Teil 4.1)
13. Vorheriger/nächster Chunk-Kontext bei Indexierungszeit (Teil 5.6)
14. Dynamischer Vision-Prompt pro Bildtyp (Teil 5.3) + Zwei-Call-Trennung
15. Metadaten-Pre-Filter VOR Vektor-Suche (Teil 4.2 sequenzielle Variante)
16. Geplante Re-Embedding-Jobs mit Advisory-Lock + Integritätsprüfung (Teil 6.4)
17. Service-Readiness-Schleife beim Start (Teil 7)

**Post-Tender: RAG-Qualität (kleine Schema-Migrationen)**
18. Phase 4.1 — Metadaten-Extraktion (language, doc_type, page_count)
19. Content-Type-Erkennung + `content_type`-Spalte (Teil 4.6) — kleine Migration, entsperrt alles darunter
20. Typspezifischer Chunking-Dispatch für Code/Config/Markdown (Teil 4.6) — nur Code, kein weiteres Schema
21. Code-Symbol-Extraktion pro Chunk + `symbols[]`-Spalte + `start_line`/`end_line` (Teil 4.6) — hängt ab von 19
22. Pro-Chunk-Keyword-Extraktion + GIN-Index für Prose (Teil 4.5) — parallel zu 21
23. Payload-Suche als drittes RRF-Signal (Teil 4.2 — hängt ab von 21 + 22)
24. Lokaler Reranker mit Boost-Signalen (Teil 4.3) — Werte aus DB
25. Code-Symbol-Payload-Suche + Dateiname-Boost im Reranker (Teil 4.7 — hängt ab von 21 + 24)
26. Aktualitäts- + Autoritäts-Scoring-Signale (Teil 5.7) — im Reranker implementieren (Schritt 24)
27. `is_authoritative`-Flag + datengetriebene `confidence_score` (Teil 5.7)
28. Stable chunk keys + thematische `related_chunk_ids[]` (Teil 5)

**Post-Tender: Größere RAG-Arbeit**
29. Phase 6.1 — Zusammenfassungs-Embeddings
30. Hierarchisches Domain-Routing + Semantic Clustering HDBSCAN (Teil 6.1) — *Stanford-Semantic-Collapse-Antwort, größter Skalierungs-Hebel*
31. Themenverschiebungs-Erkennung für adaptives Chunking (Teil 5.5)
32. Figur+Beschriftung-Kohäsion im Chunker (Teil 5.1)
33. Retrieval-Qualitätsmetriken / Eval-Framework (Teil 5.8) + OCR-Regressions-Harness + LLM-als-Richter Auto-Eval (Teil 6.1)
34. Corrective RAG / CRAG (Teil 6.1)
35. Adaptives RAG-Routing + Pre-LLM Tool-Routing (Teil 6.1)
36. Phase 3 — Bild-Speicher-Migration (zusammen mit Bild-Hash-Dedup oben)
37. Phase 2/8 — OCR-Abstraktion mit Hybrid Docling+Nanonets + Multimodalität (inkl. HierarchicalChunker 5.2, Bbox-Provenienz, Formel-Anreicherung 5.4, mehrseitige Figuren-Zusammenführung 5.3, OCR-Prompt-Bibliothek)
38. Mehrsprachiges Embedding-Modell-Evaluation (Teil 5.9 — bge-m3 / E5-Mistral)

**Plattform & Observability (laufend)**
39. Follow-up-Prompt-Vorschläge (Teil 2)
40. Persistentes Nutzer-Gedächtnis (Teil 2)
41. Input-/Output-Guardrails (Teil 6.2)
42. Dokument-Level-RAG-Zugriffskontrolle (Teil 6.2)
43. Langfuse / OTel Trace-Integration (Teil 6.3)
44. Prompt-Versionierungs-Registry (Teil 6.3) — inkl. Vision-Prompts als Einträge
45. Kosten-Observability-Dashboard + RAG-Statistik-Tab (Teil 6.3)
46. Default „RAG-Recherche-Assistent"-Template mit Tool-Routing-Tabelle (Teil 2)
47. Ollama Modelfile-Builder + VRAM-Sizing (Teil 3)
48. Chat-Verzweigung / Konversationsbaum (Teil 2)
49. SCIM 2.0-Provisionierung (Teil 3)
50. GraphRAG — Entity-Graph (Teil 6.1, großer Aufwand, separate Phase)

---

## Technische Hinweise

- `bcrypt` auf `==4.0.1` pinned — nicht upgraden; bricht passlib
- Azure GPT: kein `temperature`-Parameter, `max_completion_tokens` statt `max_tokens`, Auth via `api-key`-Header
- Alle neuen Tabellen: `app_*` oder `pool_*` Präfix-Konvention
- FastAPI Streaming-Endpunkte: immer `response_model=None` setzen
- pgvector muss im Supabase Dashboard aktiviert sein vor jeder RAG-Tabellen-Erstellung
- Phase-Abschlussstatus und Implementierungs-Historie: siehe `IMPLEMENTIERT.md`
- OCR-Backend-Auswahl hängt von Host-GPU ab: ohne GPU bleibt Mistral (Cloud) oder Docling-solo; Hybrid `docling+nanonets` braucht GPU
