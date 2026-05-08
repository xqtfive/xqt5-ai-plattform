import { useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n/strings'
import { FileTypeIcon } from './Icon'

export default function PoolDocuments({ poolId, documents, canEdit, onUpload, onUploadText, onDelete }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  // null = idle, { name, pct } = upload in progress (pct: 0-100 or -1 for server processing)
  const [uploadingFile, setUploadingFile] = useState(null)
  const [textSaving, setTextSaving] = useState(false)
  const [showTextModal, setShowTextModal] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textError, setTextError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadingFile({ name: file.name, pct: 0 })
    try {
      await onUpload(file, (pct) => setUploadingFile({ name: file.name, pct }))
    } catch {
      // Error handled by parent
    } finally {
      setUploading(false)
      setUploadingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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
            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || textSaving}
          >
            {uploading ? 'Lade hoch...' : 'Dokument hochladen'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={openTextModal}
            disabled={uploading || textSaving}
          >
            Text einfügen
          </button>
          <span className="pool-upload-hint">PDF, TXT oder Bild</span>
        </div>
      )}

      {documents.length === 0 && !uploadingFile ? (
        <div className="pool-empty-state">
          Noch keine Dokumente vorhanden.
          {canEdit && ' Lade ein Dokument hoch, um loszulegen.'}
        </div>
      ) : (
        <div className="pool-document-list">
          {uploadingFile && (
            <div className="pool-doc-item pool-doc-uploading">
              <span className="pool-doc-icon">📄</span>
              <div className="pool-doc-info">
                <span className="pool-doc-name">{uploadingFile.name}</span>
                <div className="pool-upload-progress">
                  <div
                    className={`pool-upload-bar ${uploadingFile.pct === -1 ? 'pool-upload-bar--processing' : ''}`}
                    style={uploadingFile.pct >= 0 ? { width: `${uploadingFile.pct}%` } : undefined}
                  />
                </div>
                <span className="pool-doc-meta pool-upload-status">
                  {uploadingFile.pct === -1 ? 'OCR & Verarbeitung...' : `Hochladen ${uploadingFile.pct}%`}
                </span>
              </div>
            </div>
          )}
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
                  {' \u00B7 '}
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
                    onClick={() => {
                      if (confirm('Dokument löschen?')) onDelete(doc.id)
                    }}
                    title="Dokument löschen"
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
