import { useState, useEffect } from 'react'
import { api } from '../api'
import { t } from '../i18n/strings'

export default function PoolShareDialog({ poolId, onClose }) {
  const [role, setRole] = useState('viewer')
  const [maxUses, setMaxUses] = useState('')
  const [invites, setInvites] = useState([])
  const [newInvite, setNewInvite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadInvites()
  }, [poolId])

  async function loadInvites() {
    try {
      const data = await api.listPoolInvites(poolId)
      setInvites(data)
    } catch {}
  }

  async function handleCreate() {
    setError('')
    setCreating(true)
    try {
      const invite = await api.createPoolInvite(
        poolId,
        role,
        maxUses ? parseInt(maxUses) : null,
      )
      setNewInvite(invite)
      await loadInvites()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(inviteId) {
    try {
      await api.revokePoolInvite(poolId, inviteId)
      await loadInvites()
    } catch (err) {
      setError(err.message)
    }
  }

  function copyToken() {
    if (!newInvite) return
    navigator.clipboard.writeText(newInvite.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share-Link erstellen</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="pool-share-create">
          <div className="form-row">
            <div className="form-group">
              <label>Rolle</label>
              <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label>Max. Nutzungen <span className="form-hint">(leer = unbegrenzt)</span></label>
              <input
                className="form-input"
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="unbegrenzt"
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Erstelle...' : 'Link erstellen'}
          </button>
        </div>

        {newInvite && (
          <div className="pool-share-result">
            <label>Invite-Token:</label>
            <div className="pool-share-token-row">
              <code className="pool-share-token">{newInvite.token}</code>
              <button className="btn btn-secondary btn-small" onClick={copyToken}>
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
            </div>
            <p className="pool-share-hint">
              Teile diesen Token — andere können damit dem Pool beitreten.
            </p>
          </div>
        )}

        {invites.length > 0 && (
          <div className="pool-share-existing">
            <h4>Aktive Einladungen</h4>
            {invites.map((inv) => (
              <div key={inv.id} className="pool-invite-item">
                <div className="pool-invite-info">
                  <code className="pool-invite-token">{inv.token.slice(0, 12)}...</code>
                  <span className={`pool-member-role role-${inv.role}`}>{t(`pool.header.role.${inv.role || 'viewer'}`)}</span>
                  <span className="pool-invite-uses">
                    {inv.use_count}{inv.max_uses ? `/${inv.max_uses}` : ''} genutzt
                  </span>
                </div>
                <button
                  className="btn btn-danger btn-small"
                  onClick={() => handleRevoke(inv.id)}
                >
                  Widerrufen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
