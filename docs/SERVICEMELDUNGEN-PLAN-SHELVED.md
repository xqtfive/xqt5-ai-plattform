# Servicemeldungen — Shelved Feature Plan (2026-05-12)

Planning work for an admin-issued announcement banner feature. **Plan reached v3 after four critical-review passes; implementation was deferred** in favor of higher-priority work (image generation). All decisions below are locked unless explicitly noted; pick up from here when reviving.

## Feature summary

Admins create plain-text announcements ("Servicemeldungen") in a new **Service** tab of `AdminDashboard`. All authenticated users see active announcements as a top banner. Click X to dismiss; dismissals persist via localStorage with edit-invalidation. Banners are independent of LLM, RAG, pools, and chat flows — purely an informational UI layer.

## Locked decisions

| Decision | Value |
|---|---|
| Tab label (German) | "Service" |
| Items called | "Servicemeldungen" |
| Severity levels | `info`, `warning`, `critical` |
| Body format | plain text only, max 1000 chars, no HTML/markdown |
| Title | optional, max 200 chars |
| Title required? | no |
| Severity icons in banner? | no — colored left stripe + tint only |
| Schedule fields (starts_at / ends_at)? | no for v1 — only `is_active` toggle |
| Dismissal persistence | **localStorage with edit-invalidation** (Option C from the dismissal brainstorm). Server-side dismissal table NOT in v1. |
| Multiple active notices | stack vertically, newest first, banner stack capped at `max-height: 120px` with scroll |
| Severity targeting | all authenticated users see all active notices — no role/pool targeting |
| Rate limit on admin writes | 20/min per user (matches existing admin endpoints) |
| `updated_at` management | app-side via `datetime.now(timezone.utc).isoformat()` (no DB trigger — project convention) |
| Active-user delivery | **Pattern C**: fetch on mount + tab-focus refetch (`visibilitychange`) + slow 5-min timer + admin-self-refetch on create/edit/delete + ETag for cheap polls (304 Not Modified) |
| Admin sees own banner instantly after create | yes — banner exposes `refetch()` callback wired into ServiceNoticesTab |
| Layout integration | restructure `.app` to `flex-direction: column`, wrap NavRail + Sidebar + Main in new `.app-body` (`display: flex; flex-direction: row; flex: 1; min-height: 0; position: relative`). AssistantManager/TemplateManager modal renders stay at `.app` level. |
| Mobile drawer | unchanged behavior — `.content-panel`'s mobile media query continues to work; `top/bottom: 8px` now resolves relative to `.app-body` (which has `position: relative`) |

## Data model (locked)

```sql
CREATE TABLE app_service_notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,                                       -- nullable
  body        TEXT NOT NULL CHECK (length(body) <= 1000),
  severity    TEXT NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info','warning','critical')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_service_notices_active_created
  ON app_service_notices(is_active, created_at DESC) WHERE is_active = true;
CREATE INDEX idx_app_service_notices_created
  ON app_service_notices(created_at DESC);
REVOKE ALL ON TABLE app_service_notices FROM anon;
```

Migration filename: `supabase/migrations/20260512_b_app_service_notices.sql` (the `_b_` suffix because `20260512_pool_chat_messages_created_idx.sql` from earlier the same day is the implicit `_a_`).

## Backend (locked)

**New module** `backend/app/service_notices.py` (parallel to `pools.py`, `pool_chats.py`). CRUD helpers: `create`, `list_all` (admin), `list_active` (user-facing), `get`, `update`, `delete`.

**Pydantic models** in `models.py`:
```python
class ServiceNoticeCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    body: str = Field(min_length=1, max_length=1000)
    severity: Literal["info", "warning", "critical"] = "info"
    is_active: bool = True

class ServiceNoticeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    body: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    severity: Optional[Literal["info", "warning", "critical"]] = None
    is_active: Optional[bool] = None

class ServiceNotice(BaseModel):
    id: str
    title: Optional[str] = None
    body: str
    severity: Literal["info", "warning", "critical"]
    is_active: bool
    created_at: str
    created_by: Optional[str] = None
    updated_at: Optional[str] = None
    username: Optional[str] = None  # flattened from nested app_users(username) join
```

**Endpoints** in `main.py`:
- `GET    /api/admin/service-notices` (admin gate, no rate limit, returns full list with username via nested select)
- `POST   /api/admin/service-notices` (admin gate, **20/min**)
- `PATCH  /api/admin/service-notices/{id}` (admin gate, **20/min**)
- `DELETE /api/admin/service-notices/{id}` (admin gate, **20/min**)
- `GET    /api/service-notices` (any auth, no rate limit, returns active only, supports `If-None-Match` → 304 with ETag)

ETag computed as a hash of `(max(updated_at), count(active))` — cheap to compute, changes when any active notice changes.

**Username join pattern** (matches `audit.py:56-79`):
```python
result = supabase.table("app_service_notices").select(
    "id,title,body,severity,is_active,created_by,created_at,updated_at,app_users(username)"
).order("created_at", desc=True).execute()
for row in (result.data or []):
    user_info = row.pop("app_users", None)
    row["username"] = user_info.get("username") if user_info else None
```

**Audit logging** in `audit.py` — new constants:
```python
ADMIN_SERVICE_NOTICE_CREATE = "admin.service_notice.create"
ADMIN_SERVICE_NOTICE_UPDATE = "admin.service_notice.update"
ADMIN_SERVICE_NOTICE_DELETE = "admin.service_notice.delete"
```
Metadata logged on each event: `severity`, `body_length`, `is_active`, `title_provided`. **Body content NOT logged** (could contain operational secrets).

## Frontend (locked)

**New file** `frontend/src/components/ServiceNoticeBanner.jsx`:
- Mounted as first child of `.app` (above `.app-body`) in `App.jsx`
- Internal state: `notices` array, `dismissedIds` from localStorage
- Fetches: on mount after `user` is set, on `visibilitychange` → visible, on 5-min timer, exposes `refetch()` for admin self-refresh
- ETag handling: send `If-None-Match` on every request, skip state update on 304
- Dismissal: `localStorage["service-notice-dismissals"]` = `{ "<id>": "<notice.updated_at>" }`. On render, filter out notices where dismissal's `updated_at` matches or is newer than the current notice's `updated_at`
- Error: `console.warn('Service notices fetch failed', err)`, render nothing
- Layout: container is always rendered (height: 0 when empty) so first-load fetch doesn't push content down

**New `ServiceNoticesTab` inside `AdminDashboard.jsx`** — pattern mirrors `UsersTab` / `ModelsTab`:
- Top-row "Neue Servicemeldung" button opens a `<Modal>`
- Table columns: severity badge, title, body preview (truncated 80 chars), is_active toggle, created_at, created_by username, actions (Bearbeiten / Löschen)
- Form: severity dropdown, title input, body textarea (`maxLength={1000}` + char counter), is_active checkbox
- Delete via `useConfirm()` hook
- On create/edit/delete success: calls the banner's `refetch()` callback (via lifted state in App.jsx or context)

**Add to `AdminDashboard.jsx` TABS array** at end:
```jsx
{ id: 'service', label: t('admin.service.tab.label') }
```
Both the TABS entry AND the conditional render `{activeTab === 'service' && <ServiceNoticesTab />}` must land in the same commit (silent failure if only one).

**`api.js` methods** (5):
- `listServiceNotices()`
- `adminListServiceNotices()`
- `adminCreateServiceNotice(data)`
- `adminUpdateServiceNotice(id, data)`
- `adminDeleteServiceNotice(id)`

## CSS (locked)

New rules in `styles.css`:
```css
/* New top-level layout wrapper for the existing flex-row */
.app-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  position: relative;
}
.app {
  /* change from display: flex (row) to flex column with banner stack on top */
  flex-direction: column;
}

/* Banner stack */
.service-notice-banner-stack {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  max-height: 120px;
  overflow-y: auto;
}

/* Per-notice card */
.service-notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-left: 4px solid;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-white);
}
.service-notice-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.service-notice-title   { font-size: 14px; font-weight: 600; color: var(--color-dark); }
.service-notice-body    { font-size: 13px; color: var(--color-text); white-space: pre-line; }
.service-notice-dismiss { /* mirror .modal-close */ }

/* Severity variants */
.service-notice.info     { border-left-color: var(--color-dark);    background: rgba(33, 52, 82, 0.06); }
.service-notice.warning  { border-left-color: var(--color-warning); background: rgba(255, 193, 7, 0.12); }
.service-notice.critical { border-left-color: var(--color-error);   background: rgba(220, 53, 69, 0.10); }

/* Admin tab severity badges */
.admin-service-severity-badge.info     { background: rgba(33, 52, 82, 0.12); color: var(--color-dark); }
.admin-service-severity-badge.warning  { background: rgba(255, 193, 7, 0.15); color: #856404; }
.admin-service-severity-badge.critical { background: rgba(220, 53, 69, 0.10); color: var(--color-error); }
```

Mobile media query (`@media (max-width: 768px)`) needs minor tweaks but no structural changes — the existing rules for `.content-panel` continue to work because `.app-body` has `position: relative`.

## i18n keys (24 total, German values)

Full list in the prior planning agent output; key prefixes are `admin.service.*` and `notice.banner.*`. Notable:
- `admin.service.tab.label`: "Service"
- `admin.service.heading`: "Servicemeldungen"
- `admin.service.severity.{info,warning,critical}`: "Information" / "Warnung" / "Kritisch"
- `admin.service.field.body.hint`: "max. 1000 Zeichen"
- `admin.service.delete.confirm.title`: "Servicemeldung löschen?"
- `notice.banner.dismiss`: "Hinweis schließen" (aria-label)

## Cross-agent contracts (for the implementation team that wasn't spawned)

1. **Response shape**: every endpoint returns `{id, title, body, severity, is_active, created_by, created_at, updated_at, username}`. Frontend destructures this literally.
2. **Audit action strings**: `admin.service_notice.create / update / delete`.
3. **CSS class names**: as listed in the CSS block above.
4. **App.jsx ownership**: frontend impl agent owns the JSX restructure + `app-body` class; CSS impl only adds rules.
5. **TABS entry + conditional render**: same commit, frontend impl.

## Implementation team that would have run (for reference when reviving)

- 1 backend agent: `service_notices.py`, `models.py`, `audit.py`, `main.py`, migration SQL
- 1 frontend agent: `ServiceNoticeBanner.jsx`, `ServiceNoticesTab` in AdminDashboard.jsx, `api.js`, `i18n/strings.js`, `App.jsx` (banner mount + `.app-body` wrap)
- 1 CSS agent: `styles.css` (new rules only)
- 1 docs agent: 6 docs (IMPLEMENTIERT, UMSETZUNGS, ADMIN-DOKUMENT, ANWENDER-DOKUMENT, FEATURE-DOKUMENT, SECURITY)
- 2 verification agents: one for backend, one for frontend integration

## Status when shelved

- 4 critical-review passes completed (α layout, β backend/naming, γ JSX+Supabase, δ end-to-end flows)
- All 7+ reviewer adjustments folded into plan v3
- One last open question on dismissal-persistence resolved (Option C — localStorage with edit-invalidation)
- Implementation team had been designed and brief contents drafted, but agents not spawned
- Deferred 2026-05-12 in favor of image generation feature

## How to revive

1. Re-read this doc as the source of truth
2. Verify the locked decisions are still desired
3. Re-run a quick sanity-check reviewer pass on changes to the codebase since 2026-05-12 (especially anything that touched `App.jsx` layout or `AdminDashboard.jsx` tabs)
4. Spawn the 4+2 implementation team with the contracts above
5. Run the SQL migration manually against dev (and later prod) Supabase
6. Tag `pre-servicemeldungen` before the implementation commit for easy rollback
