import { t } from '../i18n/strings'
import { FileTypeIcon } from './Icon'

export default function DocumentList({ documents, onDelete }) {
  if (!documents || documents.length === 0) return null

  return (
    <div className="document-list">
      {documents.map((doc) => (
        <span
          key={doc.id}
          className={`document-item doc-status-${doc.status}`}
          title={doc.error_message || doc.summary || `${doc.chunk_count} ${t('doc.chunks')}`}
        >
          <FileTypeIcon type={doc.file_type} size={15} className="doc-icon" />
          <span className="doc-name">{doc.filename}</span>
          {doc.status === 'ready' && (
            <span className="doc-chunks">{doc.chunk_count}</span>
          )}
          {doc.status === 'processing' && (
            <span className="doc-badge doc-badge--processing">
              <span className="doc-spinner" aria-hidden="true" />
              {t('doc.status.processing')}
            </span>
          )}
          {doc.status === 'error' && (
            <span className="doc-error-icon" title={doc.error_message}>!</span>
          )}
          <button
            className="doc-delete"
            onClick={() => onDelete(doc.id)}
            title={t('doc.action.delete')}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  )
}
