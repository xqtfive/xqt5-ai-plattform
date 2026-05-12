import { useState } from 'react'
import { api } from '../api'
import PoolShareDialog from './PoolShareDialog'
import { t } from '../i18n/strings'
import { useConfirm } from './ConfirmDialog'

export default function PoolMembers({ poolId, members, canAdmin, isOwner, currentUserId, onMembersChanged }) {
  const confirm = useConfirm()
  const [showInvite, setShowInvite] = useState(false)
  const [username, setUsername] = useState('')
  const [addRole, setAddRole] = useState('viewer')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAddMember(e) {
    e.preventDefault()
    if (!username.trim()) return
    setError('')
    setAdding(true)
    try {
      await api.addPoolMember(poolId, username.trim(), addRole)
      setUsername('')
      await onMembersChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRoleChange(userId, newRole) {
    try {
      await api.updatePoolMember(poolId, userId, newRole)
      await onMembersChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(userId) {
    const ok = await confirm({
      title: 'Mitglied entfernen?',
      message: 'Das Mitglied verliert den Zugriff auf den Pool.',
      confirmLabel: 'Entfernen',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.removePoolMember(poolId, userId)
      await onMembersChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="pool-members">
      {error && <div className="pool-members-error">{error}</div>}

      {canAdmin && (
        <div className="pool-members-actions">
          <form className="pool-add-member" onSubmit={handleAddMember}>
            <input
              className="form-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <select
              className="form-input pool-role-select"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn btn-primary btn-small" disabled={!username.trim() || adding}>
              {adding ? '...' : 'Einladen'}
            </button>
          </form>

          <button
            className="btn btn-secondary btn-small"
            onClick={() => setShowInvite(true)}
          >
            Share-Link erstellen
          </button>
        </div>
      )}

      <div className="pool-members-list">
        {members.map((m) => (
          <div key={m.id} className="pool-member-item">
            <div className="pool-member-info">
              <span className="pool-member-name">
                {m.username}
                {m.id === currentUserId && <span className="pool-member-you"> (Du)</span>}
              </span>
              <span className={`pool-member-role role-${m.role}`}>{t(`pool.header.role.${m.role || 'viewer'}`)}</span>
            </div>
            <div className="pool-member-actions">
              {canAdmin && m.role !== 'owner' && m.id !== currentUserId && (
                <>
                  <select
                    className="pool-role-select-small"
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleRemove(m.id)}
                  >
                    Entfernen
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showInvite && (
        <PoolShareDialog
          poolId={poolId}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  )
}
