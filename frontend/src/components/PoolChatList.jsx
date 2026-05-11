import { GlobeIcon, LockIcon } from './Icon'

export default function PoolChatList({ chats, userId, onOpenChat, onCreateChat, onDeleteChat }) {
  const sharedChats = chats.filter((c) => c.is_shared)
  const privateChats = chats.filter((c) => !c.is_shared)

  return (
    <div className="pool-chat-list">
      <div className="pool-chat-create">
        <button className="btn btn-primary btn-small" onClick={() => onCreateChat(true)}>
          Shared Chat
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => onCreateChat(false)}>
          Privater Chat
        </button>
      </div>

      {sharedChats.length > 0 && (
        <div className="pool-chat-section">
          <h4 className="pool-chat-section-title">Shared Chats</h4>
          {sharedChats.map((chat) => (
            <div key={chat.id} className="pool-chat-item" onClick={() => onOpenChat(chat.id)}>
              <span className="pool-chat-icon"><GlobeIcon size={18} /></span>
              <div className="pool-chat-info">
                <span className="pool-chat-name">{chat.title}</span>
                <span className="pool-chat-meta">{chat.message_count} Nachrichten</span>
              </div>
              <button
                className="pool-chat-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Chat löschen?')) onDeleteChat(chat.id)
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {privateChats.length > 0 && (
        <div className="pool-chat-section">
          <h4 className="pool-chat-section-title">Meine privaten Chats</h4>
          {privateChats.map((chat) => (
            <div key={chat.id} className="pool-chat-item" onClick={() => onOpenChat(chat.id)}>
              <span className="pool-chat-icon"><LockIcon size={18} /></span>
              <div className="pool-chat-info">
                <span className="pool-chat-name">{chat.title}</span>
                <span className="pool-chat-meta">{chat.message_count} Nachrichten</span>
              </div>
              <button
                className="pool-chat-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Chat löschen?')) onDeleteChat(chat.id)
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {chats.length === 0 && (
        <div className="pool-empty-state">
          Noch keine Chats. Erstelle einen Shared oder privaten Chat.
        </div>
      )}
    </div>
  )
}
