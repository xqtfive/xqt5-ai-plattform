import { useState } from 'react'
import CreatePoolDialog from './CreatePoolDialog'
import { PoolIcon } from './Icon'
import { t } from '../i18n/strings'

export default function PoolList({ pools, activePoolId, onSelectPool, onCreatePool, onJoinPool }) {
  const [showCreate, setShowCreate] = useState(false)
  const [joinToken, setJoinToken] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [joinError, setJoinError] = useState('')

  async function handleJoin(e) {
    e.preventDefault()
    if (!joinToken.trim()) return
    setJoinError('')
    try {
      await onJoinPool(joinToken.trim())
      setJoinToken('')
      setShowJoin(false)
    } catch (err) {
      setJoinError(err.message)
    }
  }

  return (
    <div className="pool-list-section">
      <div className="pool-list-header">
        <span className="pool-list-label">Pools</span>
        <div className="pool-list-actions">
          <button
            className="pool-action-btn"
            onClick={() => setShowJoin(!showJoin)}
            title="Pool beitreten"
          >
            +Link
          </button>
          <button
            className="pool-action-btn"
            onClick={() => setShowCreate(true)}
            title="Pool erstellen"
          >
            +Neu
          </button>
        </div>
      </div>

      {showJoin && (
        <form className="pool-join-form" onSubmit={handleJoin}>
          <input
            className="pool-join-input"
            type="text"
            placeholder="Invite-Token einfügen..."
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
          />
          <button type="submit" className="pool-join-btn">Beitreten</button>
          {joinError && <div className="pool-join-error">{joinError}</div>}
        </form>
      )}

      <div className="pool-items">
        {pools.length === 0 ? (
          <div className="pool-empty">Keine Pools vorhanden</div>
        ) : (
          pools.map((pool) => (
            <div
              key={pool.id}
              className={`pool-item ${activePoolId === pool.id ? 'active' : ''}`}
              onClick={() => onSelectPool(pool)}
            >
              <PoolIcon emoji={pool.icon} size={20} className="pool-item-icon" style={{ color: pool.color || '#ee7f00' }} />
              <div className="pool-item-info">
                <span className="pool-item-name">{pool.name}</span>
                <span className="pool-item-role">{t(`pool.header.role.${pool.role || 'viewer'}`)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <CreatePoolDialog
          onClose={() => setShowCreate(false)}
          onCreate={async (data) => {
            await onCreatePool(data)
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}
