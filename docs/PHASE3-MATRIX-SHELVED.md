# Phase-3.1-Verifikationsmatrix — geparkt

**Geparkt am:** 2026-05-13
**Grund:** Manuelles RAG-Testing wird der formalisierten Matrix vorgezogen. Der Architekt nutzt den existierenden Testkorpus eigenständig; eine schrittweise Runbook-getriebene Matrix ist nicht der gewählte Arbeitsmodus.

## Was geparkt wurde

- Eine formalisierte sechs-Test-Matrix (A–F) gegen Musterbau- und Rheintal-Korpora
- Geplantes `docs/tests/phase3/MATRIX-RUNBOOK.md` — nicht angelegt, kommt nicht
- Geplantes Admin-UI-Panel „RAG-Inspektion" (sowohl DB-Variante als auch `app_audit_logs.metadata.rag`-Variante)
- Geplantes strukturiertes `event=rag_trace`-Stdout-Logging mit JSON-Schema
- Geplanter `RAGTrace`-Dataclass-Refactor durch `retrieve → gate → neighbors → build_context`
- Geplantes `event=ingest_trace`-Event für Upload-Zeit-Tests
- Geplante Pre-Fusion-Rank-Capture (`bm25_rank` / `vector_rank`) in `_search_chunks_hybrid`
- Geplanter Per-Doc-Cap auf protokollierte Chunks
- Geplante Privacy-Mitigationen am `phase3=true`-Log (Section-Hash, Filename→Doc-ID, Score-Quantisierung)

## Was bleibt und weiterhin nutzbar ist

- **Test-Korpus unter `docs/tests/phase3/corpus/`** — alle Fixtures, Ground-Truth-Specs und Build-Skripte bleiben. Dient als Grundlage für manuelles RAG-Testing.
  - `MUSTERBAU.md` (374 Zeilen, eingefroren 2026-05-08) — 10 BM25-exklusive Begriffe mit Datei-Zuweisung, Schlüsselereignisse, finanzielle Eckwerte
  - `rheintal/RHEINTAL.md` (330 Zeilen, eingefroren 2026-05-11) — 10 BM25-Begriffe über 6 Dateien, Atelierüberlassung-Test, Pool-Isolation
  - Aktive Fixture-Verzeichnisse: `musterbau/`, `rheintal/`, `multidoc_a/`, `long/`, `dedup/`, `phash/`, `rrf/`
  - `scripts/build_corpus.py` regeneriert Binär-Fixtures
- **`phase3=true`-Stdout-Log** in `backend/app/rag.py:1354–1378` — bleibt unverändert. Status nicht mehr „temporär bis Matrix-Sign-off", sondern stehende Beobachtungs-Telemetrie für manuelles Inspizieren via Coolify-Logs.

## Test-Themen die der Korpus weiterhin abdeckt (für manuelles Testen)

Falls nützlich für Ad-hoc-Prüfungen:

| Thema | Korpus-Anker | Was zu prüfen |
|---|---|---|
| Multi-Dok-Bias | `multidoc_a/{overview.md, deep_dive.txt, appendix.pdf}` (KD-007) | RAG liefert Chunks aus mehreren Docs, nicht alle aus einem |
| Token-Budget | `long/handbuch_lang.pdf` (50 Seiten) | `RAG context: N chunk(s) ausgelassen` erscheint im Log |
| Content-Hash-Dedup | `dedup/sample.pdf` (zweimal hochladen) | zweiter Upload skipped; Audit-Event `document.upload.dedup_skipped` |
| Bild-pHash | `phash/logo_repeating.pdf` (Logo auf jeder Seite) | Asset-Tabelle hat eine Canonical + Recurring-Einträge; Image-RAG liefert kein Duplikat |
| Pool-Isolation | Musterbau-Pool ↔ Rheintal-Pool | Query in Pool-A liefert keine Chunks aus Pool-B |
| BM25-vs-Vektor | `Drewermann-Verfahren`, `Kavitationsschutzprotokoll`, `Fensterprotokoll 24-Kanal` (alle exklusiv in `musterbau/techspec_pims.md`) | Top-Treffer ist `techspec_pims.md` mit hohem `rrf`, niedrigem `sim` |

Pass/Fail-Entscheidung erfolgt durch Architekt im Coolify-Log-Filter `phase3=true` + Inspektion.

## Wenn du jemals zurückkommen willst

Vor Wiederaufnahme prüfen:

1. **Welche RAG-Änderungen sind seit 2026-05-13 gelandet?** `git log -- backend/app/rag.py backend/app/documents.py` — wenn der RRF-Pfad oder die Chunking-Logik signifikant geändert wurde, sind manche Korpus-Erwartungen ggf. überholt
2. **Sind die DEV-Migrationen noch konsistent?** Siehe Memory `project_xqt5_dev_prod_state.md`
3. **Hat der Korpus selbst Drift?** Fixture-Generierung via `scripts/build_corpus.py` ist deterministisch; Text-Fixtures sind handgeschrieben — auf Konsistenz mit dem aktuellen Code prüfen
4. **Ist Coolify-Log-Retention noch nicht gelöst?** Falls ja: Strukturierter Log via JSON ist immer noch ein gangbarer Schritt OHNE Admin-UI-Panel — der Bauplan für ein `event=rag_trace`-Event mit den Privacy-Mitigationen (Section-Hash, Filename→Doc-ID, 2-Dezimalen, Pre-Fusion-Ränge) liegt in der Conversation-History dieser Session
5. **Welche RAG-Bugs sind seither aufgeschlagen?** Falls neue Bugs durchgerutscht sind, ist der Korpus-Lauf eventuell nachträglich wieder hochpriorisiert

## Mögliche zukünftige Variante: Versteckter Admin/Dev-RAG-Testbereich

**Idee (2026-05-13, nicht beschlossen, nur als Wiederaufnahme-Pfad notiert):**

Wenn der ursprünglich geplante RAG-Testbereich später doch sinnvoll wird, ließe er sich datenschutzkonform umsetzen, indem er **nicht** in den regulären Admin-UI-Pfad eingebaut wird, sondern hinter einer **versteckten Admin/Dev-only-Option** liegt. Drei Design-Eigenschaften machen ihn dann mit `SECURITY.md:209` (keine Prompt-Speicherung) kompatibel:

1. **Hidden-Entry-Gate** — keine Verlinkung in NavRail oder AdminDashboard. Zugang ausschließlich über:
   - eine nicht-verlinkte URL (z. B. `/admin/rag-sandbox`) plus `is_admin` AND ein zusätzliches Flag (env var, Feature-Flag in `app_settings`, oder spezifisch gepinnter User)
   - alternativ: Tastenkürzel-/Konami-Code-Trigger im AdminDashboard
2. **Sandbox-Modus statt Produktions-Logging** — der Bereich ist explizit für **synthetische Test-Queries** auf dem eingefrorenen Test-Korpus (Musterbau / Rheintal) oder für admin-getippte Ad-hoc-Queries. **Keine produktiven User-Queries werden erfasst.** Damit umgeht der Track das `SECURITY.md:209`-Verbot, weil dort gar nichts persistiert wird, das nicht ohnehin explizit zum Testen eingetippt wurde.
3. **Live-Trace ohne Persistenz** — die volle RAG-Pipeline-Telemetrie (Pre-Fusion-Ränge, Surviving-Chunks, Score-Aufschlüsselung, Doc-IDs) wird als JSON-Response zurückgegeben und im Frontend live gerendert. **Keine DB-Tabelle**, keine Retention-Diskussion, keine Coolify-Log-Sorge.

Damit liegt der erlaubte Funktionsumfang ungefähr bei:
- Query-Eingabe-Feld + Pool-/Scope-Auswahl-Dropdown
- Live-Anzeige aller Trace-Felder die das ursprüngliche `event=rag_trace`-Schema vorgesehen hatte
- Optional: Side-by-Side-Vergleich zweier verschiedener RAG-Settings
- Optional: Pre-Defined-Test-Queries aus den Musterbau/Rheintal-Specs als Buttons

Privacy-Begründung gegenüber `SECURITY.md:209`: weil **nichts persistiert wird** und **kein User-Verkehr erfasst wird**, gibt es keine Prompt-Archivierung im Sinne der Vorschrift. Der Bereich ist ein Sichtfenster auf eine ad-hoc ausgeführte RAG-Query, nicht ein Audit-Log.

**Wenn diese Option später angegangen wird:**
1. Hidden-Entry-Pattern entscheiden (URL + zweites Flag, Tastenkürzel, …)
2. Endpoint `POST /api/admin/rag-sandbox` der eine RAG-Query ausführt, alle Trace-Daten in der Response zurückgibt, **nichts logged**
3. Frontend-Komponente die das rendert; in `AdminDashboard.jsx` oder als separater versteckter Sub-Route
4. SECURITY.md mit einer Erklärung warum dieser Pfad konform bleibt
5. Trotz Hidden-Status: Admin-Aktion-Audit-Log-Eintrag (`admin.rag_sandbox.query` mit `query_text_length` aber ohne `query_text`) — damit Nachvollziehbarkeit besteht wer wann den Bereich genutzt hat

Das ist explizit **eine Idee, kein Plan**. Vor Umsetzung müssten die SECURITY-Argumentation und das Hidden-Entry-Pattern noch durchgeprüft werden.

## Verwandte Memories

- `[[project_xqt5_todo]]` — Phase-3-Resume-Punkt mit Korpus-Stand
- `[[project_xqt5_dev_prod_state]]` — DEV/PROD-Migration-State per Tabelle
- `[[project_xqt5_image_gen_v1]]` — frischer Image-gen-v1-Track
