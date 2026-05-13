import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import SourceDisplay from './SourceDisplay'
import Modal from './Modal'
import { t } from '../i18n/strings'

function downloadImage(url) {
  const a = document.createElement('a')
  a.href = url
  a.download = 'bild.png'
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function MessageBubble({
  role,
  content,
  model,
  isStreaming,
  sources,
  imageSources,
  username,
  generated_image_id,
  image_url,
  prompt,
  onGenerateImage,
}) {
  const [imgError, setImgError] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)

  const displayContent = content || ''
  const isUser = role === 'user'

  if (generated_image_id || image_url) {
    return (
      <article className={`message ${role}${isStreaming ? ' streaming' : ''}`}>
        <div className="message-avatar">
          {isUser ? (username?.[0]?.toUpperCase() || 'D') : 'KI'}
        </div>

        <div className="message-body">
          <div className="message-bubble">
            <div className="message-content">
              {!imgError && image_url ? (
                <div className="message-image-wrapper">
                  <img
                    src={image_url}
                    alt={prompt || t('chat.image.placeholder')}
                    className="message-image"
                    onError={() => setImgError(true)}
                    onClick={() => setImagePreview(image_url)}
                    style={{ cursor: 'zoom-in' }}
                  />
                  <button
                    className="message-image-download"
                    onClick={() => downloadImage(image_url)}
                    title={t('bilder.image.download')}
                    type="button"
                  >
                    ↓
                  </button>
                </div>
              ) : (
                <div className="message-image-error">
                  <span>{t('chat.image.unavailable')}</span>
                  {onGenerateImage && prompt && (
                    <button
                      className="btn btn-secondary btn-small"
                      type="button"
                      onClick={() => onGenerateImage({ prompt })}
                    >
                      {t('chat.image.regenerate')}
                    </button>
                  )}
                </div>
              )}
              {displayContent && (
                <p className="message-image-caption">{displayContent}</p>
              )}
            </div>
          </div>

          <div className="message-meta">
            {isUser
              ? (username || 'Du')
              : model && <span className="message-model-tag">{model}</span>
            }
          </div>

          {!isUser && (
            <SourceDisplay sources={sources} imageSources={imageSources} />
          )}
        </div>

        {imagePreview && (
          <Modal onClose={() => setImagePreview(null)} closeOnBackdropClick>
            <img
              src={imagePreview}
              alt={prompt || ''}
              style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
            />
          </Modal>
        )}
      </article>
    )
  }

  return (
    <article className={`message ${role}${isStreaming ? ' streaming' : ''}`}>
      <div className="message-avatar">
        {isUser ? (username?.[0]?.toUpperCase() || 'D') : 'KI'}
      </div>

      <div className="message-body">
        <div className="message-bubble">
          <div className="message-content">
            {isUser ? (
              displayContent
            ) : (
              <ReactMarkdown>{displayContent}</ReactMarkdown>
            )}
            {isStreaming && <span className="streaming-cursor" />}
          </div>
        </div>

        <div className="message-meta">
          {isUser
            ? (username || 'Du')
            : model && <span className="message-model-tag">{model}</span>
          }
        </div>

        {!isUser && (
          <SourceDisplay sources={sources} imageSources={imageSources} />
        )}
      </div>
    </article>
  )
}
