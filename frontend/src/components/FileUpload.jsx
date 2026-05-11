import { useRef, useState } from 'react'

// Max parallel uploads. The backend rate-limit is 20/min per user; we keep
// concurrency at 2 so even a 25-file drop trickles through without slamming
// the rate window faster than the limit can drain, and so 8 PDFs don't sit
// in a single sequential queue waiting on Mistral OCR roundtrips.
const MAX_CONCURRENT = 2

// Rate-limit warning threshold — files beyond this likely hit the 20/min
// backend ceiling and will surface as `rate-limited` rows in the list.
const RATE_LIMIT_WARN_THRESHOLD = 20

export default function FileUpload({ chatId, onUploadComplete, disabled }) {
  const fileInputRef = useRef(null)
  // Per-file state. Each entry: { file, name, status, pct, error }.
  //   status: 'pending' | 'uploading' | 'done' | 'error'
  //   pct:    0-100 transfer %, or -1 for "server processing" (file sent, awaiting response)
  const [files, setFiles] = useState([])

  const busy = files.some((f) => f.status === 'pending' || f.status === 'uploading')

  async function handleFileChange(e) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return

    if (selected.length > RATE_LIMIT_WARN_THRESHOLD) {
      const ok = window.confirm(
        `Du hast ${selected.length} Dateien ausgewählt. Es sind nur ${RATE_LIMIT_WARN_THRESHOLD} Uploads pro Minute erlaubt — Dateien dahinter erhalten eine Rate-Limit-Fehlermeldung. Trotzdem fortfahren?`
      )
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
    setFiles(initial)

    const patchAt = (idx, patch) => {
      setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
    }

    async function processOne(idx) {
      patchAt(idx, { status: 'uploading', pct: 0 })
      try {
        await onUploadComplete(initial[idx].file, chatId, (pct) => patchAt(idx, { pct }))
        patchAt(idx, { status: 'done', pct: 100 })
      } catch (err) {
        patchAt(idx, { status: 'error', error: err?.message || 'Fehler' })
      }
    }

    // Simple worker-pool semaphore: spawn MAX_CONCURRENT workers, each pulling
    // the next available index until the queue drains.
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

  function clearDone() {
    setFiles((prev) => prev.filter((f) => f.status === 'pending' || f.status === 'uploading'))
  }

  return (
    <div className="file-upload">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        className="upload-btn"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || busy}
        title="Dateien hochladen (PDF, Office, CSV, Markdown, TXT, Bild — mehrere zugleich erlaubt)"
      >
        {busy ? '⏳' : '\u{1F4CE}'}
      </button>

      {files.length > 0 && (
        <ul className="file-upload-list">
          {files.map((f, i) => (
            <li
              key={i}
              className={`file-upload-item file-upload-item--${f.status}`}
              title={f.error || ''}
            >
              <span className="file-upload-name">{f.name}</span>
              <span className="file-upload-status">
                {f.status === 'pending' && 'Warten'}
                {f.status === 'uploading' &&
                  (f.pct === -1 ? 'Verarbeitung...' : `${f.pct}%`)}
                {f.status === 'done' && 'OK'}
                {f.status === 'error' && (f.error || 'Fehler')}
              </span>
            </li>
          ))}
          {!busy && (
            <li className="file-upload-list-actions">
              <button
                type="button"
                className="file-upload-list-clear"
                onClick={clearDone}
              >
                Liste leeren
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
