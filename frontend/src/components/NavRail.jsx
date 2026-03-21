// ─── Nav Rail Icons (inline SVG, keine externe Abhängigkeit) ───────────────

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconPools() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconAssistants() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  )
}

function IconTemplates() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

function IconAdmin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// ─── NavItem ────────────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      className={`nav-rail-item${active ? ' active' : ''}`}
      onClick={onClick}
      data-tooltip={label}
      title={label}
    >
      {icon}
    </button>
  )
}

// ─── NavRail ────────────────────────────────────────────────────────────────

export default function NavRail({
  user,
  activeSection,
  onSectionChange,
  onManageAssistants,
  onManageTemplates,
  onAdmin,
  onLogout,
}) {
  const initial = user?.username?.[0]?.toUpperCase() ?? '?'

  return (
    <nav className="nav-rail">
      {/* Logo */}
      <div className="nav-rail-logo">
        XQT<span className="nav-rail-logo-sub">5</span>
      </div>

      {/* Navigation */}
      <div className="nav-rail-items">
        <NavItem
          icon={<IconChat />}
          label="Chats"
          active={activeSection === 'chat'}
          onClick={() => onSectionChange('chat')}
        />
        <NavItem
          icon={<IconPools />}
          label="Pools"
          active={activeSection === 'pools'}
          onClick={() => onSectionChange('pools')}
        />
      </div>

      {/* Tools */}
      <div className="nav-rail-divider" />
      <div className="nav-rail-tools">
        <NavItem
          icon={<IconAssistants />}
          label="Assistenten"
          onClick={onManageAssistants}
        />
        <NavItem
          icon={<IconTemplates />}
          label="Templates"
          onClick={onManageTemplates}
        />
        {user?.is_admin && (
          <NavItem
            icon={<IconAdmin />}
            label="Admin"
            active={activeSection === 'admin'}
            onClick={onAdmin}
          />
        )}
      </div>

      {/* Footer */}
      <div className="nav-rail-footer">
        <div className="nav-user-avatar" title={user?.username}>
          {initial}
          {user?.is_admin && <span className="nav-admin-dot" />}
        </div>
        <button
          className="nav-logout-btn"
          onClick={onLogout}
          title="Abmelden"
        >
          <IconLogout />
        </button>
      </div>
    </nav>
  )
}
