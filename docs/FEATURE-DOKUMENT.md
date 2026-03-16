# Feature-Dokument

## Produktziel
Eine Enterprise-fähige AI-Hub-Plattform mit Multi-LLM-Orchestrierung, zentralem Wissenszugriff, Workflows und Governance.

## Verbindliche Scope-Regel
1. Es wird keine Funktion aus `llm-council` in den Hub-Code übernommen.
2. Benötigte Fähigkeiten von `llm-council` werden nur über eine externe API-Integration genutzt.

## Phase 0: MVP (umgesetzt 2026-02-14)
1. Chat mit Konversationsverwaltung (Erstellen, Laden, Löschen)
2. Persistenz in Supabase (llm-council-Tabellen: `conversations`, `messages`)
3. Basale Rollen-/Auth-Vorbereitung (`users`, JWT-Basis im Backend)
4. Grundlegendes Kosten-/Nutzungstracking-Schema (`token_usage`)
5. Bereitstellung auf Coolify mit getrenntem Frontend-/Backend-Service

## Phase A: Core Chat Enhancement (umgesetzt 2026-02-15)
1. Echte LLM-Anbindung über direkte Provider-APIs (OpenAI, Anthropic, Google, Mistral, X.AI, Azure OpenAI)
2. Eigene Chat-Tabellen (`chats`, `chat_messages`) — getrennt von llm-council
3. SSE-Streaming mit Coolify-kompatiblen Headers
4. Modellauswahl (Dropdown) und Temperatur-Steuerung (Slider)
5. Auto-Benennung von Konversationen nach erster Nachricht
6. Markdown-Rendering für Assistant-Nachrichten
7. Frontend-Refactor in Component-Architektur (7 Komponenten)

## Phase B: User & Kosten-Management (umgesetzt 2026-02-15)
1. Eigene `app_users` Tabelle (komplett getrennt von llm-council `users`)
2. Auth-Modul: Register, Login, JWT Access (30min) + Refresh (7d)
3. Alle Conversation-Endpoints geschützt mit Ownership-Check
4. Token-Usage Tracking in eigener `chat_token_usage` Tabelle (Kosten pro Anfrage)
5. Usage-Widget in Sidebar (Tokens, Kosten, Anfragen)
6. Login-/Register-Screen im Frontend
7. Einfaches Admin vs. Normaluser (Gruppen auf Phase D verschoben)

## Phase C: Wissen & Assistenten (umgesetzt 2026-02-16)
### Schritt 1: KI-Assistenten + Prompt-Templates (umgesetzt)
1. Konfigurierbare KI-Assistenten (System-Prompts, Modell/Temperature-Override, Icons)
2. Globale Assistenten (nur Admins) + persönliche Assistenten
3. System-Prompt Injection bei Chat mit Assistent
4. Prompt-Templates mit Platzhalter-Syntax ({{variable}})
5. Template-Picker in Message-Input
6. Assistenten-Selector in Sidebar + Manager-Modal
7. Template-Manager-Modal
### Schritt 2: File Upload + RAG-Pipeline (umgesetzt 2026-02-16)
1. Datei-Upload (PDF, TXT, PNG, JPG, JPEG, WEBP) pro Chat (API-seitig optional auch ohne Chat-ID)
2. Text-Extraktion via Mistral OCR API (PDF/Bild) bzw. UTF-8 (TXT)
3. Paragraph-aware Chunking mit konfigurierbarer Größe und Overlap
4. OpenAI Embeddings (text-embedding-3-small, 1536 Dimensionen)
5. pgvector HNSW-Index für schnelle Cosine-Similarity-Suche
6. Automatische RAG-Kontext-Injection in Chat-Nachrichten
7. Source-Attribution unter Assistant-Antworten
8. Upload-Button, Document-Tags, Source-Tags im Frontend

## Phase D: Enterprise (teilweise umgesetzt 2026-02-16)
### Admin-Dashboard + Audit-Logs (umgesetzt)
1. Admin-Dashboard mit Tab-Navigation (Benutzer, Kosten, Statistiken, Modelle, Audit-Logs, Provider)
2. Benutzer-Verwaltung: Active/Admin-Toggle mit Selbstschutz
3. Kosten-Dashboard: Globale Totals + Per-User Aufschlüsselung
4. System-Statistiken: Users, Chats, Messages, Assistenten, Templates
5. Modell-Konfiguration via DB (app_model_config) statt hardcoded — Enable/Disable, Default
6. Audit-Logs: Auth-, Admin-, Chat-Events mit fire-and-forget Logging
7. Paginierte Audit-Log-Anzeige mit Aktions-Filter
### Provider-Key-Verwaltung + Azure OpenAI (umgesetzt)
1. DB-verwaltete Provider API-Keys (Fernet-verschlüsselt) mit Env-Fallback
2. Admin-UI: Provider-Keys Tab mit Save/Delete/Test pro Provider
3. Azure OpenAI als LLM-Provider (Deployment-Name Lookup, GPT-5.x Handling)
4. Azure-spezifische Konfiguration (Endpoint-URL, API-Version) in DB und UI
5. Deployment-Name Spalte in Modell-Konfiguration für Azure-Modelle
### Security Hardening (umgesetzt 2026-02-17)
1. Rate Limiting pro Endpoint (per-User bei gültigem Token, per-IP als Fallback)
2. Redis-backed Rate Limit Storage (Fallback: In-Memory)
3. Token Version Revocation für sofortige Session-Invalidierung bei User-Deaktivierung
4. is_active Prüfung auf allen Auth-Flows (Access-Token UND Refresh-Token)
5. Proxy-Header-Konfiguration für korrekte IP-Erkennung hinter Reverse-Proxy
### Admin User Löschen + Default-Modell Fix (umgesetzt 2026-02-17)
1. Admin User Soft-Delete (is_active=false + Session-Invalidierung) via DELETE Endpoint
2. Selbstschutz: Admin kann sich nicht selbst löschen
3. Deaktivierte User standardmäßig ausgeblendet, mit Toggle einblendbar (grau dargestellt)
4. Default-Modell aus DB (`is_default` in `app_model_config`) wird jetzt vom Frontend respektiert

## Phase E: Pools — Geteilte Dokumentensammlungen (umgesetzt 2026-02-18)
Pools sind geteilte Dokumentensammlungen, in denen mehrere Nutzer Dokumente ablegen und per Chat RAG-gestützte Fragen dazu stellen können.

### Kernfeatures
1. Pool erstellen mit Name, Beschreibung, Icon und Farbe
2. Dokumente in Pool hochladen (PDF, TXT, PNG, JPG, JPEG, WEBP) — Chunking + Embedding wie bei bestehender RAG-Pipeline
3. 4-stufiges Berechtigungsmodell: Viewer (lesen + fragen), Editor (+ Dokumente verwalten), Admin (+ Mitglieder verwalten), Owner (implizit, immer Admin)
4. Mitglieder einladen per Username (Admin+)
5. Share-Link generieren mit Rolle und optionalem Limit (max Uses, Ablaufdatum)
6. Shared Pool-Chat: Alle Mitglieder sehen denselben Chatverlauf mit RAG-Kontext
7. Private Pool-Chats: Jeder Nutzer kann eigene private Chats gegen Pool-Dokumente führen
8. RAG-Suche auf Pool-Scope (nur Dokumente des Pools, nicht des Users)
9. Source-Attribution in Pool-Chats
10. Dokumentvorschau im Pool-Dokumenttab (Textvorschau für PDF/TXT, Bildvorschau für Bild-Uploads)

### Neue Tabellen
- `pool_pools` — Pool-Metadaten + owner_id
- `pool_members` — Mitgliedschaften mit Rolle (UNIQUE pool_id + user_id)
- `pool_invite_links` — Share-Links mit Token, Rolle, max_uses, expires_at
- `pool_chats` — Chats (shared + private via is_shared Flag)
- `pool_chat_messages` — Nachrichten mit user_id
- `app_documents` erweitert um `pool_id` Spalte

### Neue Backend-Module
- `pools.py` — Pool CRUD, Members, Invites, Chats, Dokumentvorschau
- API-Endpunkte unter `/api/pools/...` inkl. Dokumentvorschau

### Neue Frontend-Komponenten
- PoolList, CreatePoolDialog, PoolDetail (Tabs: Dokumente/Chats/Mitglieder)
- PoolDocuments, PoolChatList, PoolChatArea, PoolMembers, PoolShareDialog

### Phase E Update: Pool-Dokumentvorschau (umgesetzt 2026-02-19)
1. Neuer API-Endpunkt: `GET /api/pools/{pool_id}/documents/{document_id}/preview`
2. Rollenmodell: Zugriff ab Pool-Rolle `viewer`
3. Rückgabe enthält gekürzte Textvorschau (`text_preview`) inkl. Längen-/Truncation-Info
4. Für Bild-Dokumente wird optional `image_data_url` aus `app_document_assets` geliefert
5. Frontend: `PoolDocuments` ergänzt um Vorschau-Button und Modal

## Phase RAGplus: RAG-Qualitätsverbesserungen + UX (umgesetzt 2026-02-22)

### Verbessertes Chunking (Ansatz A+B)
1. **Markdown-Section-aware Chunking**: Überschriften erkennen, Sektionsgrenzen respektieren, Breadcrumb-Header in jeden Chunk einbetten
2. **Token-basierte Chunk-Größe**: 512 Tokens (statt 1500 Zeichen), 50 Tokens Overlap — präzise Größenkontrolle via tiktoken
3. **Sentence Boundary Respect**: Chunks werden an Satzgrenzen aufgeteilt, keine abgeschnittenen Sätze
4. **Admin Re-Chunk Feature**: Bestehende Dokumente per Knopfdruck mit der neuen Strategie neu chunken — mit Live-Fortschrittsanzeige im Admin-Dashboard

### BM25 via PostgreSQL Full-Text Search
5. **BM25-Suche**: Ersetzt ILIKE-Keyword-Supplement durch native PostgreSQL FTS (`tsvector` GENERATED STORED, GIN-Index, `websearch_to_tsquery('german', ...)`, `ts_rank_cd`)
6. **Reciprocal Rank Fusion (RRF)**: Vector-Suche und BM25-Suche werden per RRF (k=60) zu einem gemeinsamen Ranking kombiniert — robuster als reine Score-Addition
7. **Keine Extension nötig**: `tsvector` / GIN / `ts_rank_cd` sind built-in PostgreSQL — Supabase-kompatibel ohne zusätzliche Extensions

### UX-Verbesserungen
8. **Sidebar 50:50 Split**: Pools und Conversations teilen sich den Sidebar-Platz 50:50 — beide Sektionen sind gleichzeitig sichtbar und scrollen unabhängig
9. **Drag-to-Resize Sidebar**: Ziehbarer Divider zwischen Pools und Conversations für individuelle Aufteilung (15-80%)
10. **Upload-Fortschrittsanzeige**: Echtzeit-Fortschrittsbalken beim Hochladen (File-Transfer % + Server-Processing-Shimmer) — Chat und Pool

### Zitatmodus — Source-Excerpts (umgesetzt 2026-02-22)
11. **Collapsible Source-Excerpts**: Jede RAG-Quelle zeigt per Klick den relevanten Textauszug (max. 350 Zeichen, Breadcrumb-Prefix entfernt)
12. **Seitenangabe**: Quellen-Tags zeigen die Seitenzahl des Chunks (`S. 3`) wenn vorhanden
13. **Breadcrumb-Stripping**: Auszug beginnt direkt mit dem inhaltlichen Text, nicht dem Strukturpfad

### Seitenzahlen in Zitaten (umgesetzt 2026-02-22)
14. **Page-Marker-Injection**: `<!-- page:N -->` Kommentare werden von `documents.py` vor jeder Seite in den OCR-Text eingefügt
15. **Chunk-Level Page-Number**: `chunk_text()` parsed die Marker und speichert `page_number` pro Chunk
16. **DB + RPC**: `app_document_chunks.page_number` Spalte, beide RPCs geben `page_number` zurück
17. **Frontend**: `SourceDisplay.jsx` zeigt `(S. N)` neben dem Dateinamen

### Embedding-Provider-Auswahl (umgesetzt 2026-02-22)
18. **Admin-UI**: Retrieval-Tab erlaubt Wahl zwischen OpenAI und Azure OpenAI als Embedding-Provider
19. **Azure-Embedding**: Nutzt `api-key` Header, Deployment-basierte URL, kein `model`-Feld im Body
20. **Konfiguration**: Provider + Deployment-Name in `app_runtime_config` (rag_settings JSONB)
21. **Kostentracking**: `record_usage()` verwendet den tatsächlichen Provider (nicht hardcoded OpenAI)

### Automatische Dokument-Zusammenfassung (umgesetzt 2026-02-22)
22. **LLM-Zusammenfassung beim Upload**: Nach OCR + Chunking wird automatisch ein LLM-Call abgesetzt (Default-Modell, 2-3 Sätze, Deutsch)
23. **Speicherung**: `app_documents.summary TEXT` Spalte, befüllt direkt nach Verarbeitung
24. **Pool-Dokumentliste**: Summary erscheint als 2-zeilig geklammter Text unter dem Dateinamen
25. **Vorschau-Modal**: Summary als kursives Blockzitat vor dem Volltext
26. **Chat-Dokumente**: Summary als Tooltip beim Hover über den Dokument-Tag
27. **Silent-Fail**: Fehler bei der Zusammenfassung blockieren den Upload nicht

---

## Noch geplant

### Retrieval & Wissensquellen

**Multi-Pool-Retrieval**
RAG-Suche über mehrere Pools gleichzeitig. Nutzer wählt im Chat welche Pools als Wissensquellen aktiv sind. Ergebnisse werden per RRF über Pool-Grenzen hinweg gerankt. Sinnvoll wenn Wissen thematisch auf mehrere Pools verteilt ist.

**Nextcloud-Import**
Ordner eines Nextcloud-Accounts als Datenquelle für einen Pool. Dokumente werden per WebDAV abgerufen und automatisch verarbeitet. Synchronisierung kann manuell oder per geplantem Job ausgelöst werden.

**SharePoint / OneDrive-Import**
Analog zu Nextcloud via Microsoft Graph API. Besonders relevant in Azure-Umgebungen.

**URL-Import**
Webseite per URL in einen Pool laden. Text wird extrahiert (Crawl + HTML-Parsing), als Dokument gespeichert und durch die bestehende RAG-Pipeline geführt.

**Globaler Wissenspool**
Admin-verwalteter Pool der bei jeder RAG-Suche automatisch mitläuft — ohne dass der User ihn explizit auswählen muss. Geeignet für unternehmensweite Richtlinien, FAQs, Handbücher.

**GraphRAG — Wissengraph-gestütztes Retrieval**
Ergänzung des bestehenden Chunk-Retrievals um einen Wissensgraphen: Beim Dokument-Upload extrahiert ein LLM-Schritt Entitäten (Personen, Unternehmen, Projekte, Orte) und ihre Beziehungen. Diese werden als Graph in PostgreSQL (via `age`-Extension oder separater Graph-DB wie Neo4j) gespeichert. Bei der RAG-Suche wird neben dem Vektor-/BM25-Retrieval auch der Graph traversiert — so lassen sich Beziehungsfragen beantworten ("Welche Projekte verbinden Person X mit Unternehmen Y?"), die reines Chunk-Retrieval nicht zuverlässig löst. Beide Ergebnisquellen werden per RRF zusammengeführt. Besonders wertvoll für Unternehmensstrukturen, Vertragsnetze und Projektzusammenhänge.

---

### Lokale Modelle (On-Premise LLM)

**Ollama-Integration**
Ollama stellt lokal laufende Open-Source-Modelle (Llama, Mistral, Qwen, Gemma u. a.) über eine OpenAI-kompatible REST-API bereit. Integration über einen konfigurierbaren `base_url`-Parameter in `llm.py` — kein neuer Provider-Code nötig, da Ollama das OpenAI-Format spricht. Admin trägt die Ollama-URL (z. B. `http://ollama:11434`) im Provider-Tab ein; Modelle werden über `/api/tags` abgerufen und in `app_model_config` importiert.

**LocalAI / vLLM / LM Studio**
Weitere OpenAI-kompatible Serving-Backends (LocalAI, vLLM, LM Studio Server) können analog zu Ollama eingebunden werden — gleicher Mechanismus, nur andere `base_url`. Ermöglicht GPU-beschleunigtes Serving auf eigener Hardware ohne Cloud-Abhängigkeit.

**Datenschutz-Modus**
Admin kann einzelne Modelle als "lokal" kennzeichnen (`is_local` Flag in `app_model_config`). Für Datenschutz-sensible Konversationen kann erzwungen werden, dass nur lokale Modelle verwendbar sind — Cloud-Provider werden für diese Chats gesperrt.

**Embedding-Modelle lokal**
Neben Chat-Modellen können auch Embedding-Modelle lokal betrieben werden (z. B. `nomic-embed-text` via Ollama). Konfigurierbar als dritter Embedding-Provider neben OpenAI und Azure OpenAI im Retrieval-Tab des Admin-Dashboards.

---

### Dokumentformate

**Word (.docx)**
Verarbeitung via `python-docx`. Überschriften und Tabellenstruktur werden erhalten und fließen in das Chunking ein.

**Excel (.xlsx)**
Verarbeitung via `openpyxl`. Tabelleninhalt wird strukturiert gespeichert — Vorstufe zur strukturierten Datenabfrage (SDE).

**PowerPoint (.pptx)**
Folien als Seiten, Folientitel als Überschriften. Ermöglicht RAG auf Präsentationen.

**E-Mail (.eml / .msg)**
Betreff + Body + Anhänge werden verarbeitet. Ermöglicht passiven Wissensaufbau aus E-Mail-Archiven.

**HTML / Markdown**
Direkte Verarbeitung ohne OCR-Umweg. Besonders für Web-Exporte und Dokumentationen.

---

### Suche & Retrieval

**Cross-Pool-Suche**
Globale Volltextsuche über alle Pools + eigene Dokumente in einer einzigen Anfrage. Ergebnisse zeigen die Herkunft (Pool-Name + Dokument).

**Metadaten-Filter**
Suche auf Dokumenttyp, Datum, Tag oder Pool eingrenzen. Beispiel: "Suche nur in Rechnungen aus 2025".

**Chunk-Debugger im Admin**
Für eine Testfrage anzeigen: welche Chunks wurden gefunden, mit welchem Score, aus welchem Dokument/Pool. Hilfreich um Retrieval-Qualität zu beurteilen.

**Einzeldokument-Fokus**
Nutzer kann einen Chat hart auf ein bestimmtes Dokument beschränken (`document_id`-Filter). Alle anderen Dokumente werden ignoriert.

**Duplikat-Erkennung**
Warnung wenn ein Dokument mit identischem oder sehr ähnlichem Inhalt bereits im Pool existiert (Embedding-Similarity beim Upload).

---

### Tabellen-Extraktion & strukturierte Abfragen (SDE — Structured Data Extraction)

**Motivation**: Hochgeladene Dokumente (Rechnungen, Berichte, Listen) enthalten häufig Tabellen mit numerischen Werten. Heute landen diese als Fließtext im RAG-Chunk — Berechnungen wie "Summe aller Rechnungen im Januar" sind so nicht zuverlässig möglich.

**Konzept**:
1. **Erkennung & Extraktion**: Beim Upload werden Markdown-Tabellen aus dem OCR-Output geparst (Mistral OCR liefert Tabellen bereits als `| Spalte | Wert |`). Ein LLM-Schritt kann zusätzlich unstrukturierte Tabellen normalisieren.
2. **Strukturierte Speicherung**: Neue Tabelle `app_document_tables` speichert Tabellen pro Dokument:
   - `headers` (JSONB): Spaltenbezeichnungen, z. B. `["Datum", "Betrag", "Beschreibung"]`
   - `rows` (JSONB): Zeilendaten, z. B. `[["01.01.2026", "150.00", "Beratung"], ...]`
   - `page_number`, `table_index`, `caption`, `raw_markdown`
3. **Abfragen — zwei Ansätze**:
   - **Direkt via SQL/JSONB**: Aggregationen wie `SUM`, `AVG`, `COUNT` direkt in PostgreSQL auf den JSONB-Daten
   - **Text-to-SQL**: Nutzer stellt Frage in natürlicher Sprache → LLM generiert SQL-Query auf den Tabellendaten → Ergebnis wird zurückgegeben
4. **Integration in Chat-RAG**: Bei Zahlen-/Berechnungsfragen werden automatisch Tabellendaten statt (oder zusätzlich zu) Text-Chunks einbezogen

**Beispiel-Flow**:
> Upload: 12 Rechnungs-PDFs → Tabellen extrahiert und gespeichert
> User: *"Wie hoch ist die Gesamtsumme der Rechnungen im Januar 2026?"*
> System: Tabellendaten abfragen → `SELECT SUM(betrag::numeric) WHERE datum LIKE '01/2026%'` → *"Gesamtsumme Januar 2026: 4.320,00 €"* (Quellen: Rechnung-001.pdf, Rechnung-003.pdf, ...)

---

### Dokumente & Wissensmanagement

**Dokument-Tagging**
Manuell vergebene oder LLM-automatisch generierte Tags pro Dokument (z. B. "Rechnung", "Vertrag", "Protokoll"). Ermöglicht gefilterte RAG-Suche.

**Dokumentversionen**
Bei erneutem Upload eines Dokuments mit identischem Dateinamen wird die alte Version archiviert statt überschrieben. Versionsverlauf im UI einsehbar.

**Ablaufdatum für Dokumente**
Dokumente können mit einem Ablaufdatum versehen werden. Nach Ablauf werden sie automatisch aus dem RAG-Index deaktiviert und im UI als "abgelaufen" markiert.

**Lücken-Erkennung (Knowledge Gap Detection)**
Das System erkennt wenn Fragen wiederholt keine guten RAG-Treffer liefern und meldet im Admin-Dashboard: "Zu folgenden Themen fehlen Dokumente." Basis: niedrige Similarity-Scores als Signal.

---

### Chat & UX

**Quelldokument direkt öffnen**
Klick auf einen Zitat-Tag öffnet die Dokumentvorschau direkt an der richtigen Stelle (Seite/Abschnitt). Erfordert Verlinkung von chunk_index → Vorschau-Offset.

**Konversations-Export**
Chat-Verlauf als PDF oder Markdown exportieren — inkl. Quellenhinweisen. Größtenteils Frontend-seitig umsetzbar.

**Sprachausgabe (TTS)**
Text-to-Speech für Antworten via OpenAI TTS API. Konfigurierbar per Assistent oder global.

---

### Zusammenarbeit

**Pool-Benachrichtigungen**
Pool-Mitglieder erhalten eine Benachrichtigung (In-App oder E-Mail) wenn neue Dokumente hochgeladen oder Pool-Chats aktualisiert werden.

**Kommentare auf Nachrichten**
Nutzer können KI-Antworten annotieren oder mit Kommentaren versehen — für interne Qualitätssicherung oder Teamdiskussion.

**Konversation teilen**
Read-only Deeplink auf eine Konversation. Empfänger sieht den Verlauf ohne eigenen Account (oder mit, je nach Konfiguration).

---

### Automatisierung

**Geplanter Import**
Nextcloud/SharePoint-Ordner automatisch synchronisieren (täglich oder bei Änderung).

**Webhook bei neuem Dokument**
Externes System triggern wenn ein Pool-Dokument verarbeitet wurde. Konfigurierbar pro Pool.

**Workflow-Engine**
Automatisierte mehrstufige Abläufe: Dokument eingeht → Zusammenfassung erstellen → Ergebnis in Pool-Chat posten → Webhook auslösen. Visueller Editor für Workflows geplant.

**Geplante Neuverarbeitung**
Dokumente zu einem definierten Zeitpunkt automatisch neu chunken und reindexieren.

---

### Analytics & Qualität

**Abfrage-Analytics**
Welche Themen werden am häufigsten gefragt, welche Dokumente am häufigsten abgerufen — sichtbar im Admin-Dashboard.

**RAG-Qualitätsmetrik**
Durchschnittliche Similarity-Scores und Retrieval-Trefferquote über die Zeit.

**Kostenaufschlüsselung nach Pool**
Im Admin-Dashboard: welcher Pool verursacht wie viele Embedding- und LLM-Kosten — für interne Verrechnung oder Budgetkontrolle.

**Dynamische Preistabelle für Token-Kosten**
Die Preise pro Modell (Input/Output in USD pro 1M Tokens) sind aktuell hardcodiert in `backend/app/token_tracking.py` (`COST_PER_1M_TOKENS`). Änderungen erfordern ein Code-Edit + Deployment. Geplant: DB-Tabelle `app_model_pricing` zur Verwaltung über das Admin-Dashboard, ohne Codeänderung.

---

### KI-Features

**Agent-Modus**
LLM plant selbst mehrstufige Aufgaben: recherchieren (RAG), berechnen (SDE/Tabellen), zusammenfassen, Ergebnis formatieren — ohne dass der Nutzer jeden Schritt vorgibt.

**Auto-Tagging**
LLM vergibt beim Upload automatisch Kategorien und Tags basierend auf dem extrahierten Text.

**Übersetzung**
Dokumente oder Chat-Antworten on-the-fly übersetzen. Wahlweise beim Upload oder im Chat.

---

### Enterprise & Compliance

**Abteilungs-/Team-Hierarchie**
Nutzer in Abteilungen organisieren; Pools können auf Abteilungsebene sichtbar oder eingeschränkt sein.

**Storage-Limit pro User/Pool**
Maximale Dokumentgröße oder Chunk-Anzahl konfigurierbar — für Kostenkontrolle und faire Nutzung.

**DSGVO-Tools**
Nutzer-Daten-Export (alle Konversationen, Dokumente, Nutzungsdaten) und vollständige Löschung auf Anfrage.

**Compliance-Modus**
Konfigurierbar: bestimmte LLM-Provider sperren (z. B. nur EU-Hosting), Audit-Pflicht für alle KI-Antworten.

**SSO (OIDC/SAML)**
Anbindung an Unternehmens-Identity-Provider (Azure AD, Okta, Google Workspace) für Single Sign-On und automatische Rollenvergabe.
