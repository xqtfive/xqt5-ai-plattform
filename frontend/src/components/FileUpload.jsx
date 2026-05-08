import { useRef, useState } from 'react'

export default function FileUpload({ chatId, onUploadComplete, disabled }) {
  const fileInputRef = useRef(null)
  // null = idle, 0-100 = upload%, -1 = server processing
  const [uploadPct, setUploadPct] = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadPct(0)
    try {
      await onUploadComplete(file, chatId, setUploadPct)
    } catch {
      // Error handled by parent
    } finally {
      setUploadPct(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const uploading = uploadPct !== null
  const isProcessing = uploadPct === -1

  return (
    <div className="file-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        className="upload-btn"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading}
        title="Upload PDF, Office (DOCX/XLSX), CSV, Markdown, TXT or image"
      >
        {uploading ? '⏳' : '\u{1F4CE}'}
      </button>
      {uploading && (
        <div className="file-upload-progress">
          <div
            className={`file-upload-bar ${isProcessing ? 'file-upload-bar--processing' : ''}`}
            style={!isProcessing ? { width: `${uploadPct}%` } : undefined}
          />
          <span className="file-upload-label">
            {isProcessing ? 'Verarbeitung...' : `${uploadPct}%`}
          </span>
        </div>
      )}
    </div>
  )
}
