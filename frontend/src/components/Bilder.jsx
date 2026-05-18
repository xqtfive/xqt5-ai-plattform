import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { t } from '../i18n/strings'
import Modal from './Modal'
import { useConfirm } from './ConfirmDialog'

const MAX_CHARS = 2000

export default function Bilder({ onError }) {
  const confirm = useConfirm()

  // Form state
  const [prompt, setPrompt] = useState('')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [formError, setFormError] = useState('')
  const [formInfo, setFormInfo] = useState('')
  const abortRef = useRef(null)
  const backgroundRefreshRef = useRef(null)

  // Gallery state
  const [images, setImages] = useState([])
  const [total, setTotal] = useState(0)
  const [galleryLoading, setGalleryLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const LIMIT = 20

  // Preview modal state
  const [previewImage, setPreviewImage] = useState(null)

  // Budget banner state
  const [budget, setBudget] = useState(null)

  useEffect(() => {
    loadModels()
    loadGallery(true)
    loadBudget()
  }, [])

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
      if (backgroundRefreshRef.current) {
        clearTimeout(backgroundRefreshRef.current)
      }
    }
  }, [])

  async function loadModels() {
    try {
      const data = await api.adminListImageModels()
      setModels(data)
      if (data.length > 0) {
        const def = data.find((m) => m.is_default) || data[0]
        setSelectedModel(def.model_id)
      }
    } catch (e) {
      // Non-admin users may get 403 — silently fall back to empty list
      // Chat-side agent will handle model selection for non-admin flows
    }
  }

  async function loadGallery(reset = false) {
    if (reset) setGalleryLoading(true)
    else setLoadingMore(true)
    try {
      const offset = reset ? 0 : images.length
      const result = await api.listGeneratedImages({ limit: LIMIT, offset })
      if (reset) {
        setImages(result.images)
      } else {
        setImages((prev) => [...prev, ...result.images])
      }
      setTotal(result.total)
    } catch (e) {
      if (onError) onError(e.message)
    } finally {
      setGalleryLoading(false)
      setLoadingMore(false)
    }
  }

  async function loadBudget() {
    try {
      const data = await api.getImageBudget()
      setBudget(data)
    } catch {
      // Optional endpoint — ignore errors
    }
  }

  async function handleGenerate(e) {
    e.preventDefault()
    if (!prompt.trim()) return
    if (!selectedModel) {
      setFormError(t('bilder.form.no_models'))
      return
    }
    setFormError('')
    setFormInfo('')
    setGenerating(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const record = await api.generateImage({
        prompt: prompt.trim(),
        model: selectedModel,
        source: 'studio',
      }, { signal: controller.signal })
      setImages((prev) => [record, ...prev])
      setTotal((n) => n + 1)
      setPrompt('')
      await loadBudget()
    } catch (e) {
      if (e.name !== 'AbortError') {
        setFormError(e.message)
        if (onError) onError(e.message)
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  function handleCancel() {
    // The backend continues generating even after we abort the fetch — the OpenAI/xAI
    // POST is in flight and the provider will bill us regardless. So this button
    // only releases the UI; the image will still appear in the gallery when ready.
    if (abortRef.current) abortRef.current.abort()
    setFormInfo(t('bilder.status.backgrounded'))
    if (backgroundRefreshRef.current) clearTimeout(backgroundRefreshRef.current)
    backgroundRefreshRef.current = setTimeout(() => {
      loadGallery(true)
      loadBudget()
      setFormInfo('')
      backgroundRefreshRef.current = null
    }, 90000)
  }

  async function handleDelete(image) {
    const ok = await confirm({
      title: t('bilder.image.delete.confirm.title'),
      message: t('bilder.image.delete.confirm.message'),
      confirmLabel: t('bilder.image.delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await api.deleteGeneratedImage(image.id)
      setImages((prev) => prev.filter((img) => img.id !== image.id))
      setTotal((n) => n - 1)
    } catch (e) {
      if (onError) onError(e.message)
    }
  }

  async function handleDownload(image) {
    try {
      const resp = await fetch(image.image_url)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `bild-${image.id}.png`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      if (onError) onError(e.message)
    }
  }

  function handleCopyPrompt(image) {
    navigator.clipboard.writeText(image.prompt || '').catch(() => {})
  }

  const charCount = prompt.length
  const charOver = charCount > MAX_CHARS

  return (
    <div className="bilder-container">
      <h1>{t('bilder.heading')}</h1>

      {budget && (
        <div className="bilder-budget-banner">
          <span>{t('admin.kosten.bild.total')}: ${budget.used_today_usd?.toFixed(4) ?? '—'}</span>
          {budget.daily_limit_usd != null && (
            <span> / ${budget.daily_limit_usd.toFixed(2)} {t('bilder.budget.limit')}</span>
          )}
          {budget.remaining_usd != null && (
            <span className="bilder-budget-remaining"> ({t('bilder.budget.remaining')}: ${budget.remaining_usd.toFixed(4)})</span>
          )}
        </div>
      )}

      {/* Generate form */}
      <form className="bilder-form" onSubmit={handleGenerate}>
        {formError && <div className="admin-error">{formError}</div>}
        {formInfo && (
          <div className="bilder-form-info" style={{
            padding: '8px 12px',
            background: 'rgba(33, 52, 82, 0.08)',
            border: '1px solid rgba(33, 52, 82, 0.2)',
            borderRadius: '4px',
            color: '#213452',
            fontSize: '0.9rem',
            marginBottom: '12px',
          }}>{formInfo}</div>
        )}

        <div className="form-group">
          <label htmlFor="bilder-prompt">{t('bilder.form.prompt.label')}</label>
          <textarea
            id="bilder-prompt"
            className="bilder-textarea form-input"
            placeholder={t('bilder.form.prompt.placeholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={MAX_CHARS}
            disabled={generating}
            rows={4}
          />
          <div className={`bilder-char-count${charOver ? ' bilder-char-count--over' : ''}`}>
            {charCount} / {MAX_CHARS} — {t('bilder.form.prompt.hint')}
          </div>
        </div>

        <div className="bilder-form-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="bilder-model">{t('bilder.form.model.label')}</label>
            {models.length === 0 ? (
              <div className="bilder-no-models">{t('bilder.form.no_models')}</div>
            ) : (
              <select
                id="bilder-model"
                className="form-input"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={generating}
              >
                <option value="">{t('bilder.form.model.placeholder')}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.model_id}>
                    {m.display_name || m.model_id}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 0 }}>
            {generating ? (
              <>
                <span className="bilder-generating-label">{t('bilder.status.generating')}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancel}
                >
                  {t('bilder.button.cancel')}
                </button>
              </>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!prompt.trim() || charOver || models.length === 0}
              >
                {t('bilder.button.generate')}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Gallery */}
      <div className="bilder-gallery-section">
        {galleryLoading ? (
          <div className="admin-loading">{t('bilder.gallery.loading')}</div>
        ) : images.length === 0 ? (
          <div className="bilder-gallery-empty">{t('bilder.gallery.empty')}</div>
        ) : (
          <>
            <div className="bilder-gallery">
              {images.map((img) => (
                <BilderCard
                  key={img.id}
                  image={img}
                  onPreview={() => setPreviewImage(img)}
                  onDownload={() => handleDownload(img)}
                  onCopyPrompt={() => handleCopyPrompt(img)}
                  onDelete={() => handleDelete(img)}
                />
              ))}
            </div>

            {images.length < total && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => loadGallery(false)}
                  disabled={loadingMore}
                >
                  {loadingMore ? t('bilder.gallery.loading') : t('bilder.gallery.load_more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Preview modal */}
      {previewImage && (
        <Modal
          title={t('bilder.image.preview.title')}
          onClose={() => setPreviewImage(null)}
          size="large"
        >
          <div className="bilder-image-modal">
            <img
              src={previewImage.image_url}
              alt={previewImage.prompt || ''}
              className="bilder-preview-img"
              onError={(e) => { e.currentTarget.src = '' }}
            />
            <div className="bilder-metadata">
              {previewImage.prompt && (
                <div className="bilder-metadata-row">
                  <span className="bilder-metadata-label">{t('bilder.form.prompt.label')}</span>
                  <span className="bilder-metadata-value">{previewImage.prompt}</span>
                </div>
              )}
              {previewImage.model && (
                <div className="bilder-metadata-row">
                  <span className="bilder-metadata-label">{t('bilder.form.model.label')}</span>
                  <span className="bilder-metadata-value">{previewImage.model}</span>
                </div>
              )}
              {previewImage.created_at && (
                <div className="bilder-metadata-row">
                  <span className="bilder-metadata-label">{t('bilder.image.created_label')}</span>
                  <span className="bilder-metadata-value">
                    {new Date(previewImage.created_at).toLocaleString('de-DE')}
                  </span>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button
                className="btn btn-secondary"
                onClick={() => handleDownload(previewImage)}
              >
                {t('bilder.image.download')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => { setPreviewImage(null); handleDelete(previewImage) }}
              >
                {t('bilder.image.delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function BilderCard({ image, onPreview, onDownload, onCopyPrompt, onDelete }) {
  return (
    <div className="bilder-card">
      <button
        type="button"
        className="bilder-card-thumb-btn"
        onClick={onPreview}
        aria-label={t('bilder.image.preview.title')}
      >
        <img
          src={image.image_url}
          alt={image.prompt || ''}
          className="bilder-card-img"
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      </button>
      <div className="bilder-card-actions">
        <button
          type="button"
          className="btn btn-small btn-secondary"
          title={t('bilder.image.download')}
          onClick={onDownload}
        >
          {t('bilder.image.download')}
        </button>
        <button
          type="button"
          className="btn btn-small btn-secondary"
          title={t('bilder.image.copy_prompt')}
          onClick={onCopyPrompt}
        >
          {t('bilder.image.copy_prompt')}
        </button>
        <button
          type="button"
          className="btn btn-small btn-danger"
          title={t('bilder.image.delete')}
          onClick={onDelete}
        >
          {t('bilder.image.delete')}
        </button>
      </div>
      {image.prompt && (
        <div className="bilder-card-caption" title={image.prompt}>
          {image.prompt.length > 80 ? image.prompt.slice(0, 80) + '...' : image.prompt}
        </div>
      )}
    </div>
  )
}
