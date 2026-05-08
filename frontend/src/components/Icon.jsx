// Line-art icon system for the platform.
//
// Replaces emoji rendering for Pool icons (used in the sidebar, pool list,
// pool header, pool overview, and the "create pool" dialog) and File-type
// icons (used in document lists). All icons follow the nav-rail style:
// 24x24 viewBox, stroke="currentColor" so colour inherits from the
// surrounding context, stroke-width 1.6.
//
// ──────────────────────────────────────────────────────────────────────
//  EASY REVERT — set LINE_ICONS_ENABLED = false below to flip the entire
//  UI back to native emoji rendering. Database values are unchanged: pool
//  rows still store '📚' / '📖' / '🚀' etc. as before, the toggle is
//  purely a render-time switch. No data migration required.
// ──────────────────────────────────────────────────────────────────────
const LINE_ICONS_ENABLED = true

// ── 8 pool icons matching the ICONS list in CreatePoolDialog.jsx ──

function BooksIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="0.5" />
      <rect x="9.5" y="8" width="5" height="13" rx="0.5" />
      <rect x="16" y="5" width="5" height="16" rx="0.5" />
      <line x1="5.5" y1="14.5" x2="5.5" y2="18.5" />
      <line x1="12" y1="14.5" x2="12" y2="18.5" />
      <line x1="18.5" y1="14.5" x2="18.5" y2="18.5" />
    </svg>
  )
}

function OpenBookIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" />
      <path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
    </svg>
  )
}

function IndexCardsIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="14" height="14" rx="1.5" />
      <path d="M7 7V5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2" />
    </svg>
  )
}

function FolderIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

function RocketIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c2.5 2.5 4 6 4 10v6l-4-2-4 2v-6c0-4 1.5-7.5 4-10z" />
      <path d="M8 14l-3 3v3l3-1" />
      <path d="M16 14l3 3v3l-3-1" />
      <circle cx="12" cy="9" r="1.5" />
    </svg>
  )
}

function StarIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18.2 5.5 22 7 14.5 2 9.5 9 9" />
    </svg>
  )
}

function BulbIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.7 10.7c0.7 0.6 1.2 1.4 1.2 2.3v0h5v0c0-0.9 0.5-1.7 1.2-2.3A6 6 0 0 0 12 3z" />
    </svg>
  )
}

function TargetIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  )
}

// Map emoji → icon component. Keys are the same code points stored in the
// `app_pools.icon` column, so the database stays untouched.
const POOL_ICONS = {
  '\u{1F4DA}': BooksIcon,        // books — default
  '\u{1F4D6}': OpenBookIcon,     // open book
  '\u{1F5C2}': IndexCardsIcon,   // card index dividers
  '\u{1F4C1}': FolderIcon,       // folder
  '\u{1F680}': RocketIcon,       // rocket
  '\u{2B50}': StarIcon,          // star
  '\u{1F4A1}': BulbIcon,         // light bulb
  '\u{1F3AF}': TargetIcon,       // target
}

const DEFAULT_POOL_EMOJI = '\u{1F4DA}'

// ── 3 file-type icons ──

function PdfFileIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function ImageFileIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

// "Text/Notiz" — PDF-shape + 2 writing lines + rectangle pen with triangle
// tip. Pen body is filled white so it occludes the doc edge underneath
// (works on white card/list backgrounds — the only place this icon ships).
function TextFileIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="12" x2="14" y2="12" />
      <line x1="8" y1="16" x2="14" y2="16" />
      <path d="M22 7 L23 8 L16 15 L14 16 L15 14 Z" fill="white" />
    </svg>
  )
}

const FILE_TYPE_ICONS = {
  pdf: PdfFileIcon,
  image: ImageFileIcon,
  txt: TextFileIcon,
}

// ── Chat-list icons (used in PoolChatList) ──

/** Speech bubble — denotes a shared / multi-user chat. */
export function ChatBubbleIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

/** Closed padlock — denotes a private chat (only the creator sees it). */
export function LockIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

// ── Public components ──

/**
 * Renders a pool icon. Pass the emoji string (from `pool.icon`); component
 * resolves it to the matching line-art SVG (or the books fallback if the
 * emoji is unknown / empty).
 */
export function PoolIcon({ emoji, size = 18, className, style }) {
  const effective = emoji || DEFAULT_POOL_EMOJI
  if (!LINE_ICONS_ENABLED) {
    return (
      <span
        className={className}
        style={{ fontSize: `${size}px`, lineHeight: 1, ...style }}
      >
        {effective}
      </span>
    )
  }
  const SvgIcon = POOL_ICONS[effective] || POOL_ICONS[DEFAULT_POOL_EMOJI]
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, ...style }}
    >
      <SvgIcon size={size} />
    </span>
  )
}

/**
 * Renders a file-type icon. Accepts the `file_type` value the backend
 * stores: 'pdf', 'image', or anything else (treated as a text/note file).
 */
export function FileTypeIcon({ type, size = 15, className, style }) {
  if (!LINE_ICONS_ENABLED) {
    const fallback = type === 'pdf'
      ? '\u{1F4C4}'
      : type === 'image'
        ? '\u{1F5BC}\u{FE0F}'
        : '\u{1F4DD}'
    return (
      <span
        className={className}
        style={{ fontSize: `${size}px`, lineHeight: 1, ...style }}
      >
        {fallback}
      </span>
    )
  }
  const key = type === 'pdf' ? 'pdf' : type === 'image' ? 'image' : 'txt'
  const SvgIcon = FILE_TYPE_ICONS[key]
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, ...style }}
    >
      <SvgIcon size={size} />
    </span>
  )
}
