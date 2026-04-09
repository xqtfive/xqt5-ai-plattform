# Erledigte Features

Dieses Dokument hält abgeschlossene Implementierungen aus dem Feature-Backlog fest. Wenn ein Punkt aus `TODO.md` umgesetzt wird, wird er hierher verschoben — vollständig mit allen technischen Details, sodass keine Information verloren geht.

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
