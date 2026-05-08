import { useState } from 'react'
import CreatePoolDialog from './CreatePoolDialog'
import UsageWidget from './UsageWidget'
import { PoolIcon } from './Icon'
import { t } from '../i18n/strings'

function IconOverview() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="8" />
      <rect x="3" y="13" width="8" height="8" />
      <rect x="13" y="13" width="8" height="8" />
    </svg>
  )
}

function IconDocs() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IconChats() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconMembers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export default function Sidebar({
  open,
  section,
  conversations,
  pools,
  activeId,
  activePoolId,
  activePool,
  poolTab,
  poolCounts,
  loading,
  usage,
  assistants,
  onCreateConversation,
  onOpenConversation,
  onDeleteConversation,
  onSelectPool,
  onCreatePool,
  onJoinPool,
  onPoolTabChange,
  onClosePool,
  onDeletePool,
  onLeavePool,
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

  const panelClass = `content-panel${open ? '' : ' content-panel--hidden'}`

  // ── Chat Section ────────────────────────────────────────────────────────────
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
                >×</button>
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

  // ── Pool Nav Panel (pool selected) ──────────────────────────────────────────
  if (section === 'pools' && activePool) {
    const role = activePool.role || 'viewer'
    const isOwner = role === 'owner'
    const counts = poolCounts || { docs: 0, chats: 0, members: 0 }

    return (
      <div className={panelClass}>
        {/* Back to pool list */}
        <button className="pool-nav-back" onClick={onClosePool}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Alle Pools
        </button>

        {/* Pool identity */}
        <div className="pool-nav-identity">
          <PoolIcon emoji={activePool.icon} size={28} className="pool-nav-icon" style={{ color: activePool.color }} />
          <div>
            <div className="pool-nav-name">{activePool.name}</div>
            {activePool.description && (
              <div className="pool-nav-desc">{activePool.description}</div>
            )}
            <div className="pool-nav-role">{role}</div>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="pool-nav-tabs">
          <button
            className={`pool-nav-item${poolTab === 'overview' ? ' active' : ''}`}
            onClick={() => onPoolTabChange('overview')}
          >
            <IconOverview />
            <span>{t('pool.tab.overview')}</span>
          </button>
          <button
            className={`pool-nav-item${poolTab === 'documents' ? ' active' : ''}`}
            onClick={() => onPoolTabChange('documents')}
          >
            <IconDocs />
            <span>Dokumente</span>
            <span className="pool-nav-count">{counts.docs}</span>
          </button>
          <button
            className={`pool-nav-item${poolTab === 'chats' ? ' active' : ''}`}
            onClick={() => onPoolTabChange('chats')}
          >
            <IconChats />
            <span>Chats</span>
            <span className="pool-nav-count">{counts.chats}</span>
          </button>
          <button
            className={`pool-nav-item${poolTab === 'members' ? ' active' : ''}`}
            onClick={() => onPoolTabChange('members')}
          >
            <IconMembers />
            <span>Mitglieder</span>
            <span className="pool-nav-count">{counts.members}</span>
          </button>
        </nav>

        {/* Footer actions */}
        <div className="pool-nav-footer">
          {!isOwner && (
            <button className="pool-nav-action" onClick={onLeavePool}>
              Verlassen
            </button>
          )}
          {isOwner && (
            <button className="pool-nav-action pool-nav-action--danger" onClick={onDeletePool}>
              Pool löschen
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Pools List ──────────────────────────────────────────────────────────────
  return (
    <div className={panelClass}>
      <div className="content-panel-header">
        <span className="content-panel-title">Pools</span>
        <div className="content-panel-header-actions">
          <button className="panel-header-btn" onClick={() => setShowJoin(!showJoin)} title="Pool beitreten">
            + Einladen
          </button>
          <button className="panel-header-btn panel-header-btn--primary" onClick={() => setShowCreate(true)} title="Pool erstellen">
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
              <PoolIcon emoji={pool.icon} size={18} className="panel-pool-icon" style={{ color: pool.color || 'var(--color-primary)' }} />
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
