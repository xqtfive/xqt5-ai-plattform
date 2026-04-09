# Erledigte Features

Dieses Dokument hält abgeschlossene Implementierungen aus dem Feature-Backlog fest. Erledigte Punkte werden aus dem Backlog hierher verschoben.

---

## RAG-Backend — Cherry-picks aus dri (2026-04-07)

Folgende RAG-Verbesserungen wurden aus `xqt5-ai-plattform-dri` in `xqt5-ai-plattform` portiert.

> **Scope-Hinweis:** Nur die RAG-Backend-Verbesserungen aus dem dri-Branch wurden übernommen. Der dri-Branch enthielt außerdem UI- und Strukturänderungen (Sidebar-Redesign, NavRail-Entfernung, Provider-Entfernungen, Welcome.jsx-Vereinfachung) — diese wurden bewusst ausgeschlossen, da sie entweder Rückschritte darstellen oder keinen Mehrwert für das aktuelle Repo bieten.

---

### Phase 1.1 — Relevanzfilter (`apply_relevance_gate()`) + RRF-Bugfix

**Erledigt:** 2026-04-07

Alle Chunks werden verworfen, wenn `max(similarity) < RAG_RELEVANCE_GATE` (Standardwert: 0.35). Zusätzlich wurde ein kritischer Bugfix in `_reciprocal_rank_fusion()` vorgenommen: Der RRF-Score (0.008–0.016) hat den Cosine-`similarity`-Score überschrieben, wodurch das Relevanzfilter immer `False` auswertete und RAG im Hybrid-Modus still deaktivierte. Der Fix trennt `rrf_score` als eigenes Feld; `similarity` enthält fortan immer den rohen Cosine-Score.

- Dateien: `rag.py`, `config.py` (neue Umgebungsvariable `RAG_RELEVANCE_GATE`)

---

### Phase 1.2 — Vollständige Quellenangaben

**Erledigt:** 2026-04-07

`build_rag_context()` gibt Seitenzahl und Abschnitts-Breadcrumb-Pfad im Quell-Header aus.

Format: `datei.pdf | Seite 12 | §3.1 Titel (Relevanz: 87%)`

Das `rag_sources`-Array an das Frontend enthält jetzt die Felder `page_number`, `section_path` und `chunk_index`.

- Dateien: `rag.py`, `main.py`

---

### Phase 4.2 — Kontextuelles Retrieval (Opt-in)

**Erledigt:** 2026-04-07 — **Hinweis:** Backend fertig; Admin-UI-Toggles in `AdminDashboard.jsx` noch ausstehend.

`_generate_chunk_context()` stellt jedem Chunk vor dem Einbetten einen per LLM generierten Ein-Satz-Kontext voran (Anthropic-Technik). Die Verarbeitung läuft via `asyncio.gather` für parallele Batch-Verarbeitung pro Dokument.

Opt-in über Admin-Toggle `contextual_retrieval_enabled` und konfigurierbares Modell (`contextual_retrieval_model`). Gilt nur für neu hochgeladene Dokumente; bestehende Dokumente benötigen ein erneutes Chunking.

- Dateien: `rag.py`, `admin.py`, `models.py`

---

### Phase 4.3 — Dokument-Zusammenfassung beim Upload

**Erledigt:** 2026-04-07 (als bereits bestehende Funktionalität bestätigt)

`_summarize_document()` ist in `main.py` vorhanden und in beiden Upload-Endpunkten eingebunden. Die Zusammenfassung wird in `app_documents.summary` gespeichert.

- Dateien: `main.py`, `documents.py`

---

### Phase 5.1 — Tabellen-bewusstes Chunking

**Erledigt:** 2026-04-07

`_table_to_atoms()` behandelt Markdown-Tabellenblöcke als atomare Einheiten. Zu große Tabellen werden ausschließlich an Zeilengrenzen aufgeteilt; jeder Folge-Chunk beginnt mit `[Tabellenfortsetzung — Spalten: …]`. `_units_with_table_awareness()` ersetzt `_split_into_units()` in der Abschnitts-Splitting-Schleife.

- Datei: `rag.py`

---

### Phase 5.3 — Nachbar-Chunk-Abruf

**Erledigt:** 2026-04-07 — **Hinweis:** Backend fertig; Admin-UI-Toggle in `AdminDashboard.jsx` noch ausstehend.

`enrich_with_neighbors()` holt `chunk_index ± 1` für die Top-3-Ergebnisse nach dem Relevanzfilter. Nachbar-Chunks erhalten `similarity = parent_similarity × 0.85` und `is_neighbor = true`. Die Ergebnisse werden nach `document_id + chunk_index` für sequenzielles Lesen sortiert.

Opt-in über Admin-Toggle `neighbor_chunks_enabled` (Standard: true).

- Dateien: `rag.py`, `main.py`, `admin.py`, `models.py`

---

### Phase 7.1 — Token-Budget-Kontextzusammenstellung

**Erledigt:** 2026-04-07 — **Hinweis:** Backend fertig; Admin-UI-Slider in `AdminDashboard.jsx` noch ausstehend.

`build_rag_context(max_tokens=6000)` befüllt den Kontext mit Chunks nach Relevanz, bis das Budget erschöpft ist. Übersprungene Chunks werden geloggt; verhindert, dass ein 50-Chunk-Kontext das LLM-Fenster dominiert. `max_context_tokens` ist im Admin-Bereich bis 32.000 konfigurierbar.

- Dateien: `rag.py`, `main.py`, `admin.py`, `models.py`

---

### Phase 7.2 — XML-Kontext-Format

**Erledigt:** 2026-04-07

`build_rag_context()` gibt jetzt XML-getaggte Blöcke statt `--- Source N ---` aus, entsprechend den Anthropic-Prompting-Best-Practices:

```xml
<documents>
  <document index="1">
    <source>datei.pdf | Seite 12 | §3.1 Titel (Relevanz: 87%)</source>
    <content>…</content>
  </document>
</documents>
```

- Datei: `rag.py`

---

### Aktualisierung `_apply_document_access_policy()` in `main.py`

**Erledigt:** 2026-04-07

Die Dokumenten-Zugriffsrichtlinie wurde von 2-teilig auf 3-teilig erweitert:

1. Dokumentenkontext nur verwenden, wenn er direkt relevant für die Frage des Nutzers ist
2. Fragt der Nutzer etwas, das nichts mit den Dokumenten zu tun hat, aus eigenem Wissen antworten — Dokumente nicht referenzieren
3. Antworten auf den bereitgestellten Kontext stützen; klar kommunizieren, wenn Informationen fehlen

- Datei: `main.py` → `_apply_document_access_policy()`
