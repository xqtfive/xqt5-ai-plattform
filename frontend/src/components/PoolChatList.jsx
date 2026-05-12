import { GlobeIcon, LockIcon } from './Icon'
import { t } from '../i18n/strings'
import { useConfirm } from './ConfirmDialog'

export default function PoolChatList({ chats, userId, onOpenChat, onCreateChat, onDeleteChat }) {
  const confirm = useConfirm()

  async function handleDelete(e, chatId) {
    e.stopPropagation()
    const ok = await confirm({
      title: 'Chat löschen?',
      message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (ok) onDeleteChat(chatId)
  }

  const sortedChats = [...chats].sort(
    (a, b) =>
      (b.last_message_at || b.created_at || '').localeCompare(
        a.last_message_at || a.created_at || ''
      )
  )
  const sharedChats = sortedChats.filter((c) => c.is_shared)
  const privateChats = sortedChats.filter((c) => !c.is_shared)

  return (
    <div className="pool-chat-list">
      <div className="pool-chat-create">
        <button className="btn btn-primary btn-small" onClick={() => onCreateChat(true)}>
          {t('pool.chat.button.shared')}
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => onCreateChat(false)}>
          {t('pool.chat.button.private')}
        </button>
      </div>

      {sharedChats.length > 0 && (
        <div className="pool-chat-section">
          <h4 className="pool-chat-section-title">{t('pool.chat.section.shared')}</h4>
          {sharedChats.map((chat) => (
            <div key={chat.id} className="pool-chat-item" onClick={() => onOpenChat(chat.id)}>
              <span className="pool-chat-icon"><GlobeIcon size={18} /></span>
              <div className="pool-chat-info">
                <span className="pool-chat-name">{chat.title}</span>
                <span className="pool-chat-meta">{chat.message_count} Nachrichten</span>
              </div>
              <button
                className="pool-chat-delete"
                onClick={(e) => handleDelete(e, chat.id)}
                aria-label="Chat löschen"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {privateChats.length > 0 && (
        <div className="pool-chat-section">
          <h4 className="pool-chat-section-title">{t('pool.chat.section.private')}</h4>
          {privateChats.map((chat) => (
            <div key={chat.id} className="pool-chat-item" onClick={() => onOpenChat(chat.id)}>
              <span className="pool-chat-icon"><LockIcon size={18} /></span>
              <div className="pool-chat-info">
                <span className="pool-chat-name">{chat.title}</span>
                <span className="pool-chat-meta">{chat.message_count} Nachrichten</span>
              </div>
              <button
                className="pool-chat-delete"
                onClick={(e) => handleDelete(e, chat.id)}
                aria-label="Chat löschen"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {chats.length === 0 && (
        <div className="pool-empty-state">
          {t('pool.chat.empty')}
        </div>
      )}
    </div>
  )
}
