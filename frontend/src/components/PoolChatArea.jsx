import { useEffect, useRef, useState } from 'react'
import MessageBubble from './MessageBubble'

function IconSend() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function IconLoading() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
      <path d="M12 3a9 9 0 0 1 9 9" style={{ animation: 'spin 0.8s linear infinite' }} />
    </svg>
  )
}

export default function PoolChatArea({
  chat,
  models,
  selectedModel,
  imageMode,
  loading,
  streamingContent,
  onSend,
  onModelChange,
  onImageModeChange,
  onBack,
}) {
  const messagesEndRef = useRef(null)
  const [input, setInput] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat?.messages, streamingContent])

  function autoResize(el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }

  function handleChange(e) {
    setInput(e.target.value)
    autoResize(e.target)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim() || loading) return
    onSend(input.trim())
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const canSend = input.trim().length > 0 && !loading

  return (
    <div className="pool-chat-area">
      <div className="pool-chat-header">
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          &larr; Zurück
        </button>
        <span className="pool-chat-title">
          {chat.is_shared ? '🌍' : '🔒'} {chat.title}
        </span>
      </div>

      <section className="messages pool-messages">
        {(chat.messages || []).map((m, index) => (
          <MessageBubble
            key={index}
            role={m.role}
            content={m.content || ''}
            model={m.model}
            sources={m.sources}
            imageSources={m.image_sources}
            username={m.username}
          />
        ))}

        {streamingContent !== null && (
          <MessageBubble
            role="assistant"
            content={streamingContent}
            isStreaming={true}
          />
        )}

        <div ref={messagesEndRef} />
      </section>

      <form className="input-form" onSubmit={handleSubmit}>
        <div className="input-card">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className="input-card-textarea"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht schreiben… (Enter = Senden, Shift+Enter = Zeilenumbruch)"
            disabled={loading}
            rows={1}
          />

          {/* Bottom bar */}
          <div className="input-card-bar">
            <div className="input-card-bar-left">
              <select
                className="toolbar-select"
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                title="Modell"
              >
                {(models || []).map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.display_name || m.name || m.id}
                  </option>
                ))}
              </select>
              <select
                className="toolbar-select"
                value={imageMode || 'auto'}
                onChange={(e) => onImageModeChange?.(e.target.value)}
                title="Bildquellen"
              >
                <option value="auto">Bilder: Auto</option>
                <option value="on">Bilder: Ein</option>
                <option value="off">Bilder: Aus</option>
              </select>
            </div>

            <button
              className={`input-send-btn${canSend ? ' input-send-btn--active' : ''}`}
              type="submit"
              disabled={!canSend}
              title="Senden"
            >
              {loading ? <IconLoading /> : <IconSend />}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
