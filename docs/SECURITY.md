# Datenbanksicherheit — Stand & Offene Punkte

Lebendiges Dokument. Hier wird der aktuelle Zustand der DB-Sicherheit auf
xqt5-ai-plattform getrackt: was geprüft wurde, was geschlossen ist, was
offen bleibt. Bei Änderungen am Sicherheitsmodell (neue Migration,
Schwachstelle entdeckt, Maßnahme umgesetzt) bitte hier ergänzen.

Verwandt:
- Konkrete Umsetzungs-TODOs: `docs/TODO.md` (Abschnitt "DB-Sicherheits-Posture")
- Migration-Sicherheits-Template: `supabase/migrations/_template.sql.example`

---

## Bedrohungsmodell (Stand 2026-05-06)

**Architektur.** Frontend → Backend (FastAPI) → Supabase REST über Kong. Das
Frontend spricht **nie direkt** mit Supabase. Der Backend authentifiziert sich
gegenüber Supabase mit dem Service-Role-JWT (`SUPABASE_KEY` env var). Postgres
RLS ist bewusst deaktiviert; Zugriffskontrolle läuft im Python-Code des
Backends (Ownership-Checks, JWT-Validierung, Pool-Rollen, Rate Limits).

**Perimeter.** Wer im Besitz von `SUPABASE_KEY` (Service-Role-JWT) ist, hat
vollen Lese-/Schreibzugriff auf die gesamte DB inklusive `app_users`
(Bcrypt-Hashes), `app_audit_logs`, `app_documents`. Wer im Besitz von
`SERVICE_PASSWORD_JWT` (Supabase-JWT-Secret) ist, kann sich beliebige Tokens
ausstellen — auch `service_role`. Beide Werte liegen als Coolify-env-vars
auf dem jeweiligen Service.

---

## Geschlossene Lücken

### 2026-05-06 — Anon-Rolle hatte Lesezugriff auf alle public-Tabellen

**Befund (verifiziert per curl mit Anon-JWT):** Auf prod gab `/rest/v1/app_users`
volle Nutzerdatensätze inklusive Bcrypt-Hashes und E-Mail zurück. Ebenso:
`app_documents`, `app_audit_logs`, `pool_pools`, `pool_chats`. Der Anon-Key
ist von Supabase als „öffentlich teilbar" konzipiert — jeder, der ihn
jemals gesehen hat, hatte vollen Lesezugriff auf prod.

**Maßnahme:** `supabase/migrations/20260506_b_revoke_anon_public.sql` — REVOKE
ALL auf TABLES, SEQUENCES, FUNCTIONS in `public` für die Rolle `anon`, plus
`ALTER DEFAULT PRIVILEGES` für `postgres` und `supabase_admin` damit künftige
Objekte ebenfalls nicht an anon vergeben.

**Status nach Anwendung:**
- prod: angewendet 2026-05-06, verifiziert (alle 6 getesteten Tabellen
  liefern HTTP 401 `42501 permission denied`)
- dev: noch nicht angewendet (dev hat aktuell keine Anon-Rolle exponiert);
  unkritisch, idempotent — bei Gelegenheit nachziehen

---

## Offene Lücken (priorisiert)

### ✅ 1. `authenticated`-Rolle revoked — geschlossen 2026-05-06

PostgREST mappt jeden JWT mit `role: authenticated` auf die DB-Rolle
`authenticated`. Diese Rolle hatte im Supabase-Standard-Template `SELECT/
INSERT/UPDATE/DELETE` auf alle public-Tabellen, was den Anon-Revoke zur
Halbmaßnahme machte: wer `SERVICE_PASSWORD_JWT` hatte, konnte einen
`authenticated`-Token minten und alles lesen/schreiben.

**Maßnahme:** `supabase/migrations/20260507_revoke_authenticated_public.sql`
spiegelt den Anon-Revoke für die `authenticated`-Rolle. Auf prod angewendet
2026-05-06 via Studio SQL-Editor. App-Smoke-Test (Login + Chat + Upload)
nach Anwendung war erfolgreich. **`service_role` blieb unangetastet.**

Status auf dev: idempotent, anwenden bei Gelegenheit.

### 🟠 2. Bcrypt-Hashes waren bis 2026-05-06 abgreifbar

Wenn vor diesem Datum jemand den prod-Anon-Key hatte, konnte sie alle
Bcrypt-Hashes in `app_users` herunterladen. Die Hashes sind nicht
plaintext, aber offline-knackbar (bei `bcrypt==4.0.1` cost factor 12
mit nennenswertem Aufwand).

**Maßnahme:** Passwort-Reset für alle `app_users` erzwingen (z.B. via
`bump_token_version()` in Kombination mit „bei nächster Anmeldung
Passwort neu setzen"-Flag). Operative Aktion, kein neuer Code zwingend.

### 🟠 3. `CORS_ORIGINS` auf prod muss ein striktes Allowlist sein

`backend/app/config.py:10` fällt auf `localhost:5173,localhost:3000` zurück
wenn die env-var nicht gesetzt ist. Memory bestätigt: prod hat sie gesetzt.
Verifizieren, dass der Wert exakt der prod-Frontend-Origin ist (kein
Wildcard, kein `null`, kein http-on-prod). Optional: in `main.py` einen
Startup-Assert ergänzen, der bei `ENVIRONMENT=production` und
leerer/`*`-CORS-Liste den Container nicht starten lässt.

### ✅ 4. Supabase-Studio-Zugang — verifiziert 2026-05-06

Studio ist mit Basic-Auth (`dashboard_user` / `dashboard_password`)
gesichert. Vom User bestätigt: Passwörter sind nicht Coolify-Defaults,
lange Zufallsstrings auf beiden Envs. Optional offen: IP-Allowlist auf
Kong-Ebene (nicht jetzt nötig).

### 🟠 4b. JWT_SECRET und SERVICE_PASSWORD_JWT haben den gleichen Wert

Verifiziert 2026-05-06 vom User. Defense-in-depth-Lücke: wer eines der
beiden Secrets in die Hände bekommt, hat automatisch auch das andere.
Konkret: Leak von `JWT_SECRET` (AI Workplace) erlaubt nicht nur
Nutzer-Tokens zu fälschen, sondern auch Supabase-Service-Role-Tokens —
Total-Compromise.

**Zusatzeskalation 2026-05-07 entdeckt:** `backend/app/encryption.py` leitet
den Fernet-Schlüssel für `app_provider_keys.encrypted_key` per SHA-256 aus
`JWT_SECRET` ab. Damit erlaubt ein Leak von `JWT_SECRET` auch das
Entschlüsseln aller in der DB gespeicherten Provider-API-Keys (OpenAI,
Anthropic, Mistral, etc.). Ein einzelner Secret-Leak öffnet die ganze
Plattform inklusive aller Drittanbieter-Schlüssel.

**Maßnahme:** `JWT_SECRET` auf der AI-Workplace-Backend-env auf einen
neuen Wert rotieren (`openssl rand -base64 32`). Beide Envs (dev + prod)
betroffen. Nebenwirkung: alle eingeloggten Nutzer werden ausgeloggt und
müssen sich neu anmelden — vertretbarer einmaliger UX-Verlust.
**Zusätzliche Nebenwirkung:** alle in `app_provider_keys.encrypted_key`
gespeicherten API-Keys werden mit dem alten Schlüssel entschlüsselbar
und müssen mit dem neuen Schlüssel re-encrypted werden. Pragmatisch:
Provider-Keys über das Admin-UI neu eintragen (löscht den alten Eintrag,
schreibt mit neuem Schlüssel verschlüsselt).

`SERVICE_PASSWORD_JWT` rotieren wäre invasiver (regeneriert alle
Supabase-API-Keys), daher Empfehlung: `JWT_SECRET` rotieren, nicht
`SERVICE_PASSWORD_JWT`.

### 🟡 5. Funktionen mit mutable `search_path`

`match_document_chunks`, `match_document_assets`, `keyword_search_chunks`
nutzen kein `SECURITY DEFINER`, daher ist die zugehörige CVE-Klasse
nur theoretisch relevant. Hygiene-Win: an jeder Funktion `SET search_path
= public, pg_catalog` ergänzen, bringt die Advisor-Warnungen weg.

**Geplanter Dateiname:** `supabase/migrations/20260508_function_search_path.sql`

### 🟡 6. `vector` Extension im public-Schema

Hygiene, kein Exploit. Verschiebe-Migration in das `extensions`-Schema
ist invasiv (alle pgvector-Operatoren-Referenzen müssen fully-qualified
werden). Niedrige Priorität.

### 🟢 7. Andere Schemas (`auth`, `storage`, `realtime`, `_supabase`)

Wir haben nur `public` revoked. Andere Schemas behalten Default-Grants.
Praktischer Impact gering, weil dieser Codebase Supabase-Auth nicht nutzt
und Storage über MinIO läuft. Hygiene-Migration optional.

### 🟢 8. RLS langfristig aktivieren

Die strategische Antwort auf #1 + Perimeter-Risiko (#4 in Bedrohungsmodell)
ist: RLS auf `app_users`, `pool_*`, `app_documents`, `app_chunks`
einschalten und der Backend-Code muss pro User-Request einen User-Token
durchreichen statt universellem Service-Role. Mehrwöchige Arbeit, größter
struktureller Gewinn. Für jetzt: dokumentierter akzeptierter Rest-Risiko.

---

## Migration-Hygiene für künftige Tabellen

Jede neue Migration die `CREATE TABLE` enthält **muss** sich am Template
unter `supabase/migrations/_template.sql.example` orientieren. Konkret:

- Tabelle wird erstellt → automatisch durch unsere `ALTER DEFAULT PRIVILEGES`
  vor anon-Grant geschützt (sofern via `/pg/query` oder Studio gepostet,
  beide laufen als `supabase_admin`)
- Trotzdem in jeder Tabelle-anlegenden Migration explizit `REVOKE ALL ON
  TABLE <neu> FROM anon;` als Belt-and-Suspenders eintragen — Selbst-Audit
- Funktionen (CREATE FUNCTION) ebenfalls explizit `REVOKE EXECUTE FROM anon`
  und `SET search_path = public, pg_catalog` ergänzen
- `ALTER TABLE ADD COLUMN` ist automatisch sicher — die Tabellengrants
  gelten für die neuen Spalten mit, und auf existierenden Tabellen ist
  `anon` bereits ohne Grants

Wenn #1 (authenticated-Revoke) gelandet ist, gilt dasselbe analog für
`authenticated`.

---

## Verifikation (jederzeit ausführbar)

Anon-JWT-Test (sollte überall HTTP 401 liefern):

```sh
export SBANON='<anon JWT aus SERVICE_SUPABASEANON_KEY auf dem Supabase-Service>'
export SBURL='<env URL, z.B. https://db-aiw.infra.xqt5.ai>'
for t in app_users pool_invite_links app_documents app_audit_logs pool_pools pool_chats; do
  printf '\n=== %s ===\n' "$t"
  curl -s -o /tmp/r -w "HTTP %{http_code}\n" -H "apikey: $SBANON" "$SBURL/rest/v1/$t?select=*&limit=1"
  head -c 300 /tmp/r; echo
done
```

Erwartet pro Tabelle: `HTTP 401` mit `{"code":"42501","message":"permission denied for table ..."}`.

Wenn eine Tabelle stattdessen `200` mit Daten liefert: Regression.
Tabelle prüfen, ob neue Migration sie versehentlich an anon vergeben hat.

---

### Bildgenerierung — Provider-URLs, Prompts und Stil-Präfix

**Zwei Speicherpfade in v1 — unterschiedliche Risiko-Profile.** Die Spalte `app_generated_images.storage_kind` kann zwei Werte haben:

- `'provider_url'` (OpenAI/xAI mit `url`-Antwort): Provider-CDN-URL ohne Authentifizierung abrufbar, ca. 60 Min. gültig. Wer die URL kennt, kann das Bild in diesem Zeitfenster ohne Login abrufen. Die URL wird in `image_url` gespeichert; Zugriff darauf ist nur über das Backend (kein direkter DB-Zugriff von außen).
- `'data_uri'` (z. B. `gpt-image-1` mit `b64_json`-Antwort): Bild-Bytes liegen base64-inline in derselben Spalte `image_url`. Kein Ablauf, keine CDN-Exposition; das Bild verlässt unsere DB nur, wenn das Backend es an den authentifizierten Frontend-Aufruf zurückgibt. Risikoprofil: stärker, dafür belegen die Bytes pro Bild ca. 1,3× die Roh-PNG-Größe in der DB-Zeile (Pgvector-Datenbank-Volumen beobachten).

Konsequenz für `provider_url`: Generierte Bilder sind für die Lebensdauer der URL effektiv öffentlich, auch wenn der Nutzer kein Sharing beabsichtigt hat. Nutzer sollten darüber informiert werden (Hinweis in der ANWENDER-DOKUMENT.md vorhanden). Für `data_uri` entfällt dieses Risiko; dafür ist das Audit-Log und die Lösch-Pipeline wichtiger, da Bytes nicht „natürlich" durch URL-Ablauf verschwinden. In v2 werden alle Bilder in Supabase Storage mit Access-Control abgelegt (`storage_kind = 'supabase'`); der Wechsel ist ohne API-Änderung möglich (`storage_kind`-Discriminator in `image_storage.py`).

**Prompts werden nicht im Audit-Log gespeichert.** Der vollständige Prompt-Text (inklusive Stil-Präfix) wird nicht in `app_audit_logs` eingetragen — nur Prompt-Länge, Nutzer-ID und Modell-ID. Das schützt vor versehentlichem Logging sensibler Prompt-Inhalte. Falls spätere Compliance-Anforderungen Prompt-Archivierung erfordern, muss dies explizit ergänzt werden.

**Stil-Präfix — akzeptiertes Risiko.** Der globale Stil-Präfix aus `app_image_style_presets` wird serverseitig vor den Nutzer-Prompt gesetzt. Ein kompromittierter Admin-Account könnte über den Präfix gezielt den Nutzer-Prompt manipulieren (Prompt-Injection vom Admin-Layer). Das ist ein akzeptiertes Risiko im Trust-Modell: Admins sind vertrauenswürdig; der Präfix ist für Admins im Dashboard sichtbar, aber nicht für Nutzer. Wenn das Trust-Modell sich ändert (z. B. delegierte Admins mit eingeschränkten Rechten), muss der Präfix-Mechanismus neu bewertet werden.

**Provider-seitige Moderation** ist in v1 der einzige Content-Gate. OpenAI und xAI lehnen gegen ihre Policy verstoßende Prompts auf ihrer Seite ab. Eine eigene Guardrail-Schicht (Llama Guard, Azure Prompt Shields) ist geplant (TODO Abschnitt „Input-/Output-Guardrails"), aber in v1 nicht vorhanden.

**Geplante Härtung (v2):**
- Supabase Storage mit ACL als permanenter Bild-Store (ersetzt temporäre Provider-URLs)
- Optionale Guardrail-Schicht vor dem Provider-Call (Prompt-Klassifikation)
- Prompt-Archivierung als Admin-Toggle (opt-in, da datenschutzrelevant)

---

## Inzident-Historie

| Datum | Befund | Schweregrad | Behoben in |
|---|---|---|---|
| 2026-05-06 | Anon-Rolle hat Lesezugriff auf alle `public`-Tabellen prod (inkl. `app_users.password_hash`) | hoch | `20260506_b_revoke_anon_public.sql` |
| 2026-05-06 | `authenticated`-Rolle hat analoges Risiko, gleicher Bug-Klasse | hoch | `20260507_revoke_authenticated_public.sql` |
