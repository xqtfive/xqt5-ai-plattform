import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import Modal from './Modal'

const ConfirmContext = createContext(null)

const DEFAULTS = {
  title: 'Bestätigen?',
  message: '',
  confirmLabel: 'Bestätigen',
  cancelLabel: 'Abbrechen',
  destructive: false,
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }) {
  const [options, setOptions] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setOptions({ ...DEFAULTS, ...opts })
    })
  }, [])

  function resolveWith(value) {
    setOptions(null)
    const fn = resolveRef.current
    resolveRef.current = null
    if (fn) fn(value)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog
          options={options}
          onConfirm={() => resolveWith(true)}
          onCancel={() => resolveWith(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ options, onConfirm, onCancel }) {
  const cancelRef = useRef(null)
  const messageIdRef = useRef(`confirm-msg-${Math.random().toString(36).slice(2, 9)}`)

  useLayoutEffect(() => {
    if (cancelRef.current) cancelRef.current.focus()
  }, [])

  return (
    <Modal
      role="alertdialog"
      title={options.title}
      onClose={onCancel}
      describedBy={options.message ? messageIdRef.current : undefined}
      closeOnBackdropClick={false}
      size="confirm"
    >
      {options.message && (
        <p id={messageIdRef.current} className="confirm-message">{options.message}</p>
      )}
      <div className="form-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
        >
          {options.cancelLabel}
        </button>
        <button
          type="button"
          className={options.destructive ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={onConfirm}
        >
          {options.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
