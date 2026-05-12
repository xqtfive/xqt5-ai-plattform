import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import PoolDocuments from './PoolDocuments'
import PoolChatList from './PoolChatList'
import PoolChatArea from './PoolChatArea'
import PoolMembers from './PoolMembers'
import PoolHeader from './PoolHeader'
import PoolOverview from './PoolOverview'

export default function PoolDetail({
  pool,
  models,
  selectedModel,
  user,
  activeTab,
  onTabChange,
  onCountsUpdate,
  onError,
  initialChatId,
  onOpenPoolSidebar,
  activePoolId,
  onPoolChatClosed,
}) {
  const [activeChat, setActiveChat] = useState(null)
  const [chats, setChats] = useState([])
  const [documents, setDocuments] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState(null)
  const [chatModel, setChatModel] = useState(selectedModel)
  const [chatImageMode, setChatImageMode] = useState('auto')
  const [error, setError] = useState('')

  // Reset active chat when leaving chats tab
  useEffect(() => {
    if (activeTab !== 'chats') setActiveChat(null)
  }, [activeTab])

  // One-time seed: open a specific chat when navigating from the merged chat list
  const consumedChatIdRef = useRef(null)
  useEffect(() => {
    if (!initialChatId) return
    if (activeTab !== 'chats') return
    if (consumedChatIdRef.current === initialChatId) return
    consumedChatIdRef.current = initialChatId
    handleOpenChat(initialChatId)
  }, [initialChatId, activeTab])

  // When the parent clears activePoolChatId (e.g., user backed out of a chat),
  // also reset the consumed-ref so re-clicking the same chat in the merged list
  // re-opens it. Without this, the deduplication guard at line 41 would block
  // re-open since the ref still holds the previous chat id.
  useEffect(() => {
    if (!initialChatId) consumedChatIdRef.current = null
  }, [initialChatId])

  // Report counts to parent (for sidebar display)
  useEffect(() => {
    onCountsUpdate?.({ docs: documents.length, chats: chats.length, members: members.length })
  }, [documents.length, chats.length, members.length])

  const docsPollTimerRef = useRef(null)
  const loadDocuments = useCallback(async () => {
    if (docsPollTimerRef.current) {
      clearTimeout(docsPollTimerRef.current)
      docsPollTimerRef.current = null
    }
    try {
      const docs = await api.listPoolDocuments(pool.id)
      setDocuments(docs)
      // Auto-refresh while any doc is still being processed so the badge
      // disappears as soon as OCR + embedding completes server-side.
      if (docs.some((d) => d.status === 'processing')) {
        docsPollTimerRef.current = setTimeout(loadDocuments, 5000)
      }
    } catch {}
  }, [pool.id])

  const loadChats = useCallback(async () => {
    try {
      const data = await api.listPoolChats(pool.id)
      setChats(data)
    } catch {}
  }, [pool.id])

  const loadMembers = useCallback(async () => {
    try {
      const data = await api.listPoolMembers(pool.id)
      setMembers(data)
    } catch {}
  }, [pool.id])

  useEffect(() => {
    loadDocuments()
    loadChats()
    loadMembers()
    return () => {
      if (docsPollTimerRef.current) {
        clearTimeout(docsPollTimerRef.current)
        docsPollTimerRef.current = null
      }
    }
  }, [loadDocuments, loadChats, loadMembers])

  // Errors are intentionally NOT caught here — they propagate to
  // PoolDocuments' per-file state list. See App.jsx handleUploadDocument
  // for the same rationale (single-error-blob would erase prior failures
  // in a multi-file batch).
  async function handleUploadDocument(file, onProgress) {
    await api.uploadPoolDocument(pool.id, file, onProgress)
    await loadDocuments()
  }

  async function handleUploadText(title, content) {
    setError('')
    try {
      await api.uploadPoolText(pool.id, title, content)
      await loadDocuments()
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function handleDeleteDocument(docId) {
    setError('')
    try {
      await api.deletePoolDocument(pool.id, docId)
      await loadDocuments()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleCreateChat(isShared) {
    setError('')
    try {
      const chat = await api.createPoolChat(pool.id, {
        title: 'New Chat',
        is_shared: isShared,
        model: chatModel,
      })
      await loadChats()
      await handleOpenChat(chat.id)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleOpenChat(chatId) {
    setError('')
    setLoading(true)
    onTabChange('chats')
    try {
      const chat = await api.getPoolChat(pool.id, chatId)
      setActiveChat(chat)
      setChatModel(chat.model || selectedModel)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteChat(chatId) {
    setError('')
    try {
      await api.deletePoolChat(pool.id, chatId)
      if (activeChat?.id === chatId) setActiveChat(null)
      await loadChats()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleSendMessage(content) {
    if (!activeChat) return
    setError('')

    const optimisticMessages = [
      ...(activeChat.messages || []),
      { role: 'user', content, username: user.username },
    ]
    setActiveChat((prev) => ({ ...prev, messages: optimisticMessages }))
    setLoading(true)
    setStreamingContent('')

    try {
      await api.sendPoolMessageStream(
        pool.id,
        activeChat.id,
        content,
        chatModel,
        null,
        chatImageMode,
        (delta) => {
          setStreamingContent((prev) => (prev || '') + delta)
        },
        async (fullContent, sources, imageSources) => {
          setStreamingContent(null)
          setLoading(false)
          const updated = await api.getPoolChat(pool.id, activeChat.id)
          if (updated.messages) {
            const lastMsg = updated.messages[updated.messages.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              if (sources && sources.length > 0) lastMsg.sources = sources
              if (imageSources && imageSources.length > 0) lastMsg.image_sources = imageSources
            }
          }
          setActiveChat(updated)
          await loadChats()
        },
        (err) => {
          setStreamingContent(null)
          setLoading(false)
          setError(typeof err === 'string' ? err : (err?.message || err?.detail || 'Fehler beim Senden'))
        }
      )
    } catch (e) {
      setStreamingContent(null)
      setLoading(false)
      setError(e.message)
    }
  }

  const canEdit = ['editor', 'admin', 'owner'].includes(pool.role)
  const canAdmin = ['admin', 'owner'].includes(pool.role)

  return (
    <main className="pool-detail">
      {error && <p className="error-banner">{error}</p>}
      <PoolHeader
        pool={pool}
        counts={{ docs: documents.length, chats: chats.length, members: members.length }}
        members={members}
        onTabChange={onTabChange}
        onOpenPoolSidebar={onOpenPoolSidebar}
        activePoolId={activePoolId}
      />
      {activeTab === 'chats' && activeChat ? (
        <PoolChatArea
          chat={activeChat}
          models={models}
          selectedModel={chatModel}
          imageMode={chatImageMode}
          loading={loading}
          streamingContent={streamingContent}
          onSend={handleSendMessage}
          onModelChange={setChatModel}
          onImageModeChange={setChatImageMode}
          onBack={() => { setActiveChat(null); onPoolChatClosed?.() }}
        />
      ) : (
        <div className="pool-content">
          {activeTab === 'overview' && (
            <PoolOverview
              pool={pool}
              members={members}
              chats={chats}
              documents={documents}
              onTabChange={onTabChange}
              onOpenChat={handleOpenChat}
              onOpenDocument={() => onTabChange('documents')}
            />
          )}

          {activeTab === 'documents' && (
            <PoolDocuments
              poolId={pool.id}
              documents={documents}
              canEdit={canEdit}
              onUpload={handleUploadDocument}
              onUploadText={handleUploadText}
              onDelete={handleDeleteDocument}
            />
          )}

          {activeTab === 'chats' && !activeChat && (
            <PoolChatList
              chats={chats}
              userId={user.id}
              onOpenChat={handleOpenChat}
              onCreateChat={handleCreateChat}
              onDeleteChat={handleDeleteChat}
            />
          )}

          {activeTab === 'members' && (
            <PoolMembers
              poolId={pool.id}
              members={members}
              canAdmin={canAdmin}
              isOwner={pool.role === 'owner'}
              currentUserId={user.id}
              onMembersChanged={loadMembers}
            />
          )}
        </div>
      )}
    </main>
  )
}
