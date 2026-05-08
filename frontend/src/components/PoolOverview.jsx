import { t } from '../i18n/strings'
import { PoolIcon } from './Icon'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

function sortByDate(items) {
  return [...items].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const labelKey = `pool.header.role.${role}`
  return (
    <span className="pool-overview-summary-role">
      {t(labelKey)}
    </span>
  )
}

// ── Member avatar (reused inside grid cards) ──────────────────────────────────

function MemberAvatar({ username }) {
  return (
    <span className="pool-header-avatar" aria-label={username}>
      {(username || '?').charAt(0).toUpperCase()}
    </span>
  )
}

// ── PoolOverview ──────────────────────────────────────────────────────────────

/**
 * Landing page rendered when activeTab === 'overview'. Card-based layout with
 * four sections: summary, members, chats, documents.
 *
 * @param {object} props
 * @param {{ id: string, name: string, icon?: string, color?: string, description?: string, role: string }} props.pool
 * @param {Array<{ user_id: string, username: string, role: string }>} props.members
 * @param {Array<{ id: string, title: string, message_count: number, created_at: string, is_shared: boolean }>} props.chats
 * @param {Array<{ id: string, filename: string, file_type: string, file_size_bytes: number, created_at: string, summary?: string }>} props.documents
 * @param {(tabName: string) => void} props.onTabChange
 * @param {(chatId: string) => void} props.onOpenChat
 * @param {(docId: string) => void} props.onOpenDocument
 */
export default function PoolOverview({
  pool,
  members,
  chats,
  documents,
  onTabChange,
  onOpenChat,
  onOpenDocument,
}) {
  if (!pool) return null

  const safeMembers = members || []
  const safeChats = chats || []
  const safeDocs = documents || []

  const recentChats = sortByDate(safeChats).slice(0, 5)
  const recentDocs = sortByDate(safeDocs).slice(0, 5)
  const visibleMembers = safeMembers.slice(0, 5)

  return (
    <div className="pool-overview">

      {/* ── 1. Summary card ───────────────────────────────────────────────── */}
      <div className="pool-overview-section">
        <div className="pool-overview-section-header">
          <span className="pool-overview-section-title">{t('pool.overview.section.summary')}</span>
        </div>
        <div className="pool-overview-summary">
          <PoolIcon
            emoji={pool.icon}
            size={32}
            className="pool-overview-summary-icon"
            style={{ color: pool.color || 'var(--color-primary)' }}
          />
          <div className="pool-overview-summary-body">
            <span className="pool-overview-summary-name">{pool.name}</span>
            {pool.description && (
              <p className="pool-overview-summary-desc">{pool.description}</p>
            )}
            <RoleBadge role={pool.role || 'viewer'} />
          </div>
        </div>
      </div>

      {/* ── 2. Mitglieder section ─────────────────────────────────────────── */}
      <div className="pool-overview-section">
        <div className="pool-overview-section-header">
          <span className="pool-overview-section-title">{t('pool.overview.section.members')}</span>
          {safeMembers.length > 0 && (
            <button
              className="pool-overview-section-action btn btn-secondary btn-small"
              type="button"
              onClick={() => onTabChange('members')}
            >
              {t('pool.overview.see_all')}
            </button>
          )}
        </div>

        {safeMembers.length === 0 ? (
          <div className="pool-overview-empty">{t('pool.overview.no_members')}</div>
        ) : (
          <div className="pool-overview-members-grid">
            {visibleMembers.map((member) => (
              <div key={member.user_id} className="pool-overview-member-card">
                <MemberAvatar username={member.username} />
                <div className="pool-overview-member-info">
                  <span className="pool-overview-member-name">{member.username}</span>
                  <span className="pool-overview-member-role">
                    {t(`pool.header.role.${member.role}`) || member.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Chats section ──────────────────────────────────────────────── */}
      <div className="pool-overview-section">
        <div className="pool-overview-section-header">
          <span className="pool-overview-section-title">{t('pool.overview.section.chats')}</span>
          {safeChats.length > 0 && (
            <button
              className="pool-overview-section-action btn btn-secondary btn-small"
              type="button"
              onClick={() => onTabChange('chats')}
            >
              {t('pool.overview.see_all')}
            </button>
          )}
        </div>

        {safeChats.length === 0 ? (
          <div className="pool-overview-empty">
            <span>{t('pool.overview.no_chats')}</span>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() => onTabChange('chats')}
              style={{ marginTop: '8px' }}
            >
              {t('pool.overview.section.chats')}
            </button>
          </div>
        ) : (
          <div className="pool-overview-chat-list">
            {recentChats.map((chat) => (
              <div
                key={chat.id}
                className="pool-overview-chat-row"
                onClick={() => onOpenChat(chat.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onOpenChat(chat.id)}
              >
                <div className="pool-overview-chat-main">
                  <span className="pool-overview-chat-title">{chat.title}</span>
                  <span className="pool-overview-chat-meta">
                    {chat.message_count} {t('pool.overview.chat.message_count')}
                    {' · '}
                    {formatDate(chat.created_at)}
                  </span>
                </div>
                <span className={`pool-overview-chat-badge pool-overview-chat-badge--${chat.is_shared ? 'shared' : 'private'}`}>
                  {chat.is_shared ? t('pool.overview.chat.shared') : t('pool.overview.chat.private')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 4. Dokumente section ──────────────────────────────────────────── */}
      <div className="pool-overview-section">
        <div className="pool-overview-section-header">
          <span className="pool-overview-section-title">{t('pool.overview.section.documents')}</span>
          {safeDocs.length > 0 && (
            <button
              className="pool-overview-section-action btn btn-secondary btn-small"
              type="button"
              onClick={() => onTabChange('documents')}
            >
              {t('pool.overview.see_all')}
            </button>
          )}
        </div>

        {safeDocs.length === 0 ? (
          <div className="pool-overview-empty">{t('pool.overview.no_documents')}</div>
        ) : (
          <div className="pool-overview-doc-list">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                className="pool-overview-doc-row"
                onClick={() => onOpenDocument(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onOpenDocument(doc.id)}
              >
                <div className="pool-overview-doc-main">
                  <span className="pool-overview-doc-name">{doc.filename}</span>
                  {doc.summary && (
                    <span className="pool-overview-doc-summary" title={doc.summary}>
                      {doc.summary}
                    </span>
                  )}
                </div>
                <div className="pool-overview-doc-meta">
                  <span>{formatBytes(doc.file_size_bytes)}</span>
                  <span>{formatDate(doc.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
