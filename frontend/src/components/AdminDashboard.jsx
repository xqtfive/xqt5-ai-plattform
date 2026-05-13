import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n/strings'
import { useConfirm } from './ConfirmDialog'

const TABS = [
  { id: 'users', label: 'Benutzer' },
  { id: 'costs', label: 'Kosten' },
  { id: 'stats', label: 'Statistiken' },
  { id: 'retrieval', label: 'Retrieval' },
  { id: 'models', label: t('admin.chatmodelle.tab.label') },
  { id: 'bildmodelle', label: t('admin.bildmodelle.tab.label') },
  { id: 'bild_stil', label: t('admin.bild_stil.tab.label') },
  { id: 'providers', label: 'Provider' },
  { id: 'audit', label: 'Audit-Logs' },
]

export default function AdminDashboard({ onClose, currentUser }) {
  const [activeTab, setActiveTab] = useState('users')

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h2>Admin-Dashboard</h2>
        <button className="btn btn-secondary" onClick={onClose}>
          Zurück zum Chat
        </button>
      </div>

      <div className="admin-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {activeTab === 'users' && <UsersTab currentUser={currentUser} />}
        {activeTab === 'costs' && <CostsTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'retrieval' && <RetrievalTab />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'bildmodelle' && <BildmodelleTab />}
        {activeTab === 'bild_stil' && <BildStilTab />}
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

function UsersTab({ currentUser }) {
  const confirm = useConfirm()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const data = await api.adminListUsers()
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleUser(userId, field, value) {
    setError('')
    try {
      await api.adminUpdateUser(userId, { [field]: value })
      await loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(userId, username) {
    const ok = await confirm({
      title: 'Benutzer deaktivieren?',
      message: `Der Benutzer "${username}" wird deaktiviert und kann sich nicht mehr anmelden.`,
      confirmLabel: 'Deaktivieren',
      destructive: true,
    })
    if (!ok) return
    setError('')
    try {
      await api.adminDeleteUser(userId)
      await loadUsers()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="admin-loading">Laden...</div>

  const filteredUsers = showInactive ? users : users.filter((u) => u.is_active)

  return (
    <div>
      {error && <div className="admin-error">{error}</div>}
      <label className="form-checkbox" style={{ marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={showInactive}
          onChange={() => setShowInactive(!showInactive)}
        />
        Deaktivierte anzeigen
      </label>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Registriert</th>
            <th>Aktiv</th>
            <th>Admin</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((u) => (
            <tr key={u.id} className={!u.is_active ? 'user-inactive' : ''}>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>{new Date(u.created_at).toLocaleDateString('de-DE')}</td>
              <td>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={u.is_active}
                    onChange={() => toggleUser(u.id, 'is_active', !u.is_active)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={u.is_admin}
                    onChange={() => toggleUser(u.id, 'is_admin', !u.is_admin)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td>
                <button
                  className="btn btn-danger btn-small"
                  disabled={currentUser && u.id === currentUser.id}
                  onClick={() => handleDelete(u.id, u.username)}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CostsTab() {
  const [data, setData] = useState(null)
  const [imageData, setImageData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadUsage()
  }, [])

  async function loadUsage(start, end) {
    setLoading(true)
    setError('')
    try {
      const [tokenResult, imageResult] = await Promise.all([
        api.adminGetUsage(start, end),
        api.adminGetImageUsage({ start_date: start, end_date: end }).catch(() => null),
      ])
      setData(tokenResult)
      setImageData(imageResult)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    loadUsage(startDate || undefined, endDate || undefined)
  }

  function handleReset() {
    setStartDate('')
    setEndDate('')
    loadUsage()
  }

  if (loading && !data) return <div className="admin-loading">Laden...</div>
  if (error && !data) return <div className="admin-error">{error}</div>
  if (!data) return null

  const s = data.summary

  return (
    <div>
      {/* Date Filters */}
      <div className="token-filters">
        <div className="token-filter-row">
          <div className="token-filter-group">
            <label>Startdatum</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="token-filter-group">
            <label>Enddatum</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-small" onClick={handleApply} disabled={loading}
            style={{ alignSelf: 'flex-end' }}>
            {loading ? 'Laden...' : 'Anwenden'}
          </button>
          {(startDate || endDate) && (
            <button className="btn btn-secondary btn-small" onClick={handleReset}
              style={{ alignSelf: 'flex-end' }}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {/* 4 Summary Cards */}
      <div className="admin-cards">
        <div className="admin-card">
          <div className="admin-card-label">Anfragen</div>
          <div className="admin-card-value">{s.total_requests.toLocaleString()}</div>
        </div>
        <div className="admin-card">
          <div className="admin-card-label">Gesamt-Tokens</div>
          <div className="admin-card-value">{s.total_tokens.toLocaleString()}</div>
        </div>
        <div className="admin-card">
          <div className="admin-card-label">Geschätzte Kosten</div>
          <div className="admin-card-value">${s.estimated_cost.toFixed(4)}</div>
        </div>
        <div className="admin-card">
          <div className="admin-card-label">Prompt / Completion</div>
          <div className="admin-card-value">{s.total_prompt_tokens.toLocaleString()}</div>
          <div className="admin-card-sub">{s.total_completion_tokens.toLocaleString()} Completion</div>
        </div>
      </div>

      {/* By Provider */}
      <h3 className="admin-section-title">Nach Provider</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Anfragen</th>
            <th>Tokens</th>
            <th>Kosten</th>
          </tr>
        </thead>
        <tbody>
          {data.by_provider.map((p) => (
            <tr key={p.provider}>
              <td><span className="provider-badge">{p.provider}</span></td>
              <td>{p.requests.toLocaleString()}</td>
              <td>{p.tokens.toLocaleString()}</td>
              <td>${p.estimated_cost.toFixed(4)}</td>
            </tr>
          ))}
          {data.by_provider.length === 0 && (
            <tr><td colSpan="4" className="admin-empty-cell">Keine Daten</td></tr>
          )}
        </tbody>
      </table>

      {/* By Model */}
      <h3 className="admin-section-title">Nach Modell</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Modell</th>
            <th>Provider</th>
            <th>Anfragen</th>
            <th>Avg Tokens</th>
            <th>Kosten</th>
          </tr>
        </thead>
        <tbody>
          {data.by_model.map((m) => (
            <tr key={m.model}>
              <td><code>{m.model}</code></td>
              <td><span className="provider-badge">{m.provider}</span></td>
              <td>{m.requests.toLocaleString()}</td>
              <td>{m.avg_tokens.toLocaleString()}</td>
              <td>${m.estimated_cost.toFixed(4)}</td>
            </tr>
          ))}
          {data.by_model.length === 0 && (
            <tr><td colSpan="5" className="admin-empty-cell">Keine Daten</td></tr>
          )}
        </tbody>
      </table>

      {/* By User */}
      <h3 className="admin-section-title">Nach Benutzer</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Anfragen</th>
            <th>Tokens</th>
            <th>Kosten</th>
          </tr>
        </thead>
        <tbody>
          {data.by_user.map((u) => (
            <tr key={u.user_id}>
              <td>{u.username}</td>
              <td>{u.requests.toLocaleString()}</td>
              <td>{u.tokens.toLocaleString()}</td>
              <td>${u.estimated_cost.toFixed(4)}</td>
            </tr>
          ))}
          {data.by_user.length === 0 && (
            <tr><td colSpan="4" className="admin-empty-cell">Keine Daten</td></tr>
          )}
        </tbody>
      </table>

      {/* Daily Usage */}
      <h3 className="admin-section-title">Tägliche Nutzung</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Anfragen</th>
            <th>Tokens</th>
            <th>Kosten</th>
          </tr>
        </thead>
        <tbody>
          {data.daily.map((d) => (
            <tr key={d.date}>
              <td>{new Date(d.date + 'T00:00:00').toLocaleDateString('de-DE')}</td>
              <td>{d.requests.toLocaleString()}</td>
              <td>{d.tokens.toLocaleString()}</td>
              <td>${d.estimated_cost.toFixed(4)}</td>
            </tr>
          ))}
          {data.daily.length === 0 && (
            <tr><td colSpan="4" className="admin-empty-cell">Keine Daten</td></tr>
          )}
        </tbody>
      </table>

      {/* ── Bild-Kosten ── */}
      <section className="admin-kosten-bild-section">
        <h2 className="admin-section-title" style={{ marginTop: 32, fontSize: 18 }}>
          {t('admin.kosten.bild.heading')}
        </h2>

        {imageData ? (
          <>
            {imageData.summary && (
              <div className="admin-cards" style={{ marginBottom: 16 }}>
                <div className="admin-card">
                  <div className="admin-card-label">{t('admin.kosten.bild.total')}</div>
                  <div className="admin-card-value">
                    ${(imageData.summary.total_cost_usd ?? 0).toFixed(4)}
                  </div>
                </div>
                {imageData.summary.total_images != null && (
                  <div className="admin-card">
                    <div className="admin-card-label">Bilder generiert</div>
                    <div className="admin-card-value">
                      {imageData.summary.total_images.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            <h3 className="admin-section-title">{t('admin.kosten.bild.per_user')}</h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Bilder</th>
                  <th>Kosten (USD)</th>
                </tr>
              </thead>
              <tbody>
                {(imageData.by_user || []).map((u) => (
                  <tr key={u.user_id || u.username}>
                    <td>{u.username || u.user_id}</td>
                    <td>{(u.image_count ?? u.count ?? 0).toLocaleString()}</td>
                    <td>${(u.cost_usd ?? u.estimated_cost ?? 0).toFixed(4)}</td>
                  </tr>
                ))}
                {(imageData.by_user || []).length === 0 && (
                  <tr><td colSpan="3" className="admin-empty-cell">Keine Daten</td></tr>
                )}
              </tbody>
            </table>

            <h3 className="admin-section-title" style={{ marginTop: 16 }}>
              {t('admin.kosten.bild.per_model')}
            </h3>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Modell</th>
                  <th>Bilder</th>
                  <th>Kosten (USD)</th>
                </tr>
              </thead>
              <tbody>
                {(imageData.by_model || []).map((m) => (
                  <tr key={m.model}>
                    <td><code>{m.model}</code></td>
                    <td>{(m.image_count ?? m.count ?? 0).toLocaleString()}</td>
                    <td>${(m.cost_usd ?? m.estimated_cost ?? 0).toFixed(4)}</td>
                  </tr>
                ))}
                {(imageData.by_model || []).length === 0 && (
                  <tr><td colSpan="3" className="admin-empty-cell">Keine Daten</td></tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <div className="admin-empty-cell" style={{ padding: '24px 0', textAlign: 'left' }}>
            Keine Bild-Kostendaten verfügbar — Endpunkt noch nicht konfiguriert.
          </div>
        )}
      </section>
    </div>
  )
}

function StatsTab() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.adminGetStats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="admin-loading">Laden...</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!stats) return null

  const items = [
    { label: 'Benutzer gesamt', value: stats.total_users },
    { label: 'Aktive Benutzer', value: stats.active_users },
    { label: 'Chats', value: stats.total_chats },
    { label: 'Nachrichten', value: stats.total_messages },
    { label: 'Assistenten', value: stats.total_assistants },
    { label: 'Templates', value: stats.total_templates },
  ]

  return (
    <div className="admin-cards">
      {items.map((item) => (
        <div className="admin-card" key={item.label}>
          <div className="admin-card-label">{item.label}</div>
          <div className="admin-card-value">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function RetrievalTab() {
  const confirm = useConfirm()
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({
    rerank_enabled: false,
    rerank_candidates: 20,
    rerank_top_n: 6,
    rerank_model: 'rerank-v3.5',
    embedding_provider: 'openai',
    embedding_deployment: '',
    contextual_retrieval_enabled: false,
    contextual_retrieval_model: 'claude-haiku-4-5-20251001',
    neighbor_chunks_enabled: true,
    max_context_tokens: 6000,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rechunkStatus, setRechunkStatus] = useState(null)
  const rechunkIntervalRef = useRef(null)

  useEffect(() => {
    loadSettings()
    loadRechunkStatus()
    return () => { if (rechunkIntervalRef.current) clearInterval(rechunkIntervalRef.current) }
  }, [])

  async function loadRechunkStatus() {
    try {
      const data = await api.adminGetRechunkStatus()
      setRechunkStatus(data)
    } catch (_) {}
  }

  function startPolling() {
    if (rechunkIntervalRef.current) clearInterval(rechunkIntervalRef.current)
    rechunkIntervalRef.current = setInterval(async () => {
      try {
        const data = await api.adminGetRechunkStatus()
        setRechunkStatus(data)
        if (data.state !== 'running') {
          clearInterval(rechunkIntervalRef.current)
          rechunkIntervalRef.current = null
        }
      } catch (_) {}
    }, 1000)
  }

  async function handleRechunk() {
    const ok = await confirm({
      title: 'Chunks neu generieren?',
      message:
        'Alle bestehenden Chunks werden gelöscht und neu generiert.\n' +
        'Das kann je nach Dokumentanzahl mehrere Minuten dauern und verursacht OpenAI-Embedding-Kosten.',
      confirmLabel: 'Fortfahren',
      cancelLabel: 'Abbrechen',
    })
    if (!ok) return
    try {
      await api.adminRechunkDocuments()
      setRechunkStatus({ state: 'running', progress: { done: 0, total: 0 } })
      startPolling()
    } catch (e) {
      setError(e.message)
    }
  }

  async function loadSettings() {
    setLoading(true)
    setError('')
    try {
      const data = await api.adminGetRagSettings()
      setSettings(data)
      setForm({
        rerank_enabled: !!data.rerank_enabled,
        rerank_candidates: data.rerank_candidates ?? 20,
        rerank_top_n: data.rerank_top_n ?? 6,
        rerank_model: data.rerank_model || 'rerank-v3.5',
        embedding_provider: data.embedding_provider || 'openai',
        embedding_deployment: data.embedding_deployment || '',
        contextual_retrieval_enabled: !!data.contextual_retrieval_enabled,
        contextual_retrieval_model: data.contextual_retrieval_model || 'claude-haiku-4-5-20251001',
        neighbor_chunks_enabled: data.neighbor_chunks_enabled !== false,
        max_context_tokens: data.max_context_tokens ?? 6000,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        rerank_enabled: !!form.rerank_enabled,
        rerank_candidates: Math.max(5, Math.min(100, Number(form.rerank_candidates) || 20)),
        rerank_top_n: Math.max(1, Math.min(30, Number(form.rerank_top_n) || 6)),
        rerank_model: (form.rerank_model || 'rerank-v3.5').trim(),
        embedding_provider: form.embedding_provider || 'openai',
        embedding_deployment: (form.embedding_deployment || '').trim(),
        contextual_retrieval_enabled: !!form.contextual_retrieval_enabled,
        contextual_retrieval_model: (form.contextual_retrieval_model || 'claude-haiku-4-5-20251001').trim(),
        neighbor_chunks_enabled: !!form.neighbor_chunks_enabled,
        max_context_tokens: Math.max(1000, Math.min(32000, Number(form.max_context_tokens) || 6000)),
      }
      if (payload.rerank_top_n > payload.rerank_candidates) {
        payload.rerank_top_n = payload.rerank_candidates
      }
      const updated = await api.adminUpdateRagSettings(payload)
      setSettings(updated)
      setForm({
        rerank_enabled: !!updated.rerank_enabled,
        rerank_candidates: updated.rerank_candidates ?? payload.rerank_candidates,
        rerank_top_n: updated.rerank_top_n ?? payload.rerank_top_n,
        rerank_model: updated.rerank_model || payload.rerank_model,
        embedding_provider: updated.embedding_provider || payload.embedding_provider,
        embedding_deployment: updated.embedding_deployment ?? payload.embedding_deployment,
        contextual_retrieval_enabled: !!updated.contextual_retrieval_enabled,
        contextual_retrieval_model: updated.contextual_retrieval_model || payload.contextual_retrieval_model,
        neighbor_chunks_enabled: updated.neighbor_chunks_enabled !== false,
        max_context_tokens: updated.max_context_tokens ?? payload.max_context_tokens,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="admin-loading">Laden...</div>

  return (
    <div>
      {error && <div className="admin-error">{error}</div>}

      <form className="admin-model-form" onSubmit={handleSave}>
        <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Embedding-Provider</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Provider</label>
            <select
              className="form-input"
              value={form.embedding_provider}
              onChange={(e) => setForm((f) => ({ ...f, embedding_provider: e.target.value }))}
            >
              <option value="openai">OpenAI</option>
              <option value="azure">Azure OpenAI</option>
            </select>
          </div>
          {form.embedding_provider === 'azure' && (
            <div className="form-group">
              <label>Azure Deployment Name</label>
              <input
                className="form-input"
                value={form.embedding_deployment}
                onChange={(e) => setForm((f) => ({ ...f, embedding_deployment: e.target.value }))}
                placeholder="z.B. text-embedding-3-small-deploy"
              />
            </div>
          )}
        </div>

        <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />
        <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>Reranking</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Reranking aktiviert (Cohere)</label>
            <label className="toggle-switch" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={!!form.rerank_enabled}
                onChange={() => setForm((f) => ({ ...f, rerank_enabled: !f.rerank_enabled }))}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="form-group">
            <label>Rerank Modell</label>
            <input
              className="form-input"
              value={form.rerank_model}
              onChange={(e) => setForm((f) => ({ ...f, rerank_model: e.target.value }))}
              placeholder="rerank-v3.5"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Kandidatenmenge (vor Rerank)</label>
            <input
              className="form-input"
              type="number"
              min="5"
              max="100"
              value={form.rerank_candidates}
              onChange={(e) => setForm((f) => ({ ...f, rerank_candidates: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Top-N (nach Rerank)</label>
            <input
              className="form-input"
              type="number"
              min="1"
              max="30"
              value={form.rerank_top_n}
              onChange={(e) => setForm((f) => ({ ...f, rerank_top_n: e.target.value }))}
            />
          </div>
        </div>

        <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />
        <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>
          {t('admin.rag.section.context_assembly')}
        </h4>
        <div className="form-row">
          <div className="form-group">
            <label>{t('admin.rag.neighbor.label')}</label>
            <label className="toggle-switch" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={!!form.neighbor_chunks_enabled}
                onChange={() => setForm((f) => ({ ...f, neighbor_chunks_enabled: !f.neighbor_chunks_enabled }))}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="provider-hint" style={{ display: 'block', marginTop: 4 }}>
              {t('admin.rag.neighbor.hint')}
            </span>
          </div>
          <div className="form-group">
            <label>{t('admin.rag.max_tokens.label')}</label>
            <input
              className="form-input"
              type="number"
              min="1000"
              max="32000"
              step="500"
              value={form.max_context_tokens}
              onChange={(e) => setForm((f) => ({ ...f, max_context_tokens: e.target.value }))}
            />
            <span className="provider-hint" style={{ display: 'block', marginTop: 4 }}>
              {t('admin.rag.max_tokens.hint')}
            </span>
          </div>
        </div>

        <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />
        <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)' }}>
          {t('admin.rag.section.contextual_retrieval')}
        </h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          {t('admin.rag.contextual.description')}
        </p>
        <div className="form-row">
          <div className="form-group">
            <label>{t('admin.rag.contextual.enabled.label')}</label>
            <label className="toggle-switch" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={!!form.contextual_retrieval_enabled}
                onChange={() => setForm((f) => ({ ...f, contextual_retrieval_enabled: !f.contextual_retrieval_enabled }))}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="form-group">
            <label>{t('admin.rag.contextual.model.label')}</label>
            <input
              className="form-input"
              value={form.contextual_retrieval_model}
              onChange={(e) => setForm((f) => ({ ...f, contextual_retrieval_model: e.target.value }))}
              placeholder="claude-haiku-4-5-20251001"
            />
            <span className="provider-hint" style={{ display: 'block', marginTop: 4 }}>
              {t('admin.rag.contextual.model.hint')}
            </span>
          </div>
        </div>

        <button className="btn btn-primary btn-small" type="submit" disabled={saving}>
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
      </form>

      {settings && (
        <div className="provider-hint" style={{ marginTop: 12 }}>
          Aktive Werte: embedding={settings.embedding_provider}{settings.embedding_provider === 'azure' && settings.embedding_deployment ? `/${settings.embedding_deployment}` : ''}, rerank={String(!!settings.rerank_enabled)}, candidates={settings.rerank_candidates}, top_n={settings.rerank_top_n}, model={settings.rerank_model}, nachbar-chunks={String(settings.neighbor_chunks_enabled !== false)}, max-token={settings.max_context_tokens ?? 6000}, kontext-retrieval={String(!!settings.contextual_retrieval_enabled)}
        </div>
      )}

      <hr style={{ margin: '24px 0', borderColor: 'var(--border)' }} />

      <h3 className="admin-section-title">Dokumente neu verarbeiten</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
        Löscht alle bestehenden Chunks und generiert sie mit dem aktuellen Chunker neu.
        OCR wird nicht erneut ausgeführt. Verursacht OpenAI Embedding-Kosten.
      </p>

      <button
        className="btn btn-secondary btn-small"
        onClick={handleRechunk}
        disabled={rechunkStatus?.state === 'running'}
      >
        {rechunkStatus?.state === 'running' ? 'Läuft...' : 'Jetzt neu chunken'}
      </button>

      {rechunkStatus && rechunkStatus.state !== 'idle' && (
        <div className="provider-hint" style={{ marginTop: 10 }}>
          {rechunkStatus.state === 'running' && (() => {
            const p = rechunkStatus.progress || {}
            return p.total > 0
              ? `Läuft: ${p.done} / ${p.total} Dokumente`
              : 'Re-Chunking läuft...'
          })()}
          {rechunkStatus.state === 'done' && (() => {
            const r = rechunkStatus.result || {}
            return `Fertig: ${r.processed} verarbeitet, ${r.failed} Fehler, ${r.skipped} übersprungen (${r.total} gesamt)`
          })()}
          {rechunkStatus.state === 'error' && `Fehler: ${rechunkStatus.error}`}
        </div>
      )}
    </div>
  )
}

function ModelsTab() {
  const confirm = useConfirm()
  const [models, setModels] = useState([])
  const [providers, setProviders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ provider: '', model_id: '', display_name: '', sort_order: 0, deployment_name: '' })
  const [providerModels, setProviderModels] = useState([])
  const [loadingProviderModels, setLoadingProviderModels] = useState(false)

  useEffect(() => {
    Promise.all([loadModels(), loadProviders()])
  }, [])

  async function loadModels() {
    try {
      const data = await api.adminListModels()
      setModels(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadProviders() {
    try {
      const data = await api.adminListProviders()
      setProviders(data.filter((p) => p.source !== 'none'))
    } catch {}
  }

  async function handleProviderChange(provider) {
    setForm({ provider, model_id: '', display_name: '', sort_order: form.sort_order, deployment_name: '' })
    setProviderModels([])
    if (!provider) return
    setLoadingProviderModels(true)
    try {
      const data = await api.adminListProviderModels(provider)
      setProviderModels(data)
    } catch {
      setProviderModels([])
    } finally {
      setLoadingProviderModels(false)
    }
  }

  function handleModelSelect(modelId) {
    setForm((f) => ({
      ...f,
      model_id: `${f.provider}/${modelId}`,
      display_name: modelId,
    }))
  }

  async function handleToggle(id, field, value) {
    setError('')
    try {
      await api.adminUpdateModel(id, { [field]: value })
      await loadModels()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleSetDefault(id) {
    setError('')
    try {
      await api.adminUpdateModel(id, { is_default: true })
      await loadModels()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: 'Modell löschen?',
      message: 'Dieses Modell steht danach nicht mehr zur Auswahl.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (!ok) return
    setError('')
    try {
      await api.adminDeleteModel(id)
      await loadModels()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...form }
      if (!payload.deployment_name) delete payload.deployment_name
      await api.adminCreateModel(payload)
      setForm({ provider: '', model_id: '', display_name: '', sort_order: 0, deployment_name: '' })
      setProviderModels([])
      setShowForm(false)
      await loadModels()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="admin-loading">Laden...</div>

  const selectedModelId = form.model_id ? form.model_id.split('/').slice(1).join('/') : ''

  return (
    <div>
      {error && <div className="admin-error">{error}</div>}

      <button className="btn btn-primary btn-small" onClick={() => { setShowForm(!showForm); setProviderModels([]) }} style={{ marginBottom: 16 }}>
        {showForm ? 'Abbrechen' : 'Neues Modell'}
      </button>

      {showForm && (
        <form className="admin-model-form" onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>Provider</label>
              <select className="form-input" value={form.provider}
                onChange={(e) => handleProviderChange(e.target.value)} required>
                <option value="">Provider wählen…</option>
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>{p.display_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Modell</label>
              {providerModels.length > 0 ? (
                <select className="form-input" value={selectedModelId}
                  onChange={(e) => handleModelSelect(e.target.value)} required>
                  <option value="">Modell wählen…</option>
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </select>
              ) : (
                <input className="form-input"
                  placeholder={loadingProviderModels ? 'Lade Modelle…' : form.provider ? 'model-name' : '— erst Provider wählen —'}
                  disabled={loadingProviderModels || !form.provider}
                  value={selectedModelId}
                  onChange={(e) => setForm({ ...form, model_id: `${form.provider}/${e.target.value}` })}
                  required />
              )}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Display Name</label>
              <input className="form-input" placeholder="Anzeigename" value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Sort Order</label>
              <input className="form-input" type="number" value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          {form.provider === 'azure' && (
            <div className="form-row">
              <div className="form-group">
                <label>Deployment Name (Azure)</label>
                <input className="form-input" placeholder="z.B. my-gpt5-deployment" value={form.deployment_name}
                  onChange={(e) => setForm({ ...form, deployment_name: e.target.value })} />
              </div>
            </div>
          )}
          <button className="btn btn-primary btn-small" type="submit" disabled={!form.model_id || !form.provider}>
            Hinzufügen
          </button>
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Model ID</th>
            <th>Provider</th>
            <th>Display Name</th>
            <th>Deployment</th>
            <th>Aktiviert</th>
            <th>Default</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td><code>{m.model_id}</code></td>
              <td>{m.provider}</td>
              <td>{m.display_name}</td>
              <td>{m.deployment_name || '-'}</td>
              <td>
                <label className="toggle-switch">
                  <input type="checkbox" checked={m.is_enabled}
                    onChange={() => handleToggle(m.id, 'is_enabled', !m.is_enabled)} />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td>
                {m.is_default ? (
                  <span style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 13 }}>✓ Default</span>
                ) : (
                  <button className="btn btn-secondary btn-small" onClick={() => handleSetDefault(m.id)}>
                    Setzen
                  </button>
                )}
              </td>
              <td>
                <button className="btn btn-danger btn-small" onClick={() => handleDelete(m.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProvidersTab() {
  const confirm = useConfirm()
  const [providers, setProviders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyInputs, setKeyInputs] = useState({})
  const [azureInputs, setAzureInputs] = useState({ endpoint_url: '', api_version: '' })
  const [saving, setSaving] = useState({})
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})

  useEffect(() => {
    loadProviders()
  }, [])

  async function loadProviders() {
    try {
      const data = await api.adminListProviders()
      setProviders(data)
      const azure = data.find((p) => p.provider === 'azure')
      if (azure) {
        setAzureInputs((prev) => ({
          endpoint_url: azure.endpoint_url || prev.endpoint_url || '',
          api_version: azure.api_version || prev.api_version || '',
        }))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(provider) {
    const key = (keyInputs[provider] || '').trim()
    if (!key) return
    setSaving((s) => ({ ...s, [provider]: true }))
    setError('')
    setTestResults((r) => ({ ...r, [provider]: null }))
    try {
      const extra = provider === 'azure' ? {
        endpoint_url: azureInputs.endpoint_url.trim(),
        api_version: azureInputs.api_version.trim(),
      } : {}
      await api.adminSetProviderKey(provider, key, extra)
      setKeyInputs((k) => ({ ...k, [provider]: '' }))
      await loadProviders()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving((s) => ({ ...s, [provider]: false }))
    }
  }

  async function handleDelete(provider) {
    const ok = await confirm({
      title: 'API-Key deaktivieren?',
      message: `Der API-Key für ${provider} wird deaktiviert. Modelle dieses Providers stehen danach nicht mehr zur Verfügung.`,
      confirmLabel: 'Deaktivieren',
      destructive: true,
    })
    if (!ok) return
    setError('')
    setTestResults((r) => ({ ...r, [provider]: null }))
    try {
      await api.adminDeleteProviderKey(provider)
      await loadProviders()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleTest(provider) {
    setTesting((t) => ({ ...t, [provider]: true }))
    setTestResults((r) => ({ ...r, [provider]: null }))
    try {
      const result = await api.adminTestProvider(provider)
      setTestResults((r) => ({ ...r, [provider]: result }))
    } catch (e) {
      setTestResults((r) => ({ ...r, [provider]: { success: false, error: e.message } }))
    } finally {
      setTesting((t) => ({ ...t, [provider]: false }))
    }
  }

  function sourceBadge(source) {
    if (source === 'db') return <span className="badge badge-success">DB Key</span>
    if (source === 'env') return <span className="badge badge-info">Env Var</span>
    return <span className="badge badge-warning">Nicht konfiguriert</span>
  }

  if (loading) return <div className="admin-loading">Laden...</div>

  return (
    <div>
      {error && <div className="admin-error">{error}</div>}

      <div className="provider-grid">
        {providers.map((p) => (
          <div className="provider-card" key={p.provider}>
            <div className="provider-card-header">
              <strong>{p.display_name}</strong>
              {sourceBadge(p.source)}
            </div>

            <div className="provider-card-body">
              <div className="provider-key-row">
                <input
                  className="form-input"
                  type="password"
                  placeholder="API-Key eingeben..."
                  value={keyInputs[p.provider] || ''}
                  onChange={(e) => setKeyInputs((k) => ({ ...k, [p.provider]: e.target.value }))}
                />
              </div>

              {p.provider === 'azure' && (
                <div className="azure-extra-fields">
                  <div className="provider-key-row">
                    <input
                      className="form-input"
                      type="text"
                      placeholder="Endpoint-URL (z.B. https://my-resource.openai.azure.com)"
                      value={azureInputs.endpoint_url}
                      onChange={(e) => setAzureInputs((a) => ({ ...a, endpoint_url: e.target.value }))}
                    />
                  </div>
                  <div className="provider-key-row">
                    <input
                      className="form-input"
                      type="text"
                      placeholder="API-Version (z.B. 2024-12-01-preview)"
                      value={azureInputs.api_version}
                      onChange={(e) => setAzureInputs((a) => ({ ...a, api_version: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="provider-actions">
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => handleSave(p.provider)}
                  disabled={saving[p.provider] || !keyInputs[p.provider]?.trim()}
                >
                  {saving[p.provider] ? 'Speichern...' : 'Speichern'}
                </button>

                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => handleTest(p.provider)}
                  disabled={testing[p.provider] || p.source === 'none'}
                >
                  {testing[p.provider] ? 'Teste...' : 'Testen'}
                </button>

                {p.has_db && (
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleDelete(p.provider)}
                  >
                    DB-Key löschen
                  </button>
                )}
              </div>

              {testResults[p.provider] && (
                <div className={`provider-test-result ${testResults[p.provider].success ? 'success' : 'error'}`}>
                  {testResults[p.provider].success
                    ? testResults[p.provider].message
                    : testResults[p.provider].error}
                </div>
              )}

              {p.has_env && p.source === 'db' && (
                <div className="provider-hint">Env-Var als Fallback vorhanden</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BildmodelleTab() {
  const confirm = useConfirm()
  const [models, setModels] = useState([])
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    provider: '',
    model_id: '',
    display_name: '',
    cost_per_image: '',
    sort_order: 0,
  })

  useEffect(() => {
    loadModels()
  }, [])

  async function loadModels() {
    try {
      const data = await api.adminListImageModels()
      setModels(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    try {
      const payload = { ...form }
      if (payload.cost_per_image !== '') payload.cost_per_image = parseFloat(payload.cost_per_image)
      else delete payload.cost_per_image
      await api.adminCreateImageModel(payload)
      setForm({ provider: '', model_id: '', display_name: '', cost_per_image: '', sort_order: 0 })
      setShowForm(false)
      await loadModels()
      setSuccessMsg(t('admin.bildmodelle.add.success'))
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSetDefault(id) {
    setError('')
    try {
      await api.adminUpdateImageModel(id, { is_default: true })
      await loadModels()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggle(id, field, value) {
    setError('')
    try {
      await api.adminUpdateImageModel(id, { [field]: value })
      await loadModels()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: 'Bildmodell löschen?',
      message: 'Dieses Modell steht danach nicht mehr zur Auswahl.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (!ok) return
    setError('')
    setSuccessMsg('')
    try {
      await api.adminDeleteImageModel(id)
      await loadModels()
      setSuccessMsg(t('admin.bildmodelle.delete.success'))
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="admin-loading">Laden...</div>

  return (
    <div>
      <h3 className="admin-section-title">{t('admin.bildmodelle.heading')}</h3>
      {error && <div className="admin-error">{error}</div>}
      {successMsg && <div className="admin-success">{successMsg}</div>}

      <button
        className="btn btn-primary btn-small"
        onClick={() => setShowForm(!showForm)}
        style={{ marginBottom: 16 }}
      >
        {showForm ? 'Abbrechen' : t('admin.bildmodelle.add.button')}
      </button>

      {showForm && (
        <form className="admin-bildmodelle-form" onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>{t('admin.bildmodelle.column.provider')}</label>
              <input
                className="form-input"
                placeholder="z.B. openai"
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('admin.bildmodelle.column.model_id')}</label>
              <input
                className="form-input"
                placeholder="z.B. dall-e-3"
                value={form.model_id}
                onChange={(e) => setForm({ ...form, model_id: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Display Name</label>
              <input
                className="form-input"
                placeholder="Anzeigename"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>{t('admin.bildmodelle.column.cost_per_image')}</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.0001"
                placeholder="0.0400"
                value={form.cost_per_image}
                onChange={(e) => setForm({ ...form, cost_per_image: e.target.value })}
              />
            </div>
          </div>
          <button
            className="btn btn-primary btn-small"
            type="submit"
            disabled={!form.provider || !form.model_id}
          >
            Hinzufügen
          </button>
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('admin.bildmodelle.column.model_id')}</th>
            <th>{t('admin.bildmodelle.column.provider')}</th>
            <th>Display Name</th>
            <th>{t('admin.bildmodelle.column.cost_per_image')}</th>
            <th>Aktiviert</th>
            <th>{t('admin.bildmodelle.column.default')}</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td><code>{m.model_id}</code></td>
              <td>{m.provider}</td>
              <td>{m.display_name}</td>
              <td>{m.pricing?.cost_per_image_usd != null ? `$${m.pricing.cost_per_image_usd}` : '-'}</td>
              <td>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={m.is_enabled}
                    onChange={() => handleToggle(m.id, 'is_enabled', !m.is_enabled)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td>
                {m.is_default ? (
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 13 }}>
                    Standard
                  </span>
                ) : (
                  <button className="btn btn-secondary btn-small" onClick={() => handleSetDefault(m.id)}>
                    {t('admin.bildmodelle.action.set_default')}
                  </button>
                )}
              </td>
              <td>
                <button className="btn btn-danger btn-small" onClick={() => handleDelete(m.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
          {models.length === 0 && (
            <tr>
              <td colSpan="7" className="admin-empty-cell">{t('admin.bildmodelle.empty')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function BildStilTab() {
  const confirm = useConfirm()
  const [presets, setPresets] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', prefix: '', is_active: true })

  useEffect(() => {
    loadPresets()
  }, [])

  async function loadPresets() {
    try {
      const data = await api.adminListImageStylePresets()
      setPresets(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(preset) {
    setEditingId(preset.id)
    setForm({ name: preset.name || '', prefix: preset.prefix || '', is_active: !!preset.is_active })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({ name: '', prefix: '', is_active: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editingId) {
        await api.adminUpdateImageStylePreset(editingId, form)
      } else {
        await api.adminCreateImageStylePreset(form)
      }
      cancelForm()
      await loadPresets()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: 'Stil-Präfix löschen?',
      message: 'Dieser Präfix wird dauerhaft entfernt.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (!ok) return
    setError('')
    try {
      await api.adminDeleteImageStylePreset(id)
      await loadPresets()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleActive(preset) {
    setError('')
    try {
      await api.adminUpdateImageStylePreset(preset.id, { is_active: !preset.is_active })
      await loadPresets()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="admin-loading">Laden...</div>

  return (
    <div>
      <h3 className="admin-section-title">{t('admin.bild_stil.heading')}</h3>
      <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 16 }}>
        {t('admin.bild_stil.hint')}
      </p>
      {error && <div className="admin-error">{error}</div>}

      <button
        className="btn btn-primary btn-small"
        onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', prefix: '', is_active: true }) }}
        style={{ marginBottom: 16 }}
      >
        {showForm && !editingId ? 'Abbrechen' : 'Präfix hinzufügen'}
      </button>

      {showForm && (
        <form className="admin-bild-stil-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>{t('admin.bild_stil.field.name')}</label>
              <input
                className="form-input"
                placeholder="z.B. Corporate Style"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label>{t('admin.bild_stil.field.prefix')}</label>
            <textarea
              className="form-input form-textarea"
              placeholder="z.B. Corporate photography style, clean white background, professional lighting, "
              value={form.prefix}
              onChange={(e) => setForm({ ...form, prefix: e.target.value })}
              maxLength={1000}
              required
              rows={3}
            />
            <span className="form-hint">{form.prefix.length} / 1000</span>
          </div>
          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={() => setForm({ ...form, is_active: !form.is_active })}
              />
              {t('admin.bild_stil.field.active')}
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-small" type="submit">
              {editingId ? 'Speichern' : 'Hinzufügen'}
            </button>
            {editingId && (
              <button className="btn btn-secondary btn-small" type="button" onClick={cancelForm}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('admin.bild_stil.field.name')}</th>
            <th>{t('admin.bild_stil.field.prefix')}</th>
            <th>{t('admin.bild_stil.field.active')}</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {presets.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td style={{ maxWidth: 320 }}>
                <span
                  title={p.prefix}
                  style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {p.prefix}
                </span>
              </td>
              <td>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={!!p.is_active}
                    onChange={() => handleToggleActive(p)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-small" onClick={() => startEdit(p)}>
                    Bearbeiten
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => handleDelete(p.id)}>
                    Löschen
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {presets.length === 0 && (
            <tr>
              <td colSpan="4" className="admin-empty-cell">Noch keine Stil-Präfixe konfiguriert</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function AuditTab() {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const LIMIT = 50

  useEffect(() => {
    loadLogs(true)
  }, [actionFilter])

  async function loadLogs(reset = false) {
    const newOffset = reset ? 0 : offset
    setLoading(true)
    setError('')
    try {
      const data = await api.adminGetAuditLogs(LIMIT, newOffset, actionFilter || null, null)
      if (reset) {
        setLogs(data)
        setOffset(LIMIT)
      } else {
        setLogs((prev) => [...prev, ...data])
        setOffset(newOffset + LIMIT)
      }
      setHasMore(data.length === LIMIT)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-filters">
        <input
          className="form-input"
          placeholder="Filter nach Aktion (z.B. auth.login)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{ maxWidth: 300 }}
        />
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Zeitstempel</th>
            <th>Benutzer</th>
            <th>Aktion</th>
            <th>Ziel</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.created_at).toLocaleString('de-DE')}</td>
              <td>{log.username || log.user_id || '-'}</td>
              <td><code>{log.action}</code></td>
              <td>{log.target_type ? `${log.target_type}` : '-'}</td>
              <td className="admin-metadata-cell">
                {log.metadata && Object.keys(log.metadata).length > 0
                  ? JSON.stringify(log.metadata)
                  : '-'}
              </td>
            </tr>
          ))}
          {logs.length === 0 && !loading && (
            <tr><td colSpan="5" className="admin-empty-cell">Keine Audit-Logs vorhanden</td></tr>
          )}
        </tbody>
      </table>

      {hasMore && (
        <button className="btn btn-secondary" onClick={() => loadLogs(false)} disabled={loading}
          style={{ marginTop: 16 }}>
          {loading ? 'Laden...' : 'Mehr laden'}
        </button>
      )}
    </div>
  )
}
