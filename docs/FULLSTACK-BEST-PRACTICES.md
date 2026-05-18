# Full-Stack Best Practices (2026)

**Erstellt 2026-05-13** als codebase-unabhängige Referenz, synthetisiert aus 6 Online-Research-Pässen. Komplementär zu:

- `docs/BEST-PRACTICES-DRAFT.md` — codebase-spezifisch für xqt5-ai-plattform (11 Pattern-Klassen P1–P11)
- `docs/BUG-FIX-PLAYBOOK.md` — Action-Doc mit gefundenen Bugs gruppiert
- `docs/BUG-AUDIT-2026-05-13.md` — historischer Audit-Record über 12 Sweep-Runden

**Audit-Pattern-Klassen-Cross-Reference:**
- **P1** Atomicity / Read-Modify-Write Races
- **P2** F-String / Filter-Injection
- **P3** Sync-I/O in async Handler
- **P5** Provider-Error-Body-Leak
- **P6** Hardcoded i18n
- **P7** Pydantic-permissive
- **P8** Silent-Exception-Swallow
- **P9** Missing-Audit
- **P10** Defense-in-Depth Route-Only
- **P11** Frontend-Auth-Coordination

13 Kategorien, jede unabhängig konsumierbar:

1. [Frontend](#1-frontend)
2. [APIs und Backend](#2-apis-und-backend)
3. [Database und Storage](#3-database-und-storage)
4. [Auth und Permissions](#4-auth-und-permissions)
5. [Hosting und Deployment](#5-hosting-und-deployment)
6. [Cloud und Compute](#6-cloud-und-compute)
7. [CI/CD und Version Control](#7-cicd-und-version-control)
8. [Security und RLS](#8-security-und-rls)
9. [Rate Limiting](#9-rate-limiting)
10. [Caching und CDN](#10-caching-und-cdn)
11. [Load Balancing und Scaling](#11-load-balancing-und-scaling)
12. [Error Tracking und Logs](#12-error-tracking-und-logs)
13. [Availability und Recovery](#13-availability-und-recovery)

---

## 1. Frontend

Modern SPA / React 19 stack (codebase-agnostisch).

### State Management
- Co-locate state. Lift nur wenn zwei Siblings teilen müssen. Globaler Store erst wenn Prop-Drilling >3 Layer **oder** State Cross-Route.
- **Local `useState`** für component-internal UI. **Context** für stable values (theme, locale, auth-user). **Zustand** für reactive cross-tree state ohne Provider-Chains (~1 KB).
- Functional setState immer wenn next state von previous abhängt: `setCount(c => c + 1)`.
- **Anti-Pattern (P11):** Kein AuthContext, JWT direkt aus localStorage überall.
- Sources: [Zustand Guide](https://react.wiki/state-management/zustand-tutorial/), [State Management Tools 2026](https://www.syncfusion.com/blogs/post/react-state-management-libraries)

### Auth & Token Lifecycle in Browser
- **Access Token in Memory; Refresh Token in `HttpOnly; Secure; SameSite=Strict` Cookie.** localStorage = XSS-exfiltratable. OAuth 2.1 deprecates Implicit Flow → Authorization Code + PKCE.
- Refresh Rotation: Server invalidisiert ganze Token-Family auf Reuse-Detection.
- **Refresh-Mutex (Singleton-Promise):** Concurrent 401s müssen einen Refresh teilen.

```js
let refreshPromise = null
export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = fetch('/auth/refresh', { credentials: 'include' })
    .then(r => r.ok ? r.json() : Promise.reject(r))
    .finally(() => { refreshPromise = null })
  return refreshPromise
}
```

- Multi-Tab-Sync: `BroadcastChannel` (nicht `storage`-Event) + `visibilitychange` für Re-Auth nach Idle.
- `token_version`-Claim: Server stempelt Version in JWT; Client vergleicht; Mismatch → forced re-login.
- **Anti-Pattern (P11):** localStorage-JWT + refresh-storm self-throttle + kein multi-tab-sync + kein token_version-check.
- Sources: [Auth0 Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation), [MojoAuth Secure JWT Browser Management](https://mojoauth.com/blog/secure-jwt-token-management-browser-apps)

### SSE / Streaming UX
- Jeder Stream cancelable, resumable, mid-stream-error-tolerant. Native `EventSource` reconnected nur wenn Server `id:` Lines sendet.
- `fetch` + `ReadableStream` + `AbortController` für POST/Bearer-Auth-Streams; `EventSource` nur für simple GET.

```js
useEffect(() => {
  const ctrl = new AbortController()
  ;(async () => {
    try {
      const res = await fetch('/api/chat/stream', { signal: ctrl.signal, ... })
      const reader = res.body.getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        appendChunkRef.current(decoder.decode(value, { stream: true }))
      }
    } catch (e) {
      if (e.name !== 'AbortError') reportStreamError(e)
    }
  })()
  return () => ctrl.abort()
}, [conversationId])
```

- **Anti-Pattern (P8):** SSE ohne `AbortController`; Closures fangen stale state. Nutze `useRef` für append-callback.

### Form Validation
- **Server ist canonical truth.** Client mirroring nur für UX. `max_length`/Regex/Enums müssen Server-Konstanten matchen (gemeinsame `constants/limits.json`).
- Validate on `blur` (nicht jeden Keystroke). Hard-cap inputs: `<textarea maxLength={MAX_PROMPT} />` + `onPaste`-Guard für huge text dumps.
- Server-returned Field-Errors (HTTP 422) immer rendern — nie client-only-Validation trust.
- **Anti-Pattern:** Form-State nicht reset on Modal-Close → next open zeigt stale data.

### Error Boundaries (3-Tier)
- **Root** (white-screen guard), **Route** (per page, shell alive), **Modal/Widget** (volatile regions).
- `react-error-boundary` v5 + React 19 `onCaughtError`/`onUncaughtError`.

```jsx
<ErrorBoundary FallbackComponent={Fallback} onError={reportToSentry} onReset={() => navigate(0)}>
  <ChatPanel />
</ErrorBoundary>
```

- Retries finite + observable, nie silent infinite reset loops.
- **Anti-Pattern (P8):** `try/catch` mit silent `console.error`.

### Modal Stacking + Focus
- **Native `<dialog showModal>`** bevorzugt — Browser gibt Focus-Trap, Top-Layer-Rendering (kein z-index-Krieg), Escape, ARIA umsonst.
- Stacking: native `<dialog>` erlaubt Nesting seit 2024 — Escape popt nur topmost. `inert` auf Page-Root bei offenem Dialog.
- `focus-trap-react` nur für Legacy-Custom-Modals oder Shadow-DOM-Edge-Cases.
- **Anti-Pattern:** Ein document-level `keydown`-Listener schließt alle Modals — jeder muss own Escape via `<dialog>` Cancel.

### i18n Discipline
- **Translation-Lookup happens at render**, never at module load.
- `react-i18next` + ICU. `count` als Variable für CLDR plural rules.

```jsx
function Tabs() {
  const { t } = useTranslation()
  const TABS = [
    { id: 'chat', label: t('tabs.chat') },  // re-evaluated each render
  ]
}

// WRONG: module-load locks first locale forever
const TABS = [{ label: t('tabs.chat') }]
```

- Numbers/Dates: `new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(x)`.
- **Anti-Pattern (P6):** `const TABS = [{ label: t('...') }]` at module-scope evaluiert vor i18n-Init.

### XSS Hardening
- Defense in depth: CSP at edge + sanitize at render + URL-Scheme-Allowlist.
- **CSP für Vite SPA**: hash-based (Vite injiziert inline module). `strict-csp` oder `vite-plugin-csp-guard`.

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'sha256-<vite-hash>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none'; object-src 'none'; base-uri 'self';
```

- Markdown: `react-markdown` + `rehype-sanitize` (blockt `javascript:` Schemes default). Nie `rehype-raw` ohne `rehype-sanitize` danach.
- URL-Allowlist für user-supplied `href`/`src`:

```js
const SAFE = /^(https?:|mailto:|tel:)/i
const safeHref = (u) => SAFE.test(u) ? u : '#'
```

### Performance
- Route-based code splitting (40-60% faster initial loads). Lazy ganze Pages, nicht tiny Components.
- List-Virtualization (`react-window`) erst bei >200 visible rows + rich row content.
- `useTransition`/`useDeferredValue` für Filter-Inputs über große Listen.
- **Anti-Pattern:** N+1 useEffect-after-mount fetches.
- React Compiler (RC in 19.x) auto-memoizes; manual `useMemo`/`memo` meist redundant.

### Stale-Closure Prevention
- React 19.2 stable **`useEffectEvent`** — preferred:

```jsx
const onChunk = useEffectEvent((chunk) => {
  setMessages(prev => [...prev, chunk])  // immer current props/state
})
```

- `useRef`-Mirror für Value-Pattern bei älterem React.
- AbortController in Cleanup für jeden fetch/stream.
- **Anti-Pattern:** Fire-and-forget unawaited promises in event handlers.

### Anti-Patterns Konsolidiert
- JWT in localStorage ohne token_version + multi-tab sync (P11)
- Refresh-storm statt singleton-promise mutex (P11)
- Module-scope `t()` evaluation locked at first import (P6)
- SSE/streams ohne `AbortController` cleanup; append via stale closure (P8)
- `try { ... } catch (e) { console.error(e) }` silent error swallow (P8)
- Document-level keydown-listeners die alle Modals schließen
- Form-state surviving across modal-open-cycles
- `dangerouslySetInnerHTML` user/markdown content ohne `rehype-sanitize`/DOMPurify
- N+1 useEffect-fetches after mount

---

## 2. APIs und Backend

Python 3.11+ FastAPI + Pydantic v2 (codebase-agnostisch).

### REST API Design
- Resources (Nouns), korrekte Verbs (GET/POST/PUT/PATCH/DELETE), consistent Envelope, machine-readable Error-Codes, deliberate Versioning. Idempotency-Keys für jeden non-idempotent Verb (POST, sometimes PATCH).
- **Idempotency-Key (Stripe-Style):**

```python
@router.post("/payments", status_code=201)
async def create_payment(
    body: CreatePaymentRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=16, max_length=255)],
    db: AsyncSession = Depends(get_db),
):
    cached = await db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.key == idempotency_key,
            IdempotencyRecord.route == "POST:/payments",
        ).with_for_update()
    )
    if cached:
        if cached.request_hash != hash_body(body):
            raise HTTPException(409, {"code": "idempotency_key_conflict"})
        return cached.response  # replay
```

- **Versioning:** URL path (`/v1/...`) — explicit, cacheable, debuggable.
- **Error-Envelope:** RFC 9457 Problem-Details (`type`, `title`, `status`, `detail`, `instance`, app-specific `code`). Always `code` string — clients switch ohne Prose-Parsing.
- **Anti-Pattern (P5):** Provider-Exceptions verbatim (`detail=str(e)`) → leaks keys, internal URLs, stack traces.
- Sources: [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)

### Pydantic v2 Strict Mode
- Every Request-Model rejected unknown fields + validated strictly. Response-Models separat — nie für beide Richtungen reuse.

```python
from pydantic import BaseModel, ConfigDict, Field, SecretStr

class CreateUserRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)
    email: EmailStr
    password: SecretStr = Field(min_length=12, max_length=128)
    temperature: float = Field(ge=0.0, le=2.0, default=1.0)
    max_tokens: int = Field(ge=1, le=8192, default=1024)

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: UUID
    email: EmailStr
    # password NEVER in response model
```

- Rules:
  - `extra='forbid'` auf jedes `*Request`/`*Body`/`*Params`-Model
  - `Field`-Bounds für jeden numeric/length-constrained Input
  - `SecretStr` für Credentials
  - Base-Class (`StrictRequest`) für uniforme Config
- **Anti-Pattern (P7):** Permissive models silent-droppen unknown fields — typos werden no-ops, audit-unfriendly.

### Async Hygiene in FastAPI
- `async def` nur wenn Body non-blocking end-to-end. Sync-SDKs (supabase-py, requests, boto3, openpyxl, psycopg2) inside `async def` blocken Event-Loop.
- Decision-Rule:
  - All-async-I/O (httpx, asyncpg, aioredis) → `async def`
  - Mixed / Sync-only-SDK → `def` (FastAPI threadpool) oder `async def` + `await asyncio.to_thread(sync_call, ...)`
- Structured Concurrency (3.11+):

```python
async with asyncio.TaskGroup() as tg:
    a = tg.create_task(fetch_user(uid))
    b = tg.create_task(fetch_balance(uid))
return {"user": a.result(), "balance": b.result()}
```

- **Anti-Pattern (P3):** Direct `supabase.table(...).execute()` inside `async def`.

### Background-Task Discipline
- `BackgroundTasks` für "after this response, run X once". `asyncio.create_task` nur mit retained-set + done-callback. Echte Workloads (retry, durability, multi-worker) → Celery/Arq/Dramatiq.

```python
_bg: set[asyncio.Task] = set()

def fire_and_forget(coro):
    task = asyncio.create_task(coro)
    _bg.add(task)
    task.add_done_callback(_bg.discard)
    task.add_done_callback(lambda t: t.exception() and log.exception("bg failed", exc_info=t.exception()))
    return task
```

- On shutdown: `await asyncio.gather(*_bg, return_exceptions=True)`.
- **Anti-Pattern (P8):** `asyncio.create_task(audit_log(...))` ohne Referenz — Python hält nur weak ref → GC mid-flight.

### Streaming Endpoints (SSE)
- Jeder Event hat `event:`, `id:`, `data:`. `id:` enabled `Last-Event-ID` reconnect. **Immer Partial-Output + Status-Column in `finally` persistieren.**

```python
async def stream(msg_id: UUID, request: Request):
    buf: list[str] = []
    status = "error"
    try:
        async for delta in llm.stream(...):
            if await request.is_disconnected():
                status = "cancelled"; break
            buf.append(delta)
            yield f"id: {next_seq()}\nevent: token\ndata: {json.dumps({'t': delta})}\n\n"
        status = "complete"
        yield "event: done\ndata: {}\n\n"
    except Exception as e:
        log.exception("stream failed", extra={"msg_id": msg_id})
        yield f"event: error\ndata: {json.dumps({'code': 'upstream_error'})}\n\n"
    finally:
        await asyncio.to_thread(persist_message, msg_id, "".join(buf), status)
```

- Event-Taxonomy: `token`, `tool_call`, `usage`, `done`, `error`. Status: `pending|streaming|complete|cancelled|error`.

### Error Handling + Secret Hygiene
- Upstream-Errors get *mapped*, not forwarded. Client sieht generic 502/503 + opaque `code`; Server-Log hält full body mit Secrets scrubbed.

```python
SECRET_RE = re.compile(r"(sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9._-]+)")

def scrub(s: str) -> str:
    return SECRET_RE.sub("[REDACTED]", s)[:4000]

try:
    resp = await client.post(provider_url, ...)
    resp.raise_for_status()
except httpx.HTTPStatusError as e:
    log.error("provider_error", extra={
        "provider": provider, "status": e.response.status_code,
        "body": scrub(e.response.text),
    })
    raise HTTPException(502, {"code": "upstream_unavailable", "provider": provider})
```

- **Anti-Pattern (P5):** `raise HTTPException(500, detail=str(provider_exception))` → leaks vendor URLs, request IDs, prompts.

### Audit-Logging Discipline
- Audit lives at *endpoint boundary*, not in service helpers. Fire-and-forget aber durable (DB-Row).

```python
class AuditRow(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    ts: datetime
    actor_id: UUID
    action: str           # 'user.create', 'pool.delete'
    target_type: str      # TEXT, not enum
    target_id: str        # TEXT, not UUID — supports composite/string IDs
    payload: dict = Field(sa_column=Column(JSONB))
    request_id: str
```

- Unique `request_id` per row; immutable table (no UPDATE/DELETE grants); separate retention.
- **Anti-Pattern (P9):** Admin-Mutation-Handler ohne audit call; `target_id: UUID`-Column crashed bei String-Keys.

### Concurrency-Fragile State
- N workers × M threads/event-loops. Module-level `dict`/`set`/Counter lügt in Production. State lives in DB (Constraint + `SELECT ... FOR UPDATE`) oder Redis (`SET NX EX`).

```sql
-- Atomic increment, DB-side
UPDATE quota
   SET tokens_used = tokens_used + $1
 WHERE user_id = $2 AND tokens_used + $1 <= monthly_limit
RETURNING tokens_used;
```

- **Anti-Pattern (P1):** Read-modify-write in Python instead of atomic SQL.

### Multi-Provider Integration
- Eine canonical Provider-Name in Code. Map Vendor-Strings on input; nie auf free-form-Strings deeper in stack branchen.
- **Auth-Uniformity:** Always header-auth. Nie keys in URLs.
- **Retry/Backoff:** Retry nur 429/500/502/503/504/529. Respect `Retry-After`. Cap 3 retries mit jitter.
- **Finish-Reason-Normalization:** `stop|end_turn|STOP` → `"stop"`; `length|max_tokens` → `"length"`; `content_filter|safety|RECITATION` → `"content_filter"`.

### Health & Readiness
- `/livez` = process alive (cheap, no I/O). `/readyz` = ready for traffic (DB-Ping + Redis + key-presence).

```python
@app.get("/livez")
async def livez():
    return {"status": "ok"}  # static-200 ist HIER korrekt

@app.get("/readyz")
async def readyz():
    checks = {}
    try:
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=1.0)
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"fail: {type(e).__name__}"
    ok = all(v == "ok" for v in checks.values())
    return JSONResponse(checks, status_code=200 if ok else 503)
```

- **Anti-Pattern:** Single `/health` immer 200 → LB sendet Traffic an Pod mit erschöpftem DB-Pool.

### Anti-Patterns Konsolidiert (Backend)
- (P1) Read-modify-write in Python statt atomic SQL
- (P3) Sync SDK in `async def` ohne `asyncio.to_thread`
- (P5) `detail=str(e)` mit raw upstream body
- (P7) Pydantic ohne `extra='forbid'`, ohne `Field`-Bounds
- (P7) Gleiches Model für Request + Response
- (P8) `asyncio.create_task` ohne retained reference
- (P9) Admin-Handler ohne audit + `target_id: UUID` für String-Keys
- Streaming: kein `finally` → Partial-Output verloren
- State: Module-Globals unter multi-worker
- Health: Single `/health` returns 200 regardless
- Retries: ignoring `Retry-After`; non-idempotent POST ohne Idempotency-Key

---

## 3. Database und Storage

Postgres (Supabase) + pgvector + Object-Storage.

### Atomic DB Operations
- Nie Read-then-Write in App-Layer. Push Predicate in single SQL statement oder Advisory-Lock.

```sql
-- Conditional Counter (use-count, daily-cap)
UPDATE invites
   SET use_count = use_count + 1,
       updated_at = now()
 WHERE id = $1
   AND use_count < max_uses
   AND (expires_at IS NULL OR expires_at > now())
RETURNING id, use_count;
-- Empty result = blocked

-- Content-hash dedup (scoped)
CREATE UNIQUE INDEX uq_assets_hash_per_tenant
   ON assets (tenant_id, content_sha256)
   WHERE deleted_at IS NULL;

INSERT INTO assets (tenant_id, content_sha256, ...) VALUES ($1, $2, ...)
ON CONFLICT (tenant_id, content_sha256) WHERE deleted_at IS NULL DO NOTHING
RETURNING id;

-- Aggregate-guard with advisory lock
SELECT pg_advisory_xact_lock(hashtextextended('cost_cap:' || $tenant, 0));
SELECT coalesce(sum(cost_usd), 0) INTO v_used
  FROM cost_events WHERE tenant_id = $tenant AND day = current_date;
IF v_used + $new_cost > v_cap THEN RAISE EXCEPTION 'cap exceeded'; END IF;
INSERT INTO cost_events (...) VALUES (...);
```

- **Anti-Pattern (P1):** SELECT current → check in Python → UPDATE. Two concurrent requests see `use_count = 4 < 5`, both increment, final 6.
- Sources: [Winning Race Conditions With PostgreSQL](https://dev.to/mistval/winning-race-conditions-with-postgresql-54gn), [Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)

### PL/pgSQL Function Hardening
- Jede Function explicit `search_path` + validates inputs in SQL. `SECURITY DEFINER` nur wenn cross-privilege.

```sql
CREATE OR REPLACE FUNCTION app.consume_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public  -- pin schema resolution
AS $$
DECLARE v_id uuid; v_caller uuid := auth.uid();
BEGIN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
    IF p_code !~ '^[A-Z0-9]{6,32}$' THEN RAISE EXCEPTION 'bad code'; END IF;
    UPDATE invites SET use_count = use_count + 1
     WHERE code = p_code AND use_count < max_uses
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'invite invalid/exhausted'; END IF;
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION app.consume_invite(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION app.consume_invite(text) TO authenticated;
```

- **Anti-Pattern:** Kein `SET search_path` → CVE-2018-1058 hijack-vector wenn `public` writable. `SECURITY DEFINER` ohne tenant-check inside → RLS-bypassing backdoor.
- Sources: [CVE-2018-1058 guide](https://wiki.postgresql.org/wiki/A_Guide_to_CVE-2018-1058:_Protect_Your_Search_Path), [Cybertec: Abusing SECURITY DEFINER](https://www.cybertec-postgresql.com/en/abusing-security-definer-functions/)

### Postgres Concurrency
- Default `READ COMMITTED` — zwei `UPDATE`s on same row serializen; zwei `SELECT → INSERT`-Sequences nicht.
- **`pg_advisory_xact_lock(key)`** releases at COMMIT/ROLLBACK → **safe with Supabase transaction pooler**.
- **`pg_advisory_lock(key)`** session-scoped → **unsafe** with transaction pooling.
- Escalation:
  - Single-row counter → atomic UPDATE
  - Multi-row invariant in one tenant → `pg_advisory_xact_lock(hashtext('cap:' || tenant_id))`
  - Cross-tenant invariant / financial → `BEGIN ISOLATION LEVEL SERIALIZABLE` + retry on `40001`

### Migration Discipline
- Idempotent, ordered, explicit grants. Function-Overloads accumulate silently → break PostgREST mit `PGRST203`.

```sql
-- Idempotent
CREATE TABLE IF NOT EXISTS audit_logs (...);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);

-- Avoid overload pile-up
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig
           FROM pg_proc WHERE proname = 'consume_invite'
             AND pronamespace = 'app'::regnamespace
  LOOP EXECUTE format('DROP FUNCTION %s', r.sig); END LOOP;
END $$;
CREATE FUNCTION app.consume_invite(p_code text) ...;

-- Lock down PostgREST-exposed schema
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM anon, PUBLIC;
REVOKE ALL ON ALL TABLES    IN SCHEMA app FROM anon, PUBLIC;
```

### Vector Search (pgvector)
- HNSW = 2026 default. IVFFlat nur für sehr große, near-static Corpora.
- Filter by Tenant **before** ANN, not after.

```sql
CREATE INDEX ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

SET LOCAL hnsw.ef_search = 80;

SELECT id, content, 1 - (embedding <=> $q) AS score
  FROM chunks
 WHERE tenant_id = $tenant         -- pre-filter, uses btree
   AND deleted_at IS NULL
 ORDER BY embedding <=> $q
 LIMIT 20;
```

- Hybrid (BM25 + vector + RRF): independent queries, fuse with `score = Σ 1/(60 + rank_i)`.
- **Anti-Pattern:** Tenant-filter **after** ANN — leaks recall, bypasses isolation.

### Object Storage
- Private Bucket default. Signed-URLs short-TTL vom Backend nach Authorization. Size-Check VOR Read.

```python
MAX = 25 * 1024 * 1024
# 1. Proxy: nginx client_max_body_size
# 2. App: streaming read, NOT await file.read()
total = 0
sha = hashlib.sha256()
async with aiofiles.tempfile.SpooledTemporaryFile(max_size=2*1024*1024) as tmp:
    while chunk := await upload.read(1 << 20):
        total += len(chunk)
        if total > MAX: raise HTTPException(413, "too large")
        sha.update(chunk); await tmp.write(chunk)
    await tmp.seek(0)
    digest = sha.hexdigest()
```

- **Anti-Pattern:** `data = await file.read(); if len(data) > MAX: ...` — OOM passierte vor Check.

### Schema Invariants
- Enforce in Schema (CHECK, FK actions, generated columns), nicht in Comments.

**FK-Action-Matrix:**
| Relationship | Use |
|---|---|
| Child = Komponente of Parent (comments, likes, session-rows) | `ON DELETE CASCADE` |
| Child independent (orders, invoices, audit, **global assets**) | `ON DELETE RESTRICT` |
| Child should outlive parent (posts after user gone) | `ON DELETE SET NULL` |

**`updated_at` actually updates:**

```sql
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path = pg_catalog
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
```

- **Anti-Pattern:** `ON DELETE CASCADE` von `users.id` zu Global-Asset-Table → deleting Creator killt Asset für alle. Sollte `SET NULL` + RLS-`creator_id IS NULL`-Allowance sein.

### Retention Policies
- Jede Table mit PII oder operationally-sensitive Data declared Retention. GDPR Art. 17 erasure propagates zu live tables + Backups (within tombstone window) + search indexes + caches.
- Time-Partition `audit_logs` by month; drop old Partitions O(1).
- Pseudonymize on User-Erasure statt cascading delete.

### Anti-Patterns Konsolidiert (DB/Storage)
- **(P1)** TOCTOU in App-Layer
- **(P2)** F-String PostgREST-Filters — use typed builders (`.eq("email", email)`) oder RPC mit parameterized SQL
- Function-Overload-Accumulation
- `SECURITY DEFINER` ohne `SET search_path`
- Kein `updated_at`-Trigger
- Cascading-Deletes für Global-Assets
- Missing Partial-Unique-Index für scoped dedup
- `await file.read()` vor Size-Check
- Unbounded `audit_logs`
- `pg_advisory_lock` (session) auf transaction-pooled connection

---

## 4. Auth und Permissions

### JWT in Browsers (2026 Consensus)
- **BFF (Backend-for-Frontend)** Pattern ist neuer Default: SPA hält *keine* Tokens, server-side Session-Cookie-Proxy fronted API.
- Wenn kein BFF: Access-JWT in-memory; Refresh in `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/auth/refresh`.
- Access TTL 5–15 min, `aud` + `iss` + `jti` Claims, 30-60s leeway für Clock-Skew.
- Refresh: opaque, server-stored, rotate on every use, `(jti, family_id, parent_jti)` tracked. Reuse-Detection per OAuth 2.1 §6.1: replayed used-RT → revoke ganze Family.
- 10–30s grace window für parallele Tabs.
- `token_version`/`session_version` Claim — backend bumpt on password change/admin revoke; Middleware rejected older versions.
- Cross-Tab Sync via `BroadcastChannel`.

### Password Storage (2026)
- **Argon2id** ist 2026-Default: `m=19 MiB, t=2, p=1` minimum (OWASP). Tune so 250–500 ms.
- Bcrypt 4.0.x acceptable nur mit SHA-256 pre-hash wrapper.

```python
# Bcrypt mit pre-hash für 72-byte mitigation
import hashlib, base64, bcrypt

def hash_password(password: str) -> str:
    pre = base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())
    return bcrypt.hashpw(pre, bcrypt.gensalt(12)).decode("utf-8")
```

- Normalisation: `unicodedata.normalize("NFKC", x).strip()`; lowercase email/username; reject `len(password.encode()) > 1024` vor hashing (DoS).
- Pydantic-Bounds `min_length=12, max_length=128` auf `LoginRequest`/`RegisterRequest`.
- Pepper (HMAC-SHA256 mit KMS-stored Secret) optional aber empfohlen.

### Authentication Corners
- **Constant-Time Login:** Always run dummy Argon2/bcrypt verify on user-not-found. Same code path, same DB round-trips, same response shape and status.
- **MFA / TOTP:** RFC 6238, SHA-1 (compat), 30s step, 6 digits, ±1 window. Separate DEK für secret encryption. Lockout nach 5 fails independently of password.
- **Password Reset:** single-use token, 15-min TTL, bound to user-id + current `password_hash` prefix, invalidate alle sessions on success.
- **Lockout vs Slow-Rate:** prefer exponential back-off (1s → 2s → 4s) over hard lockout (DoS-of-user). Hard nur nach 10+ fails mit self-service unlock via email.

### Authorization Patterns
- Defense in depth — every protected resource checked at **3 layers**: Route Guard, Service/Storage, Database (RLS). RBAC für coarse, ABAC für tenant/object scoping.

```python
# Route: Depends(require_role("admin")) returns 403 before handler
# Service: get_invoice(id, current_user) re-asserts ownership
# DB: RLS policy USING (tenant_id = current_setting('app.tenant_id')::uuid)
```

- BOLA defense (OWASP API1:2023): nie opaque object IDs ohne ownership-check. UUIDv7 over auto-increment.
- **Anti-Pattern (P10):** Authorization nur auf Route-Layer via `require_role` discipline; any handler forgetting `require_role` leaks data.

### Anti-Patterns Konsolidiert (Auth)
- JWT in localStorage ohne BFF
- Refresh-Token never rotates
- Kein `token_version`-Check
- bcrypt 4.0.1 silent 72-byte truncation
- Early-return on user-not-found (Timing-Oracle)
- Password gleicher Field-Type für request + response

---

## 5. Hosting und Deployment

### Containerization
- Minimal, immutable, non-root, signed, inventoried. SBOM + SLSA-Provenance. Build-Tools nie ins Runtime-Image.

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS builder
ENV UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/usr/local/bin/uv \
    uv sync --frozen --no-dev --no-install-project
COPY . .

FROM gcr.io/distroless/python3-debian12:nonroot
COPY --from=builder /app /app
USER nonroot
EXPOSE 8000
ENTRYPOINT ["/app/.venv/bin/python", "-m", "backend.main"]
```

- Pair mit `docker buildx build --sbom=true --provenance=mode=max` + `cosign sign --yes <registry>/<img>@<digest>`.
- **Anti-Pattern:** Root-User, `:latest`-Tag, full repo copy before `uv sync` (cache bust on every code change), build-essential in prod, no `.dockerignore`.

### Coolify Deployment
- Branch-per-env (DEV vs PROD hard isolation), config flags für soft toggles. Health-Checks gate rolling updates; secrets in Coolify secret store.
- Eine Coolify "Application" pro Environment, je own Branch. Nie share envs across branches.
- Real HTTP-Health-Check: `GET /healthz` returns 200 only when DB + provider-config reachable.
- Avoid host-port mappings — disables rolling updates. Let Traefik proxy by container name.
- Separate `/healthz` (liveness) from `/readyz` (readiness). Flip `/readyz` to 503 immediately on SIGTERM.
- Coolify ship kein echtes blue-green; für das run zwei Stacks (`-blue`, `-green`) behind Traefik label swap.
- **Anti-Pattern:** Same Coolify project redeploys both DEV+PROD from latest-touched branch. Health-checks return 200 unconditionally.

### Anti-Patterns Konsolidiert (Hosting)
- `:latest` Tags + unsigned images
- Root in Container
- Build-deps in runtime image
- Single Coolify project across envs
- Health-Check immer 200

---

## 6. Cloud und Compute

### Cloud-Compute-Choices
Match host zu workload's predictability + appetite für ops. VPS + Coolify wins auf cost und control für steady traffic; managed PaaS wins auf time-to-ship und burst capacity. **Egress cost ist silent killer.**

| Provider | Best for | Cost | Trade-offs |
|---|---|---|---|
| **Hetzner + Coolify** | Small teams, steady traffic, internal tools, self-hosted Supabase | €4–20/mo + no egress fees | Ops time, no SLA, single-region |
| **Fly.io** | Global edge, GPU occasional, Docker-native | Usage-based | 100 GB free egress, global anycast |
| **Railway** | Prototypes, side projects, demo deploys | Usage + $0.05/GB egress | Hard to predict cost |
| **Vercel** | Next.js/static frontends, edge CDN | $20/seat + steep bandwidth markup | Bad for nontrivial Python backends |

- Rule of thumb: monthly Vercel bandwidth > Hetzner CX22 (~€6) → move backend zu Coolify; static frontend bleibt auf CDN.
- **Anti-Pattern:** Pick auf Hype rather than measured cost-per-month. Migration later is non-trivial.

### Multi-Worker Assumptions
- App-Server müssen stateless sein. Shared State in Redis/DB/Object-Storage, nie module globals.
- `uvicorn --workers N` hinter Process-Manager (oder one container per worker für Coolify scale-out).
- `gunicorn -k uvicorn.workers.UvicornWorker` nur wenn pre-fork lifecycle hooks needed.
- slowapi storage von `memory://` zu `redis://`.
- `_rechunk_status` und similar replaced mit Redis hashes keyed by job ID.
- **Anti-Pattern:** Module-level `_state = {}` dicts unter Multi-Worker; sticky sessions everywhere (defeat horizontal scale).

### Startup/Shutdown Lifecycle
- Initialization in `lifespan`, nicht at import time. Shutdown drains in-flight before exit.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ready = False
    app.state.db = await create_pool(settings.database_url)
    await bootstrap_admin_user(app.state.db, settings)
    await prime_provider_cache(app.state.db)
    app.state.ready = True
    try:
        yield
    finally:
        app.state.ready = False         # 503 on /readyz immediately
        await drain_background_tasks(timeout=25)
        await app.state.db.close()
```

- Set Coolify health check to `/readyz`, container `STOPSIGNAL SIGTERM`, grace period ≥ 30s.

### Configuration Management
- All config from env. Validate at boot mit types. Fail loud if anything required missing/malformed.

```python
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    jwt_secret: SecretStr
    supabase_url: str
    supabase_key: SecretStr
    rate_limit_per_minute: int = Field(60, ge=1, le=10_000)
    cors_origins: list[str] = Field(default_factory=list)
    model_config = {"env_file": ".env", "frozen": True}

settings = Settings()   # raises on missing/invalid → container fails fast
```

- Nie `int(os.environ["X"])` at import. Pydantic-Settings mit `Field(ge=, le=)`.
- Secrets in Coolify's encrypted store / Vault / AWS SSM. Nie image-layer (`docker history` shows them).
- Pydantic-Validators die fail wenn `ENV=production` und `JWT_SECRET="changeme"`.

### Anti-Patterns Konsolidiert (Cloud)
- `int(os.environ.get(...))` at import
- Module-globals for request state
- No `lifespan` handler (admin bootstrap, pool warm-up, shutdown drain leak in request paths)
- Secrets in `docker-compose.yml` or image layers

---

## 7. CI/CD und Version Control

### CI/CD Pipeline (GitHub Actions)
- Every PR: `lint → typecheck → test → build → scan → push`. Required checks gate merges. Merge queue ab >2 devs.

```yaml
on:
  pull_request:
  merge_group:   # CRITICAL: merge queue won't trigger checks without this
jobs:
  ci:
    permissions: { contents: read, id-token: write }  # OIDC, no static creds
    steps:
      - uses: actions/checkout@<full-sha>             # pin actions to SHA
      - run: uv sync --frozen
      - run: uv run ruff check . && uv run mypy .
      - run: uv run pytest --cov
      - run: uv lock --check
      - run: npm ci && npm run build --prefix frontend
      - run: docker buildx build --sbom=true --provenance=mode=max -t img:${{ github.sha }} .
      - run: trivy image --exit-code 1 --severity HIGH,CRITICAL img:${{ github.sha }}
      - run: cosign sign --yes img@${{ steps.build.outputs.digest }}
```

- Required checks: lint, typecheck, test, `uv lock --check`, `npm ci`, image-scan.
- Preview environments: ephemeral Coolify app per PR.

### Dependency Pinning
- Declare ranges in `pyproject.toml`/`package.json`; pin exact resolved versions + hashes in lockfiles; lockfiles are single source of truth in CI + prod.
- Python: `uv sync --frozen --no-dev`. Commit `uv.lock`; nie edit by hand. CI gate: `uv lock --check`.
- Node: `npm ci` (never `npm install`) inside Docker. `npm ci` errors if `package.json` und `package-lock.json` drift.
- Auto-updates: Dependabot oder Renovate, grouped PRs (weekly minor/patch, monthly major), required CI green before auto-merge.
- Upper bounds for risky libs in `pyproject.toml`, nicht nur in memory.

### Branch/Git Workflow
- **Trunk-based mit short-lived branches und small PRs ist 2026-Default.** Gitflow nur für Produkte mit parallelen supported releases.
- One long-lived branch (`main`). Feature-Branches live <2 days, <400 LOC diff.
- Squash-merge → linear history; squash commit becomes changelog entry.
- Enable signed commits (`commit.gpgsign=true` oder Sigstore `gitsign`); require `Verified` badge on `main`.
- Merge queue ab concurrent PRs collision.
- Conventional Commits (`feat:`, `fix:`, `chore:`) für automated changelogs.
- **Anti-Pattern:** Long-lived divergent branches → 37-commit-divergence "prod-catchup is a planned project" rather than a daily reality.

### Database Migration Discipline
- Migrations ARE code, versioned in git, applied by automated job — never by human pasting SQL.
- Numbered migration files (`20260513120000_add_pool_table.sql`).
- Every DDL in `IF NOT EXISTS` / `IF EXISTS` und `DO $$ BEGIN ... END $$;` blocks for Supabase RLS policies.
- `schema_migrations` Table tracks applied filenames + hash + timestamp. Backend refuses start if expected schema version ≠ DB version.
- Column rename / type change: dual-write window (write to both, read from new, drop old in later migration) statt atomic rename.
- CI applies migrations gegen ephemeral Supabase before tests; same script applies to staging then prod via GitHub Actions, gated on manual approval.

### Anti-Patterns Konsolidiert (CI/CD)
- No CI suite ("user commits → Coolify pulls → user verifies" loop)
- `npm install` in Dockerfile (non-reproducible)
- Hand-applied migrations via `supabase-meta /pg/query`
- Long-lived divergent branches
- Unsigned + unscanned images
- Source maps uploaded zu public CDN

---

## 8. Security und RLS

### Postgres RLS in Supabase
- RLS on **every** Table in `public`. `service_role` bypasses RLS — keep it server-side only; never ship to browser or to function the SPA can reach.

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;  -- applies even to table owner

CREATE POLICY invoices_tenant_isolation ON invoices
  FOR ALL TO authenticated
  USING  (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid);

CREATE INDEX invoices_tenant_idx ON invoices(tenant_id);  -- critical for perf
```

- Wrap `auth.uid()` / `auth.jwt()` in `(SELECT …)` so Postgres caches per statement (10–100× speedup).
- Always restrict role: `TO authenticated` — nie `auth.uid() IS NOT NULL` als Gate.
- Separate Policies per Command (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) for least privilege.
- **Anti-Pattern (P10):** RLS disabled on self-hosted Supabase; all access mediated by app-layer `require_role`.

### HTTP Security Headers (Minimum SPA Set)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy:
    default-src 'self';
    script-src 'self' 'sha256-<vite-inline-hash>' 'strict-dynamic';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    connect-src 'self' https://api.example.com;
    frame-ancestors 'none'; base-uri 'none'; object-src 'none';
    report-to csp-endpoint
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp        # only if no 3rd-party embeds
Cross-Origin-Resource-Policy: same-site
```

- Vite: capture build-output inline-script hash via plugin (`vite-csp-guard` or post-build). Roll out as `Content-Security-Policy-Report-Only` first.

### CORS Hardening
- Browsers refuse `Access-Control-Allow-Origin: *` together mit `credentials: include`. Whitelist exact origins, never patterns.
- CSRF defenses run *before* CORS exemptions.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,        # explicit list, no "*"
    allow_credentials=True,
    allow_methods=["GET","POST","PUT","DELETE","PATCH"],
    allow_headers=["Authorization","Content-Type"],
    max_age=600,
)
```

- Reject `Origin` headers not in list in `OPTIONS` early.
- BFF/cookie sessions: add CSRF token (double-submit or `SameSite=Strict` + `Origin` check).

### Audit-Log Integrity
- Append-only at storage layer, not by convention. Evidence survives app bugs + insider tampering.
- DB-side: dedicated `audit_log` table mit `REVOKE UPDATE, DELETE ON audit_log FROM app_role;`. Logical replication to separate write-only sink. Monthly partitions; drop past retention.
- Structured taxonomy: `event_type` from fixed enum, `actor_id`, `target_id`, `tenant_id`, `request_id`, `ip`, `ua`, `metadata` (jsonb).
- **PII Discipline:** Nie raw input loggen das Credentials enthalten könnte. `AUTH_LOGIN_FAILED.metadata.username` (User tippt Password ins Username-Field) → Credential-Dump.

```python
if event_type == AUTH_LOGIN_FAILED:
    metadata.pop("username", None)  # oder hash
```

- Failures: nie silent swallow. Fallback structured stderr + alert.
- GDPR Art. 30: retain 90 days–2 years, document purpose, allow targeted erasure by `actor_id`.

### Encryption Key Management
- **One key, one purpose.** Signing ≠ encryption ≠ session ≠ password-pepper. Root KEK in KMS, purpose-specific DEKs via HKDF.

```python
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.hashes import SHA256

def derive(purpose: str, length=32) -> bytes:
    return HKDF(algorithm=SHA256(), length=length,
                salt=b"app-v1", info=purpose.encode()).derive(KEK)

JWT_SIGNING_KEY    = derive("jwt-sign-v1")
FIELD_ENCRYPT_KEY  = derive("field-encrypt-v1")
REFRESH_TOKEN_HMAC = derive("refresh-hmac-v1")
```

- Envelope-Encryption: each row encrypted with fresh DEK; DEK wrapped by KEK and stored alongside ciphertext with `key_id`.
- Rotation: bump `key_id`, re-wrap DEKs lazily on access, decommission old KEK after grace.
- **Anti-Pattern:** Fernet-Key derived from `JWT_SECRET` → rotating JWT-Secret destroys all encrypted data.

### Reverse-Proxy Trust
- `X-Forwarded-For` ist user input until proven otherwise. Trust nur proxies whose IP du controllst. Chain ist right-to-left.

```
uvicorn --proxy-headers --forwarded-allow-ips="10.0.0.0/8"
```

- Pin to proxy subnet, **never** `*`. With Coolify/Traefik that is the docker overlay net.
- Validate XFF chain length matches expected hop count; strip and replace, don't append.
- For rate-limit key extraction: walk XFF right-to-left, skip private ranges, take first public IP — **only** after asserting request came from trusted proxy.

### OWASP Top Risks 2026
- **API Top 10 (2023, current):** API1 BOLA (40% of attacks), API2 Broken Auth, API3 BOPLA, API4 Unrestricted Resource Consumption, API5 BFLA, API6 Sensitive Business Flows, API7 SSRF, API8 Security Misconfig, API9 Improper Inventory, API10 Unsafe API Consumption.
- **LLM Top 10 (2025):** LLM01 Prompt Injection (direct + indirect), LLM02 Sensitive Info Disclosure, LLM03 Supply Chain, LLM04 Data/Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector/Embedding Weaknesses (RAG), LLM09 Misinformation, LLM10 Unbounded Consumption.

---

## 9. Rate Limiting

- Per-Worker memory counters sind keine rate-limits — sie sind suggestion. Centralised store (Redis) keyed by **(client_id, endpoint)** wo `client_id` most trustworthy identifier: auth subject > validated IP > unauthenticated IP.

```python
limiter = Limiter(
    key_func=composite_key,         # f"{user_id or trusted_ip}:{endpoint}"
    storage_uri=settings.redis_url, # redis://… NOT memory://
    strategy="moving-window",
)
```

- **Stratified Limits:** Global, per-IP, per-User, per-Endpoint. Tighter auf `/auth/*`.
- **On failed login:** exponential back-off + delay-pad zu constant-time; nicht 429 immediately (selbst enumeration oracle).
- **Bot Detection:** Behavioural (mouse/keystroke entropy), TLS-Fingerprint (JA3/JA4), proxy/Tor IP intel.
- **Distributed credential-stuffing slipt per-IP-Limits** — correlate by `(useragent_class, ASN, login_velocity)` und trip CAPTCHA/MFA.
- **Anti-Pattern:** `RATE_LIMIT_STORAGE_URL="memory://"` mit multi-worker Uvicorn → 4 workers = 4× advertised limit.

---

## 10. Caching und CDN

### Caching Layers (Redis)
- **Every Cache-Key carries Version-Segment.** Invalidation = `INCR cache_version:<scope>` — O(1), no SCAN, no DEL.
- Every Key has TTL even when explicit invalidation exists.
- Cache-aside for reads, write-through only when read-after-write must be linearizable.

```
GET   cache:v:tenant:42        → "7"
GET   cache:v7:tenant:42:user:99:profile
# Invalidate all tenant 42 caches:
INCR  cache:v:tenant:42        # now v8 — every v7:* key orphaned, expires via TTL
```

- **Semantic Cache für LLMs:** Embed prompt → Redis `VSIM` (vector sets) → if cosine ≥ 0.93, return cached completion. Cuts repeat-query cost 50–80%; tune threshold per surface.
- **Stampede Protection:** `SET key value NX PX 30000` to elect one regenerator; siblings serve stale or wait briefly. Combine mit jittered TTLs.
- **Anti-Pattern:** `KEYS user:42:*` + `DEL` für invalidation (O(n), blocks event loop). Storing version in application statt Redis (multi-instance drift).

### CDN Strategy
- Immutable hashed assets get year-long `Cache-Control: public, max-age=31536000, immutable`.
- HTML + API JSON get short max-age + `stale-while-revalidate` so slow origin never blocks user.
- Use `CDN-Cache-Control` to split edge vs browser TTLs.
- Auth-required objects: short-lived signed URL, never `public, max-age`.

```
# Hashed JS/CSS/images
Cache-Control: public, max-age=31536000, immutable

# HTML / SSR
Cache-Control: public, max-age=60, stale-while-revalidate=600, stale-if-error=86400
ETag: "abc123"

# Edge longer than browser
CDN-Cache-Control: public, max-age=3600
Cache-Control: public, max-age=60

# Private signed asset
Cache-Control: private, no-store
```

- **Anti-Pattern:** Long max-age on un-fingerprinted HTML → stale pages stuck at edge until manual purge. `Vary: Authorization` missing on per-user responses.

---

## 11. Load Balancing und Scaling

### Load Balancing
- L7 reverse proxy (Traefik/nginx/Caddy/Envoy). **Least-connections** für long requests (LLM-streams, file uploads); round-robin nur wenn all requests short and uniform.
- Active backend health probes hitting `/api/ready` (not `/api/health`); `interval=5s`, `unhealthy_threshold=2`.
- Cookie-based sticky sessions nur wo required (SSE, in-memory session state).
- **Anti-Pattern:** Single static `/api/health` masks dependency outages.

### Horizontal Scaling
- App-Server MUST be stateless. Every mutable state in Postgres/Redis/object-storage.
- Gunicorn + `uvicorn.workers.UvicornWorker`, `workers = cpu_cores` (async workers don't need `2*cores+1`), `--preload` for copy-on-write memory savings, `max_requests=1000` + `max_requests_jitter=50` to recycle leaky workers.
- For SSE: pin via cookie-based affinity OR move stream state to Redis pub/sub so any worker can resume.

### Auto-Scaling Triggers
- CPU alone is poor signal for I/O-bound LLM workloads — scale on **request rate / queue depth / p95 latency** via custom metrics (Prometheus Adapter, KEDA).
- HPA on RPS-per-pod mit `stabilizationWindowSeconds: 300` cooldown to avoid flapping.
- For LLM apps: cap `maxReplicas` since each new pod adds provider-token cost; prefer queueing over scaling.
- Pre-warm before predictable load (cron-based scale-up).
- **Anti-Pattern:** Scaling on CPU=70% when workers blocked in `await` — pods stay at 5% CPU under saturation, never scale.

### Database Resilience
- Postgres connections are precious. Put PgBouncer in **transaction pooling mode** between app and Postgres.
- Size app-side pool conservatively: `pool_size=5, max_overflow=10` per worker, never per request.
- Set `statement_timeout=30s`, `idle_in_transaction_session_timeout=60s`, `lock_timeout=5s` at role level.
- Async drivers (`asyncpg`) in async handlers — **never** sync `supabase-py` inside `async def`.
- Route analytics to separate pool or read replica.

---

## 12. Error Tracking und Logs

### Structured Logging
- JSON-only logs from day one. Mandatory fields: `ts` (ISO-8601 UTC), `level`, `service`, `env`, `request_id`, `trace_id`, `span_id`, `user_id_hash`, `msg`.
- Never log raw PII or secrets — hash or drop at formatter level.

```python
import structlog
log = structlog.get_logger()

# Use contextvars für request_id propagation
from contextvars import ContextVar
request_id_ctx = ContextVar("request_id", default=None)

structlog.contextvars.bind_contextvars(request_id=request_id)
log.info("user_login", user_id_hash=hash(user_id), success=True)
```

- Levels: DEBUG=dev only, INFO=state transitions, WARN=recoverable, ERROR=actionable, CRITICAL=pager.
- Retention: 30d hot, 90d cold, 1y archive.
- **Anti-Pattern:** `logger.info("phase3=true ...")` plain text — ungreppable across requests, no correlation.

### Error Tracking
- Every unhandled exception ships to Sentry with `release`, `environment`, `request_id`, `user.id` tag. Source maps uploaded in CI before deploy promotes.
- Custom `fingerprint` for grouping (e.g. `["{{ default }}", "{{ tags.provider }}", "{{ tags.error_code }}"]` so Anthropic-429 und OpenAI-429 don't collapse).
- Alert auf **new issue in last 24h** + **regression**, not on volume of known issues.
- Client-side rate-limit before SDK send to avoid quota burn.
- **Anti-Pattern:** Audit-log writes catching UUID-cast errors and `pass` — never surface in Sentry. Always log + capture with severity=warning before swallowing.

### Metrics & Alerting
- **RED** für request-driven services (Rate, Errors, Duration p50/p95/p99); **USE** für resources (Utilization, Saturation, Errors). Alert auf **SLOs**, not raw thresholds.
- Define SLI = good-events / total-events. Burn-rate alerts: page on 2% budget burned in 1h (fast) AND 5% in 6h (slow) — Google's multiwindow/multi-burn-rate technique.
- Every alert needs runbook link in description.
- **Anti-Pattern:** "CPU > 80%" pager → ignored within week (alert fatigue). Replace with "checkout latency p99 > 2s over 5m AND error budget burning".

### Tracing
- OpenTelemetry is standard — one SDK, swap backends (Tempo, Honeycomb, Datadog) via OTLP exporter.
- Auto-instrument FastAPI + httpx + asyncpg. Add span attributes for `llm.provider`, `llm.model`, `llm.tokens.in/out`, `db.statement_hash`.
- Sampling: head-based `TraceIdRatioBased(0.1)` für normal traffic, **always-sample errors** und slow requests via tail sampling at collector.
- **Anti-Pattern:** 100% sampling in prod (cost explosion); 1% sampling without error-bias.

---

## 13. Availability und Recovery

### Background Jobs & Queueing
- Anything that can fail, retry, or take >100ms belongs in queue — not in `asyncio.create_task` inside request handler (lost on worker death).
- **ARQ** (Redis, async-native, fits FastAPI) for moderate scale; **Celery/RabbitMQ** for serious durability + routing.
- All jobs idempotent via business-key dedupe (`order_id` + Redis `SETNX`).
- Retry: exponential backoff with jitter, max 5 attempts, then DLQ.
- Schedule cleanup jobs explicitly (pending-image GC, audit retention, expired invites).
- **Anti-Pattern:** No cleanup jobs → tables grow unbounded. `CancelledError` leaks rows — wrap in `try/finally` that marks row failed in separate transaction.

### Graceful Shutdown
- SIGTERM means "stop accepting new work, finish in-flight, exit cleanly". Default 30s grace zu kurz für LLM streams — set `terminationGracePeriodSeconds: 90`.
- preStop hook = `sleep 10` (lets LB deregister) then SIGTERM. FastAPI lifespan handler awaits open SSE streams up to deadline; cancel pending provider calls and persist "shutdown" marker on partial rows.
- Run app as PID 1 (oder use `tini`) so it actually receives SIGTERM.
- **Anti-Pattern:** SIGTERM kills mid-stream → provider still bills, user sees gap, no assistant message.

### Disaster Recovery
- Set explicit **RTO** (how long down) and **RPO** (how much data loss) per service tier.
- Tier-1: RTO 15min / RPO 1min. Tier-3: RTO 24h / RPO 24h.
- Continuous WAL archiving + daily base backup → Postgres PITR to any second within retention.
- Off-region S3 copy. Restore drill quarterly (untested backups don't exist).
- Document restore runbook with exact commands.
- **Anti-Pattern:** "We have nightly dumps" with no documented restore time and no test.

### Availability Patterns
- Every network call has timeout, retry policy, and circuit breaker. **No exceptions.**
- Per-provider circuit breaker (`purgatory`, `pybreaker`): open after 5 failures in 60s, half-open after 30s.
- Timeouts at each layer: client 60s > app 50s > provider call 45s.
- Bulkhead per provider — Anthropic outage must not exhaust OpenAI worker pool.
- Fallback responses: cached answer, degraded model, friendly "try again" page.
- **Anti-Pattern:** No retry/backoff in provider calls — first 429 becomes 502 to user. Add `tenacity` with exponential backoff + jitter on 429/5xx only.

### Chaos & Failure Injection
- You don't know if recovery works until you break something on purpose. Start in staging with tight blast radius, time-boxed, with kill switch.
- Quarterly **game days**: pre-written hypothesis, inject (iptables drop, `tc qdisc add delay 500ms`, kill pod), observe, write findings.
- Tools: Gremlin, AWS FIS, Litmus, plain `kubectl delete pod`.
- **Anti-Pattern:** Chaos in prod with no rollback plan, or chaos in staging that doesn't mirror prod traffic.

### Incident Response
- Severity levels are shared vocabulary, not blame. SEV-1 = customer-facing outage (page immediately, war room). SEV-2 = degraded (page during business hours). SEV-3 = minor (ticket).
- Every alert links to runbook. Incident roles: Incident Commander, Comms, Scribe — rotated, not heroic.
- **Blameless postmortem** within 5 business days using fixed template: timeline, root cause, contributing factors, action items with owners and dates.
- Track action-item completion as SLO of its own.
- **Anti-Pattern:** "Why did Alice push on Friday?" — focuses on person, not system that allowed untested push at 5pm. Replace with "what guardrail was missing?"

---

## Konsolidierte Anti-Patterns über alle 13 Kategorien

| Pattern-ID | Anti-Pattern | Kategorie | Fix |
|---|---|---|---|
| P1 | Read-modify-write in app layer | DB | Atomic UPDATE … WHERE … RETURNING / `SELECT ... FOR UPDATE` / `pg_advisory_xact_lock` |
| P2 | F-string PostgREST filter | DB | Typed builders / RPC mit parameterized SQL |
| P3 | Sync I/O in async handler | Backend | `asyncio.to_thread` / async client |
| P5 | `detail=str(e)` mit upstream body | Backend | Generic 502 + secret-scrub + server-log |
| P6 | Module-scope `t()` evaluation | Frontend | Render-time `t()` calls |
| P7 | Pydantic ohne `extra='forbid'` | Backend | `model_config = ConfigDict(extra='forbid')` + Field-Bounds |
| P8 | Silent exception swallow | Frontend+Backend | Bubble errors, alert, structured log |
| P9 | Missing audit on admin mutation | Backend | Audit-Wrapper at endpoint boundary |
| P10 | Defense-in-depth route-only | Auth | RLS at DB layer + service layer + route layer |
| P11 | localStorage-JWT + no rotation | Frontend | BFF / in-memory access + httpOnly refresh cookie |

## Sources (konsolidiert pro Kategorie)

### Frontend
- [Zustand Guide](https://react.wiki/state-management/zustand-tutorial/)
- [Auth0 Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [MDN — Using SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [react-error-boundary](https://certificates.dev/blog/error-handling-in-react-with-react-error-boundary)
- [No Need to Trap Focus on Dialog — CSS-Tricks](https://css-tricks.com/there-is-no-need-to-trap-focus-on-a-dialog-element/)
- [react-i18next ICU](https://react.i18next.com/misc/using-with-icu-format)
- [Vite CSP Guard](https://vite-csp.tsotne.co.uk/guides/spa)
- [rehype-sanitize](https://www.npmjs.com/package/rehype-sanitize)
- [useEffectEvent](https://blog.logrocket.com/react-useeffectevent/)

### Backend
- [FastAPI async](https://fastapi.tiangolo.com/async/)
- [FastAPI BackgroundTasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Pydantic Strict Mode](https://docs.pydantic.dev/latest/concepts/strict_mode/)
- [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)
- [OWASP API Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)
- [TaskGroup Python 3.11+](https://docs.python.org/3/library/asyncio-task.html#task-groups)

### Database
- [CVE-2018-1058 search_path](https://wiki.postgresql.org/wiki/A_Guide_to_CVE-2018-1058:_Protect_Your_Search_Path)
- [PostgreSQL UPSERT](https://wiki.postgresql.org/wiki/UPSERT)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [pgvector](https://github.com/pgvector/pgvector)
- [Tiger Data BM25+Vector+RRF](https://www.tigerdata.com/blog/elasticsearchs-hybrid-search-now-in-postgres-bm25-vector-rrf)
- [Cybertec: Abusing SECURITY DEFINER](https://www.cybertec-postgresql.com/en/abusing-security-definer-functions/)

### Auth/Security
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP LLM Top 10 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [Trail of Bits Key Derivation](https://blog.trailofbits.com/2025/01/28/best-practices-for-key-derivation/)
- [RFC 5869 HKDF](https://datatracker.ietf.org/doc/html/rfc5869)

### Hosting/CI/CD
- [Docker Hardened Images](https://docs.docker.com/dhi/core-concepts/signatures/)
- [uv lockfile](https://docs.astral.sh/uv/guides/projects/)
- [GitHub Actions best-practices](https://github.com/github/awesome-copilot/blob/main/instructions/github-actions-ci-cd-best-practices.instructions.md)
- [Trunk-based vs Gitflow](https://mergify.com/blog/trunk-based-development-vs-gitflow-which-branching-model-actually-works/)
- [Supabase Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Coolify Health Checks](https://coolify.io/docs/knowledge-base/health-checks)

### Rate Limiting / Caching
- [SlowAPI](https://github.com/laurentS/slowapi)
- [Redis Semantic Caching](https://redis.io/blog/what-is-semantic-caching/)
- [Cloudflare Revalidation](https://developers.cloudflare.com/cache/concepts/revalidation/)
- [Litestar GHSA-hm36-ffrh-c77c (XFF bypass)](https://github.com/litestar-org/litestar/security/advisories/GHSA-hm36-ffrh-c77c)

### Scaling / Observability
- [FastAPI Server Workers](https://fastapi.tiangolo.com/deployment/server-workers/)
- [Google SRE Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/)
- [Sentry Fingerprint Rules](https://docs.sentry.io/concepts/data-management/event-grouping/fingerprint-rules/)
- [Markaicode LLM Circuit Breakers](https://markaicode.com/circuit-breakers-llm-api-reliability/)

### Availability/Recovery
- [Kubernetes Liveness/Readiness Probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [GCP Terminating with Grace](https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace)
- [PostgreSQL Continuous Archiving](https://www.postgresql.org/docs/current/continuous-archiving.html)
- [Stormatics PostgreSQL DR](https://stormatics.tech/blogs/understanding-disaster-recovery-in-postgresql)
- [Hyperping Blameless Post-Mortems](https://hyperping.com/blog/incident-post-mortem)

---

## Verweise

- **Codebase-spezifische Anwendung:** `docs/BEST-PRACTICES-DRAFT.md` (11 Pattern-Klassen P1–P11 mit Code-Beispielen aus xqt5)
- **Konkrete Bug-Findings:** `docs/BUG-AUDIT-2026-05-13.md` (~249 Findings über 12 Sweep-Runden)
- **Fix-Action-Doc:** `docs/BUG-FIX-PLAYBOOK.md` (62 kritische Findings in 12 Gruppen mit Workflow)
- **Doku-Disziplin:** Memory `feedback_doc_maintenance.md`
- **Deployment-Workflow:** Memory `project_xqt5_deployment.md`
