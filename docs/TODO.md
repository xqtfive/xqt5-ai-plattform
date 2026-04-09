# Feature-Backlog

Erstellt: 2026-03-31 | Quellen: `xqt5-ai-plattform-dri` Code-Diff, `RAG-VERBESSERUNGSPLAN.md`, `RAG-STATUS.md`, `articles/`, `basline-code/rag-vrm/`, `kvml_test/`

Erledigte Punkte werden nach `ERLEDIGT.md` verschoben. Kein Informationsverlust — alle Details bleiben erhalten.

---

## Prioritäten

- 🔴 **BLOCKER** — Pflichtanforderung (Ausschlusskriterium ohne Umsetzung)
- 🟠 **HOCH** — Hoher Mehrwert, klarer Umsetzungspfad
- 🟡 **MITTEL** — Gutes ROI, je 1–3 Tage
- 🟢 **NICE-TO-HAVE** — Geringere Dringlichkeit, künftige Roadmap

---

## Ausstehende Frontend-Elemente (Backend bereits implementiert)

Die folgenden Backend-Funktionen sind fertig (siehe `ERLEDIGT.md`), die zugehörigen Admin-UI-Steuerelemente fehlen noch:

- [ ] 🟠 **AdminDashboard.jsx — Toggle: Kontextuelles Retrieval** (Phase 4.2)
  - Toggle für `contextual_retrieval_enabled` + Modell-Auswahl `contextual_retrieval_model`
  - Datei: `frontend/src/components/AdminDashboard.jsx`

- [ ] 🟠 **AdminDashboard.jsx — Toggle: Nachbar-Chunk-Abruf** (Phase 5.3)
  - Toggle für `neighbor_chunks_enabled`
  - Datei: `frontend/src/components/AdminDashboard.jsx`

- [ ] 🟠 **AdminDashboard.jsx — Slider: Token-Budget** (Phase 7.1)
  - Slider für `max_context_tokens` (bis 32.000)
  - Datei: `frontend/src/components/AdminDashboard.jsx`

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

- [ ] 🟡 **Phase 2 — OCR-Abstraktionsschicht** *(bewusst verschoben — OCR-Pipeline in Parallelprojekt)*
  - `OCRResult`-Dataclass als einheitliches Schema definieren (vollständige Spezifikation in `RAG-VERBESSERUNGSPLAN.md §2.1`)
  - Bestehende Mistral-Funktionen in `documents.py` als `MistralOCRAdapter` wrappen
  - Wenn bereit: Docling als primären Extraktionspfad für textbasierte PDFs (>80 Zeichen/Seite Durchschnitt)
  - VLM-Bildinterpretation als `[BILDBESCHREIBUNG]`-Block direkt in Chunk-Text eingebettet

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

- [ ] 🟠 **CSV- und Excel-Upload und -Verarbeitung**
  - Aktuell nur PDF, TXT und Bilddateien unterstützt
  - `pandas` + `openpyxl` für `.csv`, `.xls`, `.xlsx`-Verarbeitung in `documents.py` hinzufügen
  - Chunking-Strategie für Tabellendaten: jede Zeile oder logische Zeilengruppe als Chunk; Spaltenüberschriften in jedem Chunk einschließen (gleiches Prinzip wie tabellen-bewusstes Chunking Phase 5.1)
  - Als Text-Chunks in `app_document_chunks` speichern — kein spezielles Schema nötig
  - Datei: `documents.py`

- [ ] 🟠 **DOCX-Upload und -Verarbeitung**
  - `.docx`-Dateien sind ein gängiges Geschäftsformat, aktuell nicht unterstützt
  - `python-docx` verwenden um Absätze, Überschriften, Tabellen (als Markdown), eingebettete Bilder zu extrahieren
  - Ausgabe in bestehende Chunking-Pipeline einspeisen
  - Datei: `documents.py`

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

- [ ] 🟠 **Token-Budgets und EUR-Kostenlimits** — ~2–3 Tage
  - Token-Nutzung pro Nutzer pro Zeitraum in `app_usage`-Tabelle verfolgen
  - Admin: max. Tokens/Tag pro Nutzer, max. EUR/Monat pro Gruppe setzen
  - Soft-Warnung bei 80%, Hard-Block bei 100%; Nutzungs-Dashboard im Admin-Panel

- [ ] 🟠 **Bild-Generierung** — ~4 Tage
  - Mindestens einen Bild-Generierungs-Provider integrieren (z.B. DALL-E 3 via OpenAI API oder Stability AI)
  - Bild-Generierungs-UI im Chat: dedizierter Eingabe-Modus, Prompt-Feld, optionale Stil-/Größen-Selektoren
  - Admin: pro Provider aktivieren/deaktivieren, erlaubte Modelle konfigurieren, Corporate Style Presets setzen (Markenfarben, verbotene Inhaltskategorien)
  - Generierte Bilder inline im Chat angezeigt; herunterladbar
  - Kein Upload sensibler Bilddaten an externe Services — nur Generierung, keine eingehende Bildverarbeitung in diesem Feature
  - Provider-Key via bestehendem verschlüsseltem Key-Speicher in DB verwaltet

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
  - Abwägung: verliert deutsche Satz-Grenz-Logik und Custom-Tabellen-Fortsetzungs-Header-Logik aus Phase 5.1 (dri)
  - **Empfehlung:** HierarchicalChunker als Basis verwenden; Ausgabe nachverarbeiten um hinzuzufügen: Tabellen-Fortsetzungs-Headers (5.1), Kontextuelles-Retrieval-Prefix (4.2) und Breadcrumb-Injektion

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
  - Alternativ: erster VLM-Call klassifiziert als "Logo/Dekorativ" → aufwändigen Interpretations-Call überspringen
  - Spart Kosten und vermeidet Verschmutzung von Chunks mit Logo-Beschreibungen

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

---

## Teil 7: Plattformqualität

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

**Post-Tender: RAG-Qualität (reiner Code, kein Schema)**
7. Phase 6.2 — Query Expansion
8. Gewichtetes RRF (Teil 4.1)
9. Vorheriger/nächster Chunk-Kontext bei Indexierungszeit (Teil 5.6)
10. Dynamischer Vision-Prompt pro Bildtyp (Teil 5.3)

**Post-Tender: RAG-Qualität (kleine Schema-Migrationen)**
11. Phase 4.1 — Metadaten-Extraktion (language, doc_type, page_count)
12. Content-Type-Erkennung + `content_type`-Spalte (Teil 4.6) — kleine Migration, entsperrt alles darunter
13. Typspezifischer Chunking-Dispatch für Code/Config/Markdown (Teil 4.6) — nur Code, kein weiteres Schema
14. Code-Symbol-Extraktion pro Chunk + `symbols[]`-Spalte + `start_line`/`end_line` (Teil 4.6) — hängt ab von 12
15. Pro-Chunk-Keyword-Extraktion + GIN-Index für Prose (Teil 4.5) — parallel zu 14
16. Payload-Suche als drittes RRF-Signal (Teil 4.2 — hängt ab von 14 + 15)
17. Lokaler Reranker mit Boost-Signalen (Teil 4.3)
18. Code-Symbol-Payload-Suche + Dateiname-Boost im Reranker (Teil 4.7 — hängt ab von 14 + 17)
19. Aktualitäts- + Autoritäts-Scoring-Signale (Teil 5.7) — im Reranker implementieren (Schritt 17)
20. `is_authoritative`-Flag bei Dokumenten (Schema-Teil von Teil 5.7 — nötig für Schritt 19)

**Post-Tender: Größere RAG-Arbeit**
21. Phase 6.1 — Zusammenfassungs-Embeddings
22. Themenverschiebungs-Erkennung für adaptives Chunking (Teil 5.5)
23. Figur+Beschriftung-Kohäsion im Chunker (Teil 5.1)
24. Retrieval-Qualitätsmetriken / Eval-Framework (Teil 5.8) + LLM-als-Richter Auto-Eval (Teil 6.1)
25. Corrective RAG / CRAG (Teil 6.1)
26. Adaptives RAG-Routing (Teil 6.1)
27. Phase 3 — Bild-Speicher-Migration (wenn OCR-Parallelprojekt bereit)
28. Phase 2/8 — OCR-Abstraktion + Multimodalität (inkl. Docling HierarchicalChunker 5.2, Formel-Anreicherung 5.4, mehrseitige Figuren-Zusammenführung 5.3)
29. Mehrsprachiges Embedding-Modell-Evaluation (Teil 5.9 — bge-m3 / E5-Mistral)

**Plattform & Observability (laufend)**
30. Follow-up-Prompt-Vorschläge (Teil 2)
31. Persistentes Nutzer-Gedächtnis (Teil 2)
32. Input-/Output-Guardrails (Teil 6.2)
33. Dokument-Level-RAG-Zugriffskontrolle (Teil 6.2)
34. Langfuse / OTel Trace-Integration (Teil 6.3)
35. Prompt-Versionierungs-Registry (Teil 6.3)
36. Kosten-Observability-Dashboard (Teil 6.3)
37. Chat-Verzweigung / Konversationsbaum (Teil 2)
38. SCIM 2.0-Provisionierung (Teil 3)
39. GraphRAG — Entity-Graph (Teil 6.1, großer Aufwand, separate Phase)

---

## Technische Hinweise

- `bcrypt` auf `==4.0.1` pinned — nicht upgraden; bricht passlib
- Azure GPT: kein `temperature`-Parameter, `max_completion_tokens` statt `max_tokens`, Auth via `api-key`-Header
- Alle neuen Tabellen: `app_*` oder `pool_*` Präfix-Konvention
- FastAPI Streaming-Endpunkte: immer `response_model=None` setzen
- pgvector muss im Supabase Dashboard aktiviert sein vor jeder RAG-Tabellen-Erstellung
- Vollständige RAG-Architektur-Begründung: siehe `xqt5-ai-plattform-dri/RAG-VERBESSERUNGSPLAN.md`
- Phase-Abschlussstatus: siehe `xqt5-ai-plattform-dri/RAG-STATUS.md`
