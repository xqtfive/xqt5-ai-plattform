import { useState } from 'react'
import { useConfirm } from './ConfirmDialog'

const EMPTY_FORM = {
  name: '',
  description: '',
  system_prompt: '',
  model: '',
  temperature: '',
  icon: '\u{1F916}',
  is_global: false,
}

export default function AssistantManager({
  assistants,
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

  function startEdit(assistant) {
    setEditing(assistant.id)
    setForm({
      name: assistant.name || '',
      description: assistant.description || '',
      system_prompt: assistant.system_prompt || '',
      model: assistant.model || '',
      temperature: assistant.temperature != null ? String(assistant.temperature) : '',
      icon: assistant.icon || '\u{1F916}',
      is_global: assistant.is_global || false,
    })
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim() || !form.system_prompt.trim()) {
      setError('Name und System-Prompt sind erforderlich')
      return
    }
    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      system_prompt: form.system_prompt.trim(),
      icon: form.icon || '\u{1F916}',
      is_global: form.is_global,
    }
    if (form.model.trim()) data.model = form.model.trim()
    if (form.temperature !== '') data.temperature = parseFloat(form.temperature)

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
      title: 'Assistent löschen?',
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

  function canEdit(assistant) {
    return !assistant.is_global || isAdmin
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assistenten verwalten</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && <p className="modal-error">{error}</p>}

        {editing ? (
          <div className="assistant-form">
            <div className="form-group">
              <label>Icon</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                maxLength={2}
                className="form-input form-input-icon"
              />
            </div>
            <div className="form-group">
              <label>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z.B. Code-Reviewer"
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
              <label>System-Prompt *</label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="Du bist ein hilfreicher Assistent..."
                className="form-input form-textarea"
                rows={6}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Model-Override</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="z.B. openai/gpt-4o"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Temperature</label>
                <input
                  type="number"
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                  placeholder="0.0 - 2.0"
                  className="form-input"
                  min="0"
                  max="2"
                  step="0.1"
                />
              </div>
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
              + Neuer Assistent
            </button>
            <div className="manager-list">
              {assistants.map((a) => (
                <div key={a.id} className="manager-item">
                  <div className="manager-item-info">
                    <span className="manager-item-icon">{a.icon || '\u{1F916}'}</span>
                    <div>
                      <div className="manager-item-name">
                        {a.name}
                        {a.is_global && <span className="assistant-global-badge">Global</span>}
                      </div>
                      <div className="manager-item-desc">{a.description}</div>
                    </div>
                  </div>
                  {canEdit(a) && (
                    <div className="manager-item-actions">
                      <button className="btn btn-small" onClick={() => startEdit(a)}>Bearbeiten</button>
                      <button className="btn btn-small btn-danger" onClick={() => handleDelete(a.id)}>Löschen</button>
                    </div>
                  )}
                </div>
              ))}
              {assistants.length === 0 && (
                <p className="manager-empty">Noch keine Assistenten erstellt.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
