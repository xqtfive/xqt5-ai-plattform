import { useState } from 'react'
import { PoolIcon } from './Icon'
import Modal from './Modal'

const ICONS = ['\u{1F4DA}', '\u{1F4D6}', '\u{1F5C2}', '\u{1F4C1}', '\u{1F680}', '\u{2B50}', '\u{1F4A1}', '\u{1F3AF}']
const COLORS = ['#ee7f00', '#4CAF50', '#2196F3', '#9C27B0', '#F44336', '#607D8B', '#795548', '#FF9800']

export default function CreatePoolDialog({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('\u{1F4DA}')
  const [color, setColor] = useState('#ee7f00')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), description: description.trim(), icon, color })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Pool erstellen" onClose={onClose}>
      {error && <div className="modal-error">{error}</div>}

      <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Projektdokumentation"
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Beschreibung <span className="form-hint">(optional)</span></label>
            <textarea
              className="form-input form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Worum geht es in diesem Pool?"
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Icon</label>
              <div className="icon-picker">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`icon-option ${icon === ic ? 'selected' : ''}`}
                    onClick={() => setIcon(ic)}
                  >
                    <PoolIcon emoji={ic} size={22} />
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Farbe</label>
              <div className="color-picker">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-option ${color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || saving}>
            {saving ? 'Erstelle...' : 'Erstellen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
