# Prod-Upgrade-Playbook

Schritt-für-Schritt-Plan für den geplanten Wechsel von Prod auf den aktuellen
Codebase (`xqt5-ai-plattform`-Repo) mit der neuen Coolify-Topologie. **Lebende
Datenbank, kein Datenverlust toleriert.** Vor jedem Schritt: nicht
weitermachen wenn der vorherige nicht erwartungsgemäß abgeschlossen wurde.

Verwandt: `docs/SECURITY.md` (Sicherheitsmodell), `IMPLEMENTIERT.md`
(Feature-Historie), Memory `project_xqt5_supabase.md` (DB-Architektur).

---

## Vorbedingungen am Tag des Upgrades

- [ ] Wartungsfenster mit Stakeholdern abgestimmt (mindestens 30 Min Puffer).
- [ ] Aktuelle Prod-URL und Coolify-Zugang bestätigt.
- [ ] Aktuelle Prod-Branch / Coolify-App-Konfiguration abgespeichert
      (Screenshot der Coolify-UI für die zwei alten App-Definitionen — zum
      Rollback brauchst du die exakte vorherige Konfiguration).
- [ ] Backend-Coolify-Env-Vars exportiert (`OPENAI_API_KEY`, `MISTRAL_API_KEY`,
      `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `COHERE_API_KEY`, `XAI_API_KEY`,
      `MAMMOUTH_API_KEY`, plus `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`,
      `CORS_ORIGINS`). Kopierfähig in einem sicheren Notepad bereithalten —
      die neue App-Konfiguration wird sie wieder brauchen.
- [ ] `SBKEY` und `SBURL` aus dem Backend-Env in deinem Laptop-Terminal
      gesetzt (siehe `docs/SECURITY.md` Verifikations-Block).

---

## 1. Backup der Datenbank

**Pflicht** vor jeder Migration. Es gibt aktuell keine automatischen Backups
(siehe TODO `🟢 Backups`-Punkt). Manuell mittels `pg_dump`:

### Option A — SSH auf den Coolify-Host

```bash
ssh user@coolify-host
docker ps | grep supabase-db    # → notiere den Container-Namen
docker exec supabase-db-<id> pg_dump -U postgres -Fc -d postgres \
    > /home/user/prod_backup_$(date -u +%Y%m%dT%H%M%SZ).dump
ls -lh /home/user/prod_backup_*.dump   # bestätige Größe (≥ einige MB)
```

`-Fc` = Custom-Format (komprimiert). Restore-Befehl:
`pg_restore -U postgres -d postgres /pfad/prod_backup_*.dump`.

### Option B — Über supabase-meta `/pg/query` (read-only Schema + Daten dump)

Nicht empfehlenswert für vollständigen Restore — `/pg/query` kann nur SQL
ausführen, kein `pg_dump`-äquivalentes Binärformat erzeugen. Nur als
schwacher Plan B wenn SSH nicht verfügbar ist.

### Verifikation des Backups

```bash
docker run --rm -v $(pwd):/work postgres:15 \
    pg_restore --list /work/prod_backup_*.dump | head
```

Sollte die wichtigsten Tabellen auflisten (`app_users`, `app_documents`,
`app_document_chunks`, `pool_pools` etc.). Wenn nicht: Backup ist kaputt,
Upgrade abbrechen.

**Backup an einen sicheren Ort kopieren**, der den Coolify-Host überlebt
(lokales Laptop, S3-Bucket, andere Maschine). Der Punkt eines Backups ist,
ihn auch dann zu haben wenn die Maschine ausfällt.

---

## 2. Schema-Vorprüfung — passt das Prod-Schema zum neuen Repo?

Das alte Repo könnte Migrationen haben, die im neuen Repo nicht existieren,
oder umgekehrt. Vor Anwendung der neuen Migrationen prüfen, dass die
gemeinsame Basis konsistent ist.

```sh
# Erwartete Spalten der "alten" Migrationen (1-26 vor 2026-05-06):
sbq https://supabase.xqtfive.com "select column_name from information_schema.columns where table_name='app_documents' order by ordinal_position"
sbq https://supabase.xqtfive.com "select column_name from information_schema.columns where table_name='app_document_chunks' order by ordinal_position"
sbq https://supabase.xqtfive.com "select column_name from information_schema.columns where table_name='app_document_assets' order by ordinal_position"
```

Erwartung pro Tabelle (Stand 2026-05-07 vor A1/A2):
- `app_documents`: id, user_id, chat_id, filename, file_type, file_size_bytes, extracted_text, chunk_count, status, error_message, created_at, pool_id, summary
- `app_document_chunks`: id, document_id, chunk_index, content, embedding, content_fts, created_at, page_number, section_path
- `app_document_assets`: id, document_id, user_id, pool_id, page_number, asset_type, storage_path, mime_type, width, height, caption, ocr_text, embedding, created_at

Wenn eine Spalte aus dieser Liste **fehlt** auf prod: das alte Repo hatte
einen anderen Migrationspfad. Manuelle Reconciliation nötig — STOP, mit
einem Senior-Dev abklären bevor weitergemacht wird.

Wenn alle Spalten **da** sind: prod ist auf demselben Schemastand wie
unser Repo's Migration 26 (`20260226_rag_sources_persistence.sql`). Sicher,
A1 und A2 anzuwenden.

---

## 3. Anwendung der ausstehenden Migrationen

Stand der ausstehenden Migrationen auf prod (verifiziert 2026-05-07):

1. `20260506_a_content_hash.sql` — Spalte + 2 partielle Indizes für Upload-Dedup
2. `20260506_c_asset_phash_recurring.sql` — Bild-pHash-Spalten + RPC-Update

(20260506_b und 20260507 sind bereits angewendet — siehe `SECURITY.md`.)

### Anwendung

In Supabase Studio (Prod) → SQL Editor → für jede Datei in der oben
genannten Reihenfolge:

1. Inhalt der Datei aus dem Repo kopieren
2. Im Editor einfügen
3. **Run** klicken
4. Ausgabe muss "Success. No rows returned." sein
5. Falls Fehler: STOP, schau in `docs/SECURITY.md` Sektion "Verifikation"
   für Diagnostik. Backup ist da — Restore wenn nötig.

### Verifikation nach jeder Migration

```sh
sbq https://supabase.xqtfive.com "select count(*) from information_schema.columns where table_name='app_documents' and column_name='content_hash'"
# erwartet: [{"count":1}]
sbq https://supabase.xqtfive.com "select count(*) from information_schema.columns where table_name='app_document_assets' and column_name='phash'"
# erwartet: [{"count":1}]
```

Nicht weitermachen wenn eine der Verifikationen einen anderen Wert liefert.

---

## 4. Coolify-App-Umstellung

### Vorbereitung

- [ ] Aktuelle alte Apps in Coolify nicht löschen — pausieren oder umbenennen
      mit einem `_OLD`-Suffix. So bleibt der Rollback-Pfad offen.

### Neue Apps erstellen

Zwei separate Coolify-Anwendungen anlegen:

#### Backend-App
- Repo: `<URL des neuen Repos>` Branch: `dri` (oder Production-Branch)
- Build-Pack: **Docker Compose**
- Base Directory: `/`
- Compose-Datei: `docker-compose.coolify.yml`
- Service: `backend` (laut compose)
- Port: 8001 (interner uvicorn-Port; Coolify mappt ihn auf den öffentlichen
  Hostnamen).
- Domain: gleiche Prod-Domain wie zuvor
- Env-Vars: alle aus dem Vorbedingungs-Export wieder eintragen. Keine
  zwischen-`SUPABASE_URL`/`SUPABASE_KEY`-Versions-Verwechslung — gleich wie
  vorher.

#### Frontend-App
- Repo: derselbe + Branch derselbe
- Build-Pack: **Docker Compose**
- Base Directory: `/`
- Service: `frontend`
- Port: 80
- Domain: gleiche Prod-Frontend-Domain
- Env-Vars: `VITE_API_BASE` zeigt auf die Backend-Domain (gleich wie zuvor).

### Erste Build-Versuche

1. Backend-App deployen. Build-Logs in Coolify beobachten.
2. Wenn der Build durchläuft: Container starten, Logs auf Fehler beim Start
   prüfen. Erwartete Logs:
   ```
   INFO:     Started server process
   INFO:     Application startup complete.
   ```
3. Wenn der Build fehlschlägt:
   - Häufige Fehler: fehlende Python-Dep (`pip install` Zeile), kaputter
     Pfad in `docker-compose.coolify.yml`
   - **Fix nicht durch Hot-Edit der laufenden App** — über git push den
     Fix einspielen, Coolify rebuild
4. Frontend-App genauso deployen.

---

## 5. Smoke-Test direkt nach Umstellung

Nicht nur „App lädt" prüfen — exakt diese Pfade durchklicken:

- [ ] Login mit existierendem Test-User (z.B. KKL aus dem dev-Test).
      Erwartung: Erfolg, alte Konversationen + Pools sichtbar (Daten
      überlebt das Upgrade weil Supabase nicht angefasst wurde).
- [ ] Pool öffnen → Übersichts-Tab lädt → Mitglieder + Chats + Dokumente
      korrekt angezeigt.
- [ ] Existierende Konversation öffnen → bestehende Nachrichten sichtbar.
- [ ] Neue Nachricht schicken: erwartet Antwort vom konfigurierten Modell.
- [ ] Neues Dokument hochladen (PDF, ~2-3 Seiten):
  - Erwartung: Upload geht durch, Status `processing` → `ready` innerhalb
    von ~30 Sekunden, Chunks und Embeddings erstellt.
  - SQL-Verifikation:
    ```sh
    sbq https://supabase.xqtfive.com "select status, chunk_count, content_hash from app_documents where filename='<deindateiname>' order by created_at desc limit 1"
    ```
- [ ] Mit dem neuen Doc chatten: erwartet RAG-Quellen in der Antwort.
- [ ] Admin-UI öffnen → Retrieval-Tab → vier Sektionen sichtbar (Embedding,
      Reranking, Kontextzusammenstellung, Kontextuelles Retrieval). Diese
      beweisen, dass die A1-Cherry-Pick-Frontend-Toggles und A1/A2-Backend-
      Migration korrekt sitzen.

Wenn ein Schritt fehlschlägt → in der Sektion "Rollback" weitermachen.

---

## 6. Rollback-Plan

Wenn nach dem Upgrade etwas grundlegend kaputt ist:

### Sofort-Rollback (Anwendungsebene, < 5 Min)

1. Coolify → neue Backend- und Frontend-Apps stoppen.
2. Coolify → `_OLD`-Apps wieder starten.
3. DNS/Domain-Routing falls nötig zurückbiegen (sollte automatisch sein
   wenn die Domain auf die Coolify-Apps zeigt und Coolify selbst routet).

### Datenbank-Rollback (nur wenn Migrationen Schaden anrichten)

Nur wenn die Migrationen aus Sektion 3 etwas Unerwartetes getan haben.
Symptome: SQL-Fehler in den Backend-Logs, Daten verschwunden, Spalten
fehlen. Verifikation per SQL-Query bevor man rollback startet.

```bash
ssh user@coolify-host
# Container droppen-und-restoren wäre brutal — sicherer: schemaisch zurücksetzen
docker exec -i supabase-db-<id> psql -U postgres -d postgres < restore_script.sql
```

Wo `restore_script.sql` gezielt die A1/A2-Spalten droppt:
```sql
ALTER TABLE app_documents DROP COLUMN IF EXISTS content_hash;
DROP INDEX IF EXISTS idx_app_documents_pool_hash;
DROP INDEX IF EXISTS idx_app_documents_user_hash;
ALTER TABLE app_document_assets DROP COLUMN IF EXISTS phash;
ALTER TABLE app_document_assets DROP COLUMN IF EXISTS recurring;
DROP INDEX IF EXISTS idx_app_document_assets_doc_phash;
-- match_document_assets RPC NICHT droppen — die alte Definition
-- aus 20260221_rag_scoped_search.sql wieder anwenden:
\i /pfad/zu/repo/supabase/migrations/20260221_rag_scoped_search.sql
```

### Vollständige DB-Wiederherstellung (Worst Case)

Wenn die Migrationen Daten zerstört haben (sollte nicht passieren bei
den geplanten Migrationen — sie sind alle additive ALTER TABLE):

```bash
docker exec -i supabase-db-<id> psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS postgres_old; ALTER DATABASE postgres RENAME TO postgres_old;"
docker exec -i supabase-db-<id> createdb -U postgres postgres
docker exec -i supabase-db-<id> pg_restore -U postgres -d postgres /home/user/prod_backup_*.dump
```

Dann Backend-Container neu starten. Sehr invasiv, nur Last Resort.

---

## 7. Post-Deploy-Checks (am Tag nach dem Upgrade)

- [ ] In den Backend-Logs nach Fehlern in den letzten 24h gegrept (z.B.
      `grep -i "error\|exception\|traceback" coolify_backend.log`).
- [ ] Sample existierender Pool-Chat geöffnet und eine Frage gestellt —
      RAG-Quellen werden korrekt referenziert.
- [ ] Neue Dokument-Uploads (mehrere zur Bestätigung) erfolgreich
      verarbeitet. Insbesondere ein PDF mit Bildern um pHash-Dedup zu
      validieren.
- [ ] Audit-Log enthält die letzten Logins und Upload-Events.
- [ ] Backup-Datei nicht gelöscht — mindestens 30 Tage aufbewahren.

---

## 8. Bekannte offene Punkte für nach dem Upgrade

Auch nach erfolgreichem Upgrade bleiben einige TODO-Items relevant
(siehe `docs/TODO.md`):

- [ ] Automatische DB-Backups konfigurieren — Voraussetzung für den
      Migration-Runner (siehe TODO `🟢 Migration-Runner`)
- [ ] `JWT_SECRET` rotieren um vom Supabase-JWT-Secret zu entkoppeln
      (`docs/SECURITY.md` Punkt 4b)
- [ ] Passwort-Reset für alle `app_users` erzwingen (Bcrypt-Hashes waren
      während der pre-2026-05-06-Lücke abgreifbar)
- [ ] `vector` Extension nach `extensions`-Schema verschieben (Hygiene)

---

## 9. Pre-Deploy-Checkliste (Stand 2026-05-11)

Bevor der nächste Prod-Cutover läuft, diese Punkte abarbeiten und im Playbook abhaken.

### 9a. Migrationsparität dev → prod

**Auf dev verifiziert 2026-05-11 (via Supabase Studio SQL):**
- `app_documents.content_hash` ✓ vorhanden (A1-Migration `20260506_a_content_hash.sql` applied).
- `app_document_assets.phash` + `recurring` ✓ vorhanden (A2-Migration `20260506_c_asset_phash_recurring.sql` applied).

**Auf prod: Status unbekannt.** Vor dem Cutover beide SELECTs gegen die Prod-Supabase ausführen:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'app_documents' AND column_name = 'content_hash';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'app_document_assets' AND column_name IN ('phash', 'recurring')
ORDER BY column_name;
```
Liefert die erste SELECT keine Zeile → A1 anwenden. Liefert die zweite SELECT weniger als 2 Zeilen → A2 anwenden. Beide Migrations-Files unter `supabase/migrations/`.

### 9b. Build-Pipeline auf neues Dockerfile umgestellt

Coolify-Backend-App baut seit 2026-05-11 mit `uv sync --frozen --no-dev --no-install-project` aus `backend/uv.lock`. Vor dem Prod-Cutover:
- Sicherstellen dass `backend/uv.lock` im Repo ist und commit-konsistent mit `backend/pyproject.toml`.
- Coolify-Cache leeren falls der Build den alten hardcoded-pip-Layer cached. Der erste Build mit dem neuen Dockerfile dauert ~30–60 s länger weil `pip install uv` als neuer Layer hinzukommt.
- Im laufenden Container nachprüfen: `python -c "import openpyxl, docx, xlrd; print('OK')"`. Wenn das `ModuleNotFoundError` wirft, ist das Image noch auf dem alten Dockerfile.

### 9c. Filetype-Test nach Deploy

Mindestens eine Datei jedes neuen Formats (`.md`, `.csv`, `.docx`, `.xlsx`, `.xls`) hochladen und auf `status='ready'` warten. Backend-Logs auf `Unsupported file type` oder `ModuleNotFoundError` prüfen.

### 9d. Phase-3-Observability-Log

`backend/app/rag.py` enthält ein `phase3=true`-Logging-Statement (Zeilen ~1354–1378) als stehende RAG-Beobachtungs-Telemetrie. Ehemals als „temporär bis Matrix-Sign-off" markiert; Verifikationsmatrix ist 2026-05-13 geparkt (siehe `docs/PHASE3-MATRIX-SHELVED.md`). Vor dem Prod-Cutover entscheiden: (a) auf prod auch behalten — Default-Empfehlung, gleiche Beobachtungs-Daten, kein PII (Doc-IDs + Scores, keine Prompts), (b) auf prod auf `DEBUG`-Level downgraden, oder (c) ganz entfernen. Wenn behalten: Log-Volume im Auge behalten, ggf. mit Coolify-Log-Rotation kombinieren.

### 9e. Versionsobergrenzen in `pyproject.toml`

`pyproject.toml` hat seit 2026-05-11 strikte Obergrenzen für `fastapi<1.0`, `pydantic<3.0`, `supabase<3.0`, und `bcrypt==4.0.1` (exakt — Projektregel). Beim Prod-Deploy darauf achten dass `uv.lock` nicht „mal eben" auf prod neu generiert wird; das Lockfile wird im Repo gepflegt und Coolify nutzt es read-only.

---

## Bildgenerierung — Migration und Deploy (2026-05-13)

### Reihenfolge

1. **Migrationen ausführen (in dieser Reihenfolge)**:
   1. `supabase/migrations/20260513_a_image_generation.sql` — Schema-Grundlage (3 Tabellen, 4 Spalten-Adds, Partial Unique Index).
   2. `supabase/migrations/20260513_b_widen_source_check.sql` — v2-Pre-Bake: erweitert die `app_generated_images.source` CHECK-Constraint um `'chat_slash'` und `'pool_chat_slash'` (idempotent, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`). Pydantic bleibt in v1 auf `Literal["studio"]` eng — die DB-Permissivität ist erst in v2 aktiv nutzbar.

   Beide via `supabase-meta /pg/query` oder Supabase-Dashboard SQL-Editor.
2. **Backend deployen**: Coolify triggert Rebuild aus dem neuen Commit.
3. **Frontend deployen**: Coolify triggert Rebuild des Frontend-Service.

### Migration — Idempotenz

Die Migration ist vollständig idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Sie kann ohne Auswirkungen mehrfach ausgeführt werden. Kein `DROP` in dieser Migration — alle Änderungen sind additiv. Bestehende Tabellen (`app_model_config`, `chat_messages`, `pool_chat_messages`) erhalten nur neue Spalten; keine bestehende Spalte wird geändert.

### Post-Deploy-Admin-Schritte (obligatorisch)

Ohne diese Schritte ist die Bildgenerierung nicht nutzbar:

1. Admin-Dashboard → Tab **Bildmodelle** → mindestens ein Modell registrieren (z. B. OpenAI `dall-e-3`).
2. Das neue Modell als Default setzen.
3. Optional: Tab **Bild-Stil** → globalen Stil-Präfix eintragen.

### Smoke-Tests nach Deploy

| Test | Erwartetes Ergebnis |
|---|---|
| Bilder-Tab öffnen und Prompt absenden | Bild erscheint in der Galerie; kein 500-Fehler im Backend-Log |
| Admin → Kosten → Bild-Kosten | Mindestens ein Eintrag mit `succeeded`-Status und `cost_usd > 0` |
| Admin → Audit | Einträge mit Action `image.generate` sichtbar |
| Eigenes Nutzerlimit über Admin versuchen zu ändern | HTTP 403, Fehlermeldung im UI |

### Rollback

Vor dem Commit das Tag `git tag pre-image-gen` setzen (nur lesen, kein Push — User-Aufgabe). Bei schwerwiegendem Fehler nach dem Deploy: `git reset --hard pre-image-gen` und neu pushen. Die neuen Tabellen (`app_generated_images`, `app_image_style_presets`, `app_user_limits`) und die neuen Spalten an bestehenden Tabellen bleiben in der DB — sie enthalten dann schlimmstenfalls leere Daten. Da alle Änderungen additiv sind, funktioniert der alte Code weiterhin korrekt neben den neuen leeren Tabellen.

### #3-Defense (relevant ab 2026-05-18 mit Fix #3)

`backend/app/image_gen.py:check_daily_cost_cap` ist jetzt defensiv gegen fehlende Tabellen (PROD pre-A2-Migration) und transiente Supabase-REST-Outages. Konkret: jeder der 3 Queries (`app_generated_images`-Aggregator, `app_user_limits`-Lookup, `app_settings`-Fallback) ist einzeln in `try/except` gewrappt, mit Logger-Warnung + Fallback-Default.

**Bedeutung für den PROD-Catchup-Track:** Image-Gen-Routen 500en nicht mehr hart wenn A2 noch nicht angewendet ist — der Code degradiert auf den Hard-Fallback `daily_limit = 5.0 USD` und protokolliert die fehlenden Tabellen via `logger.warning`. **ABER:** das ist Defense, keine Migration-Ersetzung. Ohne A2 funktionieren Cost-Tracking, Per-User-Limits und Audit-Visibility nicht korrekt — A2 muss trotzdem nachgezogen werden, nur ohne den vorherigen Hard-500-Druck.

### Traefik-Upstream-Timeout (relevant ab 2026-05-18 mit Fix #278)

`backend/app/image_gen.py` ruft die OpenAI- und xAI-Bildgenerierungs-Endpoints mit `httpx.AsyncClient(timeout=60.0)`. Coolifys Traefik hat per Default einen 60-s-Upstream-Timeout pro Service. Wenn in PROD gpt-image-1-Generierungen länger als 60 s benötigen (etwa bei HD-Qualität mit komplexen Prompts), entsteht ein 502 von Traefik **bevor** der Backend-Handler antworten kann.

**Wenn 502s nach Image-Gen-Calls in PROD-Logs auftauchen ohne entsprechende Backend-Logger-Einträge:** Traefik-Service-Config in Coolify anpassen, z. B. via Custom-Labels:

```
traefik.http.middlewares.image-timeout.headers.customResponseHeaders.X-Image-Timeout=120
# und passender Service-Level-Timeout im Coolify-UI auf 120 s
```

Auf DEV ist das aktuell nicht beobachtet — die meisten Generierungen liegen unter 60 s. Wenn das ändert oder ein Image-Modell mit höherer Latenz registriert wird, hier dokumentieren und Traefik-Side anpassen.

---

## Notfall-Kontakte / Eskalation

(Hier bei Bedarf eintragen wer im Notfall zuständig ist und wie erreichbar.)
