import { useEffect, useLayoutEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let titleIdCounter = 0
function nextTitleId() {
  titleIdCounter += 1
  return `modal-title-${titleIdCounter}`
}

export default function Modal({
  onClose,
  title,
  children,
  role = 'dialog',
  labelledBy,
  describedBy,
  size,
  closeOnBackdropClick = true,
  className,
}) {
  const contentRef = useRef(null)
  const previousFocusRef = useRef(null)
  const titleIdRef = useRef(null)
  if (titleIdRef.current === null) titleIdRef.current = nextTitleId()
  const titleId = titleIdRef.current

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement
    const node = contentRef.current
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector(FOCUSABLE_SELECTOR)
      if (first) first.focus()
      else node.focus()
    }
    return () => {
      const prev = previousFocusRef.current
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus() } catch { /* element may be gone */ }
      }
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !contentRef.current) return
      const focusables = contentRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleOverlayClick() {
    if (closeOnBackdropClick) onClose()
  }

  const contentClass = [
    'modal-content',
    size ? `modal-content--${size}` : '',
    className || '',
  ].filter(Boolean).join(' ')

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={contentRef}
        className={contentClass}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? titleId : undefined)}
        aria-describedby={describedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Schließen"
            >&times;</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
