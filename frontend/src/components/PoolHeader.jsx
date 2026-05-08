import { t } from '../i18n/strings'
import { PoolIcon } from './Icon'

// ── Inline SVG icons matching the 13–15px size used in Sidebar.jsx ────────────

function IconDocs() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IconChats() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconMembers() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// ── PoolHeader ─────────────────────────────────────────────────────────────────

/**
 * Persistent compact header strip rendered inside PoolDetail.jsx above all tab
 * content. Always visible while a pool is active.
 *
 * @param {object} props
 * @param {{ id: string, name: string, icon?: string, color?: string, description?: string, role: string }} props.pool
 * @param {{ docs: number, chats: number, members: number }} props.counts
 * @param {Array<{ user_id: string, username: string, role: string }>} props.members
 * @param {(tabName: string) => void} props.onTabChange
 */
export default function PoolHeader({ pool, counts, members, onTabChange }) {
  if (!pool) return null

  const MAX_VISIBLE_AVATARS = 5
  const visibleMembers = (members || []).slice(0, MAX_VISIBLE_AVATARS)
  const overflowCount = (members || []).length - MAX_VISIBLE_AVATARS

  const safeCounts = counts || { docs: 0, chats: 0, members: 0 }

  return (
    <div className="pool-header">
      {/* Identity: icon + name + description */}
      <div className="pool-header-identity">
        <PoolIcon
          emoji={pool.icon}
          size={28}
          className="pool-header-icon"
          style={{ color: pool.color || 'var(--color-primary)' }}
        />
        <div className="pool-header-text">
          <span className="pool-header-name">{pool.name}</span>
          {pool.description && (
            <span className="pool-header-desc" title={pool.description}>
              {pool.description}
            </span>
          )}
        </div>
      </div>

      <div className="pool-header-spacer" />

      {/* Member avatar row */}
      {visibleMembers.length > 0 && (
        <div
          className="pool-header-avatars"
          onClick={() => onTabChange('members')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onTabChange('members')}
          aria-label={t('pool.header.count.members')}
        >
          {visibleMembers.map((member) => (
            <span
              key={member.user_id}
              className="pool-header-avatar"
              title={member.username}
              aria-label={member.username}
            >
              {(member.username || '?').charAt(0).toUpperCase()}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="pool-header-avatar pool-header-avatar-overflow" aria-label={`+${overflowCount} ${t('pool.header.count.members')}`}>
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* Counts strip */}
      <div className="pool-header-counts">
        <button
          className="pool-header-count"
          onClick={() => onTabChange('documents')}
          title={t('pool.header.count.docs')}
          type="button"
        >
          <span className="pool-header-count-icon"><IconDocs /></span>
          <span>{safeCounts.docs}</span>
        </button>
        <button
          className="pool-header-count"
          onClick={() => onTabChange('chats')}
          title={t('pool.header.count.chats')}
          type="button"
        >
          <span className="pool-header-count-icon"><IconChats /></span>
          <span>{safeCounts.chats}</span>
        </button>
        <button
          className="pool-header-count"
          onClick={() => onTabChange('members')}
          title={t('pool.header.count.members')}
          type="button"
        >
          <span className="pool-header-count-icon"><IconMembers /></span>
          <span>{safeCounts.members}</span>
        </button>
      </div>
    </div>
  )
}
