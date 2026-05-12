import { useState } from 'react'
import { useConfirm } from './ConfirmDialog'

const EMPTY_FORM = {
  name: '',
  description: '',
  content: '',
  category: 'general',
  is_global: false,
}

const CATEGORIES = ['general', 'coding', 'writing', 'analysis', 'translation', 'other']

export default function TemplateManager({
  templates,
  isAdmin,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  function startCreate() {
    setEditing('new')
    setForm(EMPTY_FORM)
    setError('')
  }

  function startEdit(template) {
    setEditing(template.id)
    setForm({
      name: template.name || '',
      description: template.description || '',
      content: template.content || '',
      category: template.category || 'general',
      is_global: template.is_global || false,
    })
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim() || !form.content.trim()) {
      setError('Name und Inhalt sind erforderlich')
      return
    }
    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      content: form.content.trim(),
      category: form.category,
      is_global: form.is_global,
    }
    try {
      if (editing === 'new') {
        await onCreate(data)
      } else {
        await onUpdate(editing, data)
      }
      setEditing(null)
      setForm(EMPTY_FORM)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: 'Vorlage löschen?',
      message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (!ok) return
    try {
      await onDelete(id)
    } catch (e) {
      setError(e.message)
    }
  }

  function canEdit(template) {
    return !template.is_global || isAdmin
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Templates verwalten</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <p className="modal-error">{error}</p>}

        {editing ? (
          <div className="template-form">
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Code Review"
                className="form-input"
                maxLength={100}
              />
            </div>
            <div className="form-group">
              <label>Beschreibung</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Kurze Beschreibung..."
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Kategorie</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="form-input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Inhalt * <span className="form-hint">{'(Verwende {{platzhalter}} für Variablen)'}</span></label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={'Übersetze folgenden Text ins {{sprache}}:\n\n{{text}}'}
                className="form-input form-textarea"
                rows={8}
              />
            </div>
            {isAdmin && (
              <div className="form-group">
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={form.is_global}
                    onChange={(e) => setForm({ ...form, is_global: e.target.checked })}
                  />
                  Global (für alle Nutzer sichtbar)
                </label>
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave}>Speichern</button>
            </div>
          </div>
        ) : (
          <>
            <button className="btn btn-primary btn-full" onClick={startCreate}>
              + Neues Template
            </button>
            <div className="manager-list">
              {templates.map((t) => (
                <div key={t.id} className="manager-item">
                  <div className="manager-item-info">
                    <div>
                      <div className="manager-item-name">
                        {t.name}
                        <span className="template-category-badge">{t.category}</span>
                        {t.is_global && <span className="assistant-global-badge">Global</span>}
                      </div>
                      <div className="manager-item-desc">{t.description || t.content.slice(0, 80) + '...'}</div>
                    </div>
                  </div>
                  {canEdit(t) && (
                    <div className="manager-item-actions">
                      <button className="btn btn-small" onClick={() => startEdit(t)}>Bearbeiten</button>
                      <button className="btn btn-small btn-danger" onClick={() => handleDelete(t.id)}>Löschen</button>
                    </div>
                  )}
                </div>
              ))}
              {templates.length === 0 && (
                <p className="manager-empty">Noch keine Templates erstellt.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
