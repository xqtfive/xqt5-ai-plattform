import { useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n/strings'
import { FileTypeIcon } from './Icon'
import { useConfirm } from './ConfirmDialog'

// Same concurrency rules as FileUpload.jsx — see comments there.
const MAX_CONCURRENT = 2
const RATE_LIMIT_WARN_THRESHOLD = 20

export default function PoolDocuments({ poolId, documents, canEdit, onUpload, onUploadText, onDelete }) {
  const confirm = useConfirm()
  const fileInputRef = useRef(null)
  // Per-file upload state for the current/most-recent batch. Each entry:
  //   { file, name, status: 'pending'|'uploading'|'done'|'error', pct: 0-100|-1, error: string|null }
  // Persists across the batch so the user can see what failed and what
  // landed; cleared explicitly via "Liste leeren" or on next selection.
  const [uploads, setUploads] = useState([])
  const [textSaving, setTextSaving] = useState(false)
  const [showTextModal, setShowTextModal] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textError, setTextError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)

  const busyUploading = uploads.some((u) => u.status === 'pending' || u.status === 'uploading')

  async function handleFileChange(e) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return

    if (selected.length > RATE_LIMIT_WARN_THRESHOLD) {
      const ok = await confirm({
        title: 'Rate-Limit-Warnung',
        message: `Du hast ${selected.length} Dateien ausgewählt. Es sind nur ${RATE_LIMIT_WARN_THRESHOLD} Uploads pro Minute erlaubt — Dateien dahinter erhalten eine Rate-Limit-Fehlermeldung.`,
        confirmLabel: 'Fortfahren',
        cancelLabel: 'Abbrechen',
      })
      if (!ok) {
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
    }

    const initial = selected.map((f) => ({
      file: f,
      name: f.name,
      status: 'pending',
      pct: 0,
      error: null,
    }))
    setUploads(initial)

    const patchAt = (idx, patch) => {
      setUploads((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)))
    }

    async function processOne(idx) {
      patchAt(idx, { status: 'uploading', pct: 0 })
      try {
        await onUpload(initial[idx].file, (pct) => patchAt(idx, { pct }))
        patchAt(idx, { status: 'done', pct: 100 })
      } catch (err) {
        patchAt(idx, { status: 'error', error: err?.message || 'Fehler' })
      }
    }

    // Worker-pool semaphore: MAX_CONCURRENT workers pull the next available
    // index until the queue drains. NOT shared with the text-paste flow —
    // that stays atomic.
    let nextIdx = 0
    async function worker() {
      while (nextIdx < initial.length) {
        const myIdx = nextIdx
        nextIdx += 1
        await processOne(myIdx)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, initial.length) }, () => worker())
    )

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearUploadList() {
    setUploads((prev) => prev.filter((u) => u.status === 'pending' || u.status === 'uploading'))
  }

  async function handleOpenPreview(doc) {
    if (!poolId || !doc?.id) return
    setPreviewError('')
    setPreviewLoading(true)
    setPreviewDoc({
      filename: doc.filename,
      file_type: doc.file_type,
      summary: doc.summary || '',
      text_preview: '',
      truncated: false,
      text_length: 0,
    })
    try {
      const preview = await api.getPoolDocumentPreview(poolId, doc.id)
      setPreviewDoc(preview)
    } catch (e) {
      setPreviewError(e.message || 'Vorschau konnte nicht geladen werden')
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    setPreviewLoading(false)
    setPreviewError('')
    setPreviewDoc(null)
  }

  function openTextModal() {
    setTextError('')
    setTextTitle('')
    setTextContent('')
    setShowTextModal(true)
  }

  function closeTextModal() {
    if (textSaving) return
    setTextError('')
    setShowTextModal(false)
  }

  // Text paste is intentionally NOT batchable — one title, one content blob.
  // Do not refactor handleSaveText to share state with handleFileChange.
  async function handleSaveText() {
    if (!onUploadText || textSaving) return
    const content = textContent.trim()
    if (!content) {
      setTextError('Bitte Text einfügen.')
      return
    }
    setTextSaving(true)
    setTextError('')
    try {
      await onUploadText(textTitle.trim(), content)
      setShowTextModal(false)
      setTextTitle('')
      setTextContent('')
    } catch (e) {
      setTextError(e?.message || 'Text konnte nicht gespeichert werden')
    } finally {
      setTextSaving(false)
    }
  }

  return (
    <div className="pool-documents">
      {canEdit && (
        <div className="pool-documents-upload">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyUploading || textSaving}
          >
            {busyUploading ? 'Lade hoch...' : 'Dokumente hochladen'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={openTextModal}
            disabled={busyUploading || textSaving}
          >
            Text einfügen
          </button>
          <span className="pool-upload-hint">PDF, Office, CSV, Markdown, TXT, Bild</span>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="pool-upload-batch">
          {uploads.map((u, i) => (
            <div
              key={i}
              className={`pool-doc-item pool-doc-uploading pool-upload-batch-item--${u.status}`}
              title={u.error || ''}
            >
              <span className="pool-doc-icon">📄</span>
              <div className="pool-doc-info">
                <span className="pool-doc-name">{u.name}</span>
                {u.status === 'uploading' && (
                  <div className="pool-upload-progress">
                    <div
                      className={`pool-upload-bar ${u.pct === -1 ? 'pool-upload-bar--processing' : ''}`}
                      style={u.pct >= 0 ? { width: `${u.pct}%` } : undefined}
                    />
                  </div>
                )}
                <span className="pool-doc-meta pool-upload-status">
                  {u.status === 'pending' && 'Warten in der Warteschlange...'}
                  {u.status === 'uploading' &&
                    (u.pct === -1 ? 'OCR & Verarbeitung...' : `Hochladen ${u.pct}%`)}
                  {u.status === 'done' && 'OK — fertig hochgeladen'}
                  {u.status === 'error' && (u.error || 'Fehler')}
                </span>
              </div>
            </div>
          ))}
          {!busyUploading && (
            <button
              type="button"
              className="btn btn-secondary btn-small pool-upload-batch-clear"
              onClick={clearUploadList}
            >
              Liste leeren
            </button>
          )}
        </div>
      )}

      {documents.length === 0 && uploads.length === 0 ? (
        <div className="pool-empty-state">
          Noch keine Dokumente vorhanden.
          {canEdit && ' Lade ein Dokument hoch, um loszulegen.'}
        </div>
      ) : (
        <div className="pool-document-list">
          {documents.map((doc) => (
            <div key={doc.id} className={`pool-doc-item doc-status-${doc.status}`}>
              <FileTypeIcon type={doc.file_type} size={20} className="pool-doc-icon" />
              <div className="pool-doc-info">
                <span className="pool-doc-name">{doc.filename}</span>
                {doc.summary && (
                  <span className="pool-doc-summary">{doc.summary}</span>
                )}
                {doc.status === 'processing' && (
                  <span className="doc-badge doc-badge--processing">
                    <span className="doc-spinner" aria-hidden="true" />
                    {t('doc.status.processing')}
                  </span>
                )}
                <span className="pool-doc-meta">
                  {doc.status === 'ready' && `${doc.chunk_count} Chunks`}
                  {doc.status === 'processing' && t('doc.status.processing.long')}
                  {doc.status === 'error' && (doc.error_message || 'Fehler')}
                  {' · '}
                  {(doc.file_size_bytes / 1024).toFixed(0)} KB
                </span>
              </div>
              <div className="pool-doc-actions">
                <button
                  className="btn btn-secondary btn-small pool-doc-preview"
                  onClick={() => handleOpenPreview(doc)}
                  title="Dokument-Vorschau öffnen"
                >
                  Vorschau
                </button>
                {canEdit && (
                  <button
                    className="pool-doc-delete"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Dokument löschen?',
                        message: 'Inhalte und Chunks werden unwiderruflich entfernt.',
                        confirmLabel: 'Löschen',
                        destructive: true,
                      })
                      if (ok) onDelete(doc.id)
                    }}
                    title="Dokument löschen"
                    aria-label="Dokument löschen"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewDoc && (
        <div className="pool-preview-modal-backdrop" onClick={closePreview}>
          <div className="pool-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pool-preview-header">
              <h3>Vorschau: {previewDoc.filename}</h3>
              <button className="pool-preview-close" onClick={closePreview} title="Schließen">
                &times;
              </button>
            </div>
            <div className="pool-preview-body">
              {previewLoading && <p>Lade Vorschau...</p>}
              {!previewLoading && previewError && <p className="pool-preview-error">{previewError}</p>}
              {!previewLoading && !previewError && (
                <>
                  {previewDoc.summary && (
                    <blockquote className="pool-preview-summary">{previewDoc.summary}</blockquote>
                  )}
                  {previewDoc.image_data_url && (
                    <img
                      src={previewDoc.image_data_url}
                      alt={previewDoc.filename || 'Bildvorschau'}
                      className="pool-preview-image"
                    />
                  )}
                  {previewDoc.text_preview ? (
                    <>
                      <pre className="pool-preview-text">{previewDoc.text_preview}</pre>
                      {previewDoc.truncated && (
                        <p className="pool-preview-hint">
                          Vorschau gekürzt ({previewDoc.text_length} Zeichen insgesamt).
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="pool-preview-empty">Keine Textvorschau verfügbar.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showTextModal && (
        <div className="pool-preview-modal-backdrop" onClick={closeTextModal}>
          <div className="pool-text-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pool-preview-header">
              <h3>Text einfügen</h3>
              <button className="pool-preview-close" onClick={closeTextModal} title="Schließen">
                &times;
              </button>
            </div>
            <div className="pool-preview-body pool-text-modal-body">
              <label className="pool-text-label" htmlFor="pool-text-title">
                Titel (optional)
              </label>
              <input
                id="pool-text-title"
                className="pool-text-input"
                type="text"
                placeholder="z. B. Meeting-Notizen"
                value={textTitle}
                maxLength={200}
                onChange={(e) => setTextTitle(e.target.value)}
                disabled={textSaving}
              />

              <label className="pool-text-label" htmlFor="pool-text-content">
                Text
              </label>
              <textarea
                id="pool-text-content"
                className="pool-text-editor"
                placeholder="Hier Text per Copy/Paste einfügen..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                disabled={textSaving}
                rows={12}
              />

              {textError && <p className="pool-preview-error">{textError}</p>}

              <div className="pool-text-actions">
                <button className="btn btn-secondary btn-small" onClick={closeTextModal} disabled={textSaving}>
                  Abbrechen
                </button>
                <button className="btn btn-primary btn-small" onClick={handleSaveText} disabled={textSaving}>
                  {textSaving ? 'Speichere...' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
