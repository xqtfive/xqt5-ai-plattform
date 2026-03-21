import { useState, useRef } from 'react'
import ModelSelector from './ModelSelector'
import TemperatureSlider from './TemperatureSlider'
import TemplatePicker from './TemplatePicker'
import FileUpload from './FileUpload'
import DocumentList from './DocumentList'

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

export default function MessageInput({
  models,
  selectedModel,
  temperature,
  imageMode,
  loading,
  templates,
  chatId,
  documents,
  onSend,
  onModelChange,
  onTemperatureChange,
  onImageModeChange,
  onUpload,
  onDeleteDocument,
}) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef(null)

  function autoResize(el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }

  function handleChange(e) {
    setMessage(e.target.value)
    autoResize(e.target)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim() || loading) return
    onSend(message.trim())
    setMessage('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleInsertTemplate(content) {
    setMessage((prev) => prev ? prev + '\n' + content : content)
    setTimeout(() => {
      if (textareaRef.current) autoResize(textareaRef.current)
    }, 0)
  }

  const canSend = message.trim().length > 0 && !loading

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <div className="input-card">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className="input-card-textarea"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Nachricht schreiben… (Enter = Senden, Shift+Enter = Zeilenumbruch)"
          disabled={loading}
          rows={1}
        />

        {/* Bottom bar */}
        <div className="input-card-bar">
          <div className="input-card-bar-left">
            {chatId && onUpload && (
              <FileUpload chatId={chatId} onUploadComplete={onUpload} disabled={loading} />
            )}
            <TemplatePicker templates={templates} onSelect={handleInsertTemplate} />
            <ModelSelector models={models} selectedModel={selectedModel} onChange={onModelChange} />
            <TemperatureSlider temperature={temperature} onChange={onTemperatureChange} />
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

      <DocumentList documents={documents} onDelete={onDeleteDocument} />
    </form>
  )
}
