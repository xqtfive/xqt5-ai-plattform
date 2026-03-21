import { useState, useRef } from 'react'

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

export default function Welcome({ onSend, loading }) {
  const [input, setInput] = useState('')
  const textareaRef = useRef(null)

  function autoResize(el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  function handleChange(e) {
    setInput(e.target.value)
    autoResize(e.target)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim() || loading || !onSend) return
    onSend(input.trim())
    setInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const canSend = input.trim().length > 0 && !loading

  return (
    <div className="welcome">
      <div className="welcome-logo-mark">
        X<span className="logo-mark-q">Q</span>T<span className="logo-sub">5</span>
      </div>

      <h2 className="welcome-heading">
        X<span className="wh-orange">Q</span>T<span className="wh-sub">5</span>{' '}
        <span className="wh-navy">AI</span>-Workplace
      </h2>

      <p className="welcome-sub">Was möchtest du heute wissen?</p>

      {onSend && (
        <form className="welcome-input-form" onSubmit={handleSubmit}>
          <div className="welcome-input-box">
            <textarea
              ref={textareaRef}
              className="welcome-textarea"
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Frage stellen, erstelle alles…"
              disabled={loading}
              rows={1}
            />
            <button
              className={`welcome-send-btn${canSend ? ' welcome-send-btn--active' : ''}`}
              type="submit"
              disabled={!canSend}
            >
              <IconSend />
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
