import { useState } from 'react'
import CreatePoolDialog from './CreatePoolDialog'
import UsageWidget from './UsageWidget'

export default function Sidebar({
  open,
  section,
  conversations,
  pools,
  activeId,
  activePoolId,
  loading,
  usage,
  assistants,
  onCreateConversation,
  onOpenConversation,
  onDeleteConversation,
  onSelectPool,
  onCreatePool,
  onJoinPool,
}) {
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const [joinToken, setJoinToken] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

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

  // ── Chat Section ──────────────────────────────────────────────────────────
  const panelClass = `content-panel${open ? '' : ' content-panel--hidden'}`

  if (section === 'chat') {
    return (
      <div className={panelClass}>
        <div className="content-panel-header">
          <span className="content-panel-title">Chats</span>
        </div>

        <div className="content-panel-actions">
          {assistants && assistants.length > 0 && (
            <select
              className="assistant-select"
              value={selectedAssistantId}
              onChange={(e) => setSelectedAssistantId(e.target.value)}
            >
              <option value="">Kein Assistent</option>
              {assistants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon ? `${a.icon} ` : ''}{a.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="new-item-btn"
            onClick={() => onCreateConversation(selectedAssistantId || null)}
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Neuer Chat
          </button>
        </div>

        <div className="panel-list">
          {conversations.length === 0 ? (
            <div className="panel-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Noch keine Chats</span>
            </div>
          ) : (
            conversations.map((item) => (
              <div
                key={item.id}
                className={`panel-item${activeId === item.id ? ' active' : ''}`}
                onClick={() => onOpenConversation(item.id)}
              >
                <div className="panel-item-body">
                  <span className="panel-item-title">{item.title}</span>
                  <span className="panel-item-sub">{item.message_count} Nachrichten</span>
                </div>
                <button
                  className="panel-item-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Konversation löschen?')) onDeleteConversation(item.id)
                  }}
                  title="Löschen"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {usage && (
          <div className="content-panel-footer">
            <UsageWidget usage={usage} compact />
          </div>
        )}
      </div>
    )
  }

  // ── Pools Section ─────────────────────────────────────────────────────────
  return (
    <div className={panelClass}>
      <div className="content-panel-header">
        <span className="content-panel-title">Pools</span>
        <div className="content-panel-header-actions">
          <button
            className="panel-header-btn"
            onClick={() => setShowJoin(!showJoin)}
            title="Pool beitreten"
          >
            + Einladen
          </button>
          <button
            className="panel-header-btn panel-header-btn--primary"
            onClick={() => setShowCreate(true)}
            title="Pool erstellen"
          >
            + Neu
          </button>
        </div>
      </div>

      {showJoin && (
        <form className="pool-join-form" onSubmit={handleJoin}>
          <input
            className="pool-join-input-light"
            type="text"
            placeholder="Invite-Token einfügen..."
            value={joinToken}
            onChange={(e) => setJoinToken(e.target.value)}
          />
          <button type="submit" className="pool-join-submit">Beitreten</button>
          {joinError && <div className="pool-join-error-light">{joinError}</div>}
        </form>
      )}

      <div className="panel-list">
        {pools.length === 0 ? (
          <div className="panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Keine Pools vorhanden</span>
          </div>
        ) : (
          pools.map((pool) => (
            <div
              key={pool.id}
              className={`panel-item${activePoolId === pool.id ? ' active' : ''}`}
              onClick={() => onSelectPool(pool)}
            >
              <span className="panel-pool-icon" style={{ color: pool.color || 'var(--color-primary)' }}>
                {pool.icon || '📚'}
              </span>
              <div className="panel-item-body">
                <span className="panel-item-title">{pool.name}</span>
                <span className="panel-item-sub">{pool.role}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {usage && (
        <div className="content-panel-footer">
          <UsageWidget usage={usage} compact />
        </div>
      )}

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
