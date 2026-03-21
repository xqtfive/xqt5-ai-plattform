import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import MessageInput from './MessageInput'
import Welcome from './Welcome'

export default function ChatArea({
  conversation,
  models,
  selectedModel,
  temperature,
  imageMode,
  loading,
  streamingContent,
  error,
  templates,
  documents,
  onSend,
  onWelcomeSend,
  onModelChange,
  onTemperatureChange,
  onImageModeChange,
  onUpload,
  onDeleteDocument,
}) {
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages, streamingContent])

  if (!conversation) {
    return (
      <main className="chat-area">
        {error && <p className="error-banner">{error}</p>}
        <Welcome onSend={onWelcomeSend} loading={loading} />
      </main>
    )
  }

  return (
    <main className="chat-area">
      {error && <p className="error-banner">{error}</p>}

      <section className="messages">
        {(conversation.messages || []).map((m, index) => (
          <MessageBubble
            key={index}
            role={m.role}
            content={m.content || ''}
            model={m.model}
            sources={m.sources}
            imageSources={m.image_sources}
          />
        ))}

        {streamingContent !== null && (
          <MessageBubble
            role="assistant"
            content={streamingContent}
            isStreaming={true}
          />
        )}

        <div ref={messagesEndRef} />
      </section>

        <MessageInput
        models={models}
        selectedModel={selectedModel}
          temperature={temperature}
          imageMode={imageMode}
          loading={loading}
        templates={templates}
        chatId={conversation?.id}
        documents={documents}
        onSend={onSend}
          onModelChange={onModelChange}
          onTemperatureChange={onTemperatureChange}
          onImageModeChange={onImageModeChange}
          onUpload={onUpload}
        onDeleteDocument={onDeleteDocument}
      />
    </main>
  )
}
