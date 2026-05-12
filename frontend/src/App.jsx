import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { api } from './api'
import LoginScreen from './components/LoginScreen'
import NavRail from './components/NavRail'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import AdminDashboard from './components/AdminDashboard'
import AssistantManager from './components/AssistantManager'
import TemplateManager from './components/TemplateManager'
import PoolDetail from './components/PoolDetail'
import { useConfirm } from './components/ConfirmDialog'

const FALLBACK_MODEL = 'google/gemini-3-pro-preview'
const DEFAULT_TEMPERATURE = 0.7

export default function App() {
  const confirm = useConfirm()
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [usage, setUsage] = useState(null)

  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODEL)
  const [defaultModelId, setDefaultModelId] = useState(FALLBACK_MODEL)
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE)
  const [imageMode, setImageMode] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState(null)
  const [error, setError] = useState('')

  // Phase C state
  const [assistants, setAssistants] = useState([])
  const [templates, setTemplates] = useState([])
  const [showAssistantManager, setShowAssistantManager] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  // Phase C Step 2: Documents / RAG
  const [chatDocuments, setChatDocuments] = useState([])

  // Phase D state
  const [showAdmin, setShowAdmin] = useState(false)

  // Pools state
  const [pools, setPools] = useState([])
  const [activePool, setActivePool] = useState(null)      // controls sidebar nav panel
  const [displayedPool, setDisplayedPool] = useState(null) // controls main content area
  const [poolTab, setPoolTab] = useState('chats')
  const [poolCounts, setPoolCounts] = useState({ docs: 0, chats: 0, members: 0 })

  // Pool chats in main chat list (Phase 2)
  const [poolChats, setPoolChats] = useState([])
  const [activePoolChatId, setActivePoolChatId] = useState(null)

  // Nav section: 'chat' | 'pools' | 'admin'
  const [activeSection, setActiveSection] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar when clicking outside of it — mobile drawer behaviour only.
  // On desktop the panel is a persistent layout column (see styles.css media
  // query at 768px); outside-click closing would feel wrong there.
  useEffect(() => {
    if (!sidebarOpen) return
    function handleMouseDown(e) {
      if (!window.matchMedia('(max-width: 768px)').matches) return
      if (!e.target.closest('.content-panel') && !e.target.closest('.nav-rail')) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [sidebarOpen])

  // Check auth on mount
  useEffect(() => {
    api.getMe().then((u) => {
      setUser(u)
      setAuthChecked(true)
    }).catch(() => setAuthChecked(true))
  }, [])

  // Load models (public endpoint)
  const loadModels = useCallback(() => {
    api.listModels().then((data) => {
      setModels(data)
      const defaultModel = data.find((m) => m.is_default && m.available)
      const firstAvailable = defaultModel || data.find((m) => m.available)
      if (firstAvailable) {
        setDefaultModelId(firstAvailable.id)
        setSelectedModel(firstAvailable.id)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadModels()
  }, [])

  const loadUsage = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.getUsage()
      setUsage(data)
    } catch {}
  }, [user])

  // Load usage after login
  useEffect(() => {
    if (user) loadUsage()
  }, [user, loadUsage])

  const loadConversations = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.listConversations()
      setConversations(data)
    } catch (e) {
      setError(e.message)
    }
  }, [user])

  useEffect(() => {
    if (user) loadConversations()
  }, [user, loadConversations])

  // Load assistants and templates
  const loadAssistants = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.listAssistants()
      setAssistants(data)
    } catch {}
  }, [user])

  const loadTemplates = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.listTemplates()
      setTemplates(data)
    } catch {}
  }, [user])

  useEffect(() => {
    if (user) {
      loadAssistants()
      loadTemplates()
    }
  }, [user, loadAssistants, loadTemplates])

  // Load pools
  const loadPools = useCallback(async () => {
    if (!user) return
    try {
      const data = await api.listPools()
      setPools(data)
    } catch {}
  }, [user])

  useEffect(() => {
    if (user) loadPools()
  }, [user, loadPools])

  const loadPoolChats = useCallback(async () => {
    if (!user) { setPoolChats([]); return }
    try {
      const data = await api.listMyPoolChats()
      setPoolChats(data || [])
    } catch {
      // silently swallow per existing pattern in loadAssistants etc.
    }
  }, [user])

  useEffect(() => {
    loadPoolChats()
  }, [loadPoolChats])

  const mergedChatItems = useMemo(() => {
    const personal = (conversations || []).map(c => ({ kind: 'personal', ...c }))
    const pool = (poolChats || []).map(c => ({ kind: 'pool', ...c }))
    return [...personal, ...pool].sort(
      (a, b) => (b.created_at || '').localeCompare(a.created_at || '')
    )
  }, [conversations, poolChats])

  // Sync model/temperature when conversation changes
  useEffect(() => {
    if (activeConversation) {
      setSelectedModel(activeConversation.model || defaultModelId)
      if (activeConversation.temperature != null) setTemperature(activeConversation.temperature)
    }
  }, [activeConversation?.id, defaultModelId])

  // Load documents for active conversation. If any doc is still 'processing',
  // schedule a refresh in 5s so the processing badge auto-clears once OCR + embedding
  // finish, without forcing the user to refresh manually.
  const docsPollTimerRef = useRef(null)
  const loadDocuments = useCallback(async () => {
    if (docsPollTimerRef.current) {
      clearTimeout(docsPollTimerRef.current)
      docsPollTimerRef.current = null
    }
    if (!activeConversation?.id) {
      setChatDocuments([])
      return
    }
    try {
      const docs = await api.listDocuments(activeConversation.id, 'all')
      setChatDocuments(docs)
      if (docs.some((d) => d.status === 'processing')) {
        docsPollTimerRef.current = setTimeout(loadDocuments, 5000)
      }
    } catch {}
  }, [activeConversation?.id])

  useEffect(() => {
    loadDocuments()
    return () => {
      if (docsPollTimerRef.current) {
        clearTimeout(docsPollTimerRef.current)
        docsPollTimerRef.current = null
      }
    }
  }, [loadDocuments])

  async function handleAuth(mode, { username, email, password }) {
    if (mode === 'register') {
      const u = await api.register(username, email, password)
      setUser(u)
    } else {
      const u = await api.login(username, password)
      setUser(u)
    }
  }

  function handleLogout() {
    api.logout()
    setUser(null)
    setConversations([])
    setActiveConversation(null)
    setUsage(null)
    setAssistants([])
    setTemplates([])
    setPools([])
    setActivePool(null)
    setPoolChats([])
    setActivePoolChatId(null)
  }

  async function onCreateConversation(assistantId = null) {
    setLoading(true)
    setError('')
    setActivePool(null)
    setActiveSection('chat')
    try {
      const created = await api.createConversation('New Conversation', assistantId)
      setSelectedModel(created.model || defaultModelId)
      setConversations((prev) => [
        {
          id: created.id,
          created_at: created.created_at,
          title: created.title,
          message_count: 0,
        },
        ...prev,
      ])
      setActiveConversation(created)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function onSelectAssistant(assistant) {
    await onCreateConversation(assistant.id)
  }

  async function onOpenConversation(id) {
    setLoading(true)
    setError('')
    setActivePool(null)
    setActiveSection('chat')
    try {
      const full = await api.getConversation(id)
      setActiveConversation(full)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function onDeleteConversation(id) {
    setError('')
    try {
      await api.deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConversation?.id === id) {
        setActiveConversation(null)
      }
    } catch (e) {
      setError(e.message)
    }
  }

  function handleOpenChatItem(item) {
    if (item.kind === 'personal') {
      return onOpenConversation(item.id)
    }
    // Pool chat: navigate into pool + seed activePoolChatId
    setActiveSection('pools')
    const pool = pools.find(p => p.id === item.pool_id)
    if (pool) {
      setActivePool(pool)
      setDisplayedPool(pool)
    }
    setPoolTab('chats')
    setActivePoolChatId(item.id)
  }

  async function handleDeleteChatItem(item) {
    const ok = await confirm({
      title: item.kind === 'pool' ? 'Pool-Chat löschen?' : 'Konversation löschen?',
      message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (!ok) return
    if (item.kind === 'personal') {
      return onDeleteConversation(item.id)
    }
    try {
      await api.deletePoolChat(item.pool_id, item.id)
      await loadPoolChats()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleWelcomeSend(content) {
    setLoading(true)
    setError('')
    try {
      const created = await api.createConversation('New Conversation', null)
      setSelectedModel(created.model || defaultModelId)
      setConversations((prev) => [
        { id: created.id, created_at: created.created_at, title: created.title, message_count: 0 },
        ...prev,
      ])
      setActiveConversation(created)
      setActiveSection('chat')
      // Send the message into the new conversation
      setStreamingContent('')
      const optimisticMessages = [{ role: 'user', content }]
      setActiveConversation((prev) => ({ ...prev, messages: optimisticMessages }))
      await api.sendMessageStream(
        created.id,
        content,
        created.model || defaultModelId,
        temperature,
        imageMode,
        (delta) => { setStreamingContent((prev) => (prev || '') + delta) },
        async (fullContent, sources, imageSources) => {
          setStreamingContent(null)
          setLoading(false)
          const updated = await api.getConversation(created.id)
          if (updated.messages) {
            const lastMsg = updated.messages[updated.messages.length - 1]
            if (lastMsg?.role === 'assistant') {
              if (sources?.length > 0) lastMsg.sources = sources
              if (imageSources?.length > 0) lastMsg.image_sources = imageSources
            }
          }
          setActiveConversation(updated)
          await loadConversations()
          await loadUsage()
        },
        (err) => { setStreamingContent(null); setLoading(false); setError(err) }
      )
    } catch (e) {
      setStreamingContent(null)
      setLoading(false)
      setError(e.message)
    }
  }

  async function onSendMessage(content) {
    if (!activeConversation) return

    setError('')

    // Optimistic: show user message immediately
    const optimisticMessages = [
      ...(activeConversation.messages || []),
      { role: 'user', content },
    ]
    setActiveConversation((prev) => ({ ...prev, messages: optimisticMessages }))
    setLoading(true)
    setStreamingContent('')

    try {
      await api.sendMessageStream(
        activeConversation.id,
        content,
        selectedModel,
        temperature,
        imageMode,
        (delta) => {
          setStreamingContent((prev) => (prev || '') + delta)
        },
        async (fullContent, sources, imageSources) => {
          // Stream complete — finalize
          setStreamingContent(null)
          setLoading(false)

          // Refresh conversation to get stored messages
          const updated = await api.getConversation(activeConversation.id)
          // Attach RAG sources to the last assistant message
          if (updated.messages) {
            const lastMsg = updated.messages[updated.messages.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              if (sources && sources.length > 0) {
                lastMsg.sources = sources
              }
              if (imageSources && imageSources.length > 0) {
                lastMsg.image_sources = imageSources
              }
            }
          }
          setActiveConversation(updated)
          await loadConversations()
          await loadUsage()
        },
        (err) => {
          setStreamingContent(null)
          setLoading(false)
          setError(err)
        }
      )
    } catch (e) {
      setStreamingContent(null)
      setLoading(false)
      setError(e.message)
    }
  }

  async function onModelChange(model) {
    setSelectedModel(model)
    if (activeConversation) {
      try {
        await api.updateConversation(activeConversation.id, { model })
      } catch {}
    }
  }

  async function onTemperatureChange(temp) {
    setTemperature(temp)
    if (activeConversation) {
      try {
        await api.updateConversation(activeConversation.id, { temperature: temp })
      } catch {}
    }
  }

  // Assistant CRUD handlers
  async function handleCreateAssistant(data) {
    await api.createAssistant(data)
    await loadAssistants()
  }

  async function handleUpdateAssistant(id, data) {
    await api.updateAssistant(id, data)
    await loadAssistants()
  }

  async function handleDeleteAssistant(id) {
    await api.deleteAssistant(id)
    await loadAssistants()
  }

  // Template CRUD handlers
  async function handleCreateTemplate(data) {
    await api.createTemplate(data)
    await loadTemplates()
  }

  async function handleUpdateTemplate(id, data) {
    await api.updateTemplate(id, data)
    await loadTemplates()
  }

  async function handleDeleteTemplate(id) {
    await api.deleteTemplate(id)
    await loadTemplates()
  }

  // Document handlers
  //
  // Errors are intentionally NOT caught here — they propagate to FileUpload's
  // per-file state list so a failed file (or rate-limited file) shows its
  // own status row instead of getting collapsed into a single top-level
  // setError() blob that the next file overwrites.
  async function handleUploadDocument(file, chatId, onProgress) {
    await api.uploadDocument(file, chatId, onProgress)
    await loadDocuments()
  }

  async function handleDeleteDocument(docId) {
    setError('')
    try {
      await api.deleteDocument(docId)
      await loadDocuments()
    } catch (e) {
      setError(e.message)
    }
  }

  function handleSectionChange(section) {
    if (section === 'admin') {
      setActiveSection('admin')
      setActivePool(null)
      setShowAdmin(true)
      setSidebarOpen(false)
      return
    }
    // Toggle sidebar when clicking the active section again
    if (section === activeSection && section !== 'admin') {
      setSidebarOpen((prev) => !prev)
      return
    }
    setSidebarOpen(true)
    setActiveSection(section)
    if (section === 'chat') {
      setActivePool(null)
      setDisplayedPool(null)
      setActivePoolChatId(null)
      setShowAdmin(false)
    } else if (section === 'pools') {
      setActiveConversation(null)
      setShowAdmin(false)
    }
  }

  // Pool handlers
  async function handleSelectPool(pool) {
    setActiveConversation(null)
    setShowAdmin(false)
    setActiveSection('pools')
    setActivePool(pool)
    setDisplayedPool(pool)
    setPoolTab('overview')
  }

  async function handleDeletePool() {
    const ok = await confirm({
      title: 'Pool löschen?',
      message: 'Alle Dokumente und Chats dieses Pools werden unwiderruflich entfernt.',
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (!ok) return
    setError('')
    try {
      await api.deletePool(activePool.id)
      setActivePool(null)
      setDisplayedPool(null)
      loadPools()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleLeavePool() {
    const ok = await confirm({
      title: 'Pool verlassen?',
      message: 'Du verlierst den Zugriff auf alle Inhalte dieses Pools.',
      confirmLabel: 'Verlassen',
      destructive: true,
    })
    if (!ok) return
    setError('')
    try {
      await api.removePoolMember(activePool.id, user.id)
      setActivePool(null)
      setDisplayedPool(null)
      loadPools()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleCreatePool(data) {
    setError('')
    try {
      const pool = await api.createPool(data)
      await loadPools()
      handleSelectPool(pool)
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function handleJoinPool(token) {
    const pool = await api.joinPool(token)
    await loadPools()
    handleSelectPool(pool)
  }

  function handleClosePool() {
    setActivePool(null)
    setDisplayedPool(null)
    loadPools()
  }

  if (!authChecked) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onLogin={handleAuth} />
  }

  return (
    <div className="app">
      <NavRail
        user={user}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onManageAssistants={() => setShowAssistantManager(true)}
        onManageTemplates={() => setShowTemplateManager(true)}
        onAdmin={() => handleSectionChange('admin')}
        onLogout={handleLogout}
        onHome={() => {
          setSidebarOpen(false)
          setActiveSection('chat')
          setActiveConversation(null)
          setActivePool(null)
          setDisplayedPool(null)
          setShowAdmin(false)
        }}
      />
      <Sidebar
        open={sidebarOpen && activeSection !== 'admin'}
        section={activeSection === 'pools' ? 'pools' : 'chat'}
        conversations={conversations}
        chatItems={mergedChatItems}
        pools={pools}
        activeId={activePool ? null : activeConversation?.id}
        activePoolChatId={activePoolChatId}
        activePoolId={activePool?.id}
        activePool={activePool}
        poolTab={poolTab}
        poolCounts={poolCounts}
        loading={loading}
        usage={usage}
        assistants={assistants}
        onCreateConversation={onCreateConversation}
        onOpenConversation={onOpenConversation}
        onDeleteConversation={onDeleteConversation}
        onOpenChatItem={handleOpenChatItem}
        onDeleteChatItem={handleDeleteChatItem}
        onSelectPool={handleSelectPool}
        onCreatePool={handleCreatePool}
        onJoinPool={handleJoinPool}
        onPoolTabChange={(tab) => setPoolTab(tab)}
        onClosePool={handleClosePool}
        onDeletePool={handleDeletePool}
        onLeavePool={handleLeavePool}
        onCloseSidebar={() => setSidebarOpen(false)}
      />
      {showAdmin ? (
        <AdminDashboard onClose={() => { setShowAdmin(false); setActiveSection('chat'); loadModels() }} currentUser={user} />
      ) : displayedPool ? (
        <PoolDetail
          pool={displayedPool}
          models={models}
          selectedModel={selectedModel}
          user={user}
          activeTab={poolTab}
          onTabChange={setPoolTab}
          onCountsUpdate={setPoolCounts}
          onError={(msg) => setError(msg)}
          initialChatId={activePoolChatId}
        />
      ) : (
        <ChatArea
          conversation={activeConversation}
          models={models}
          selectedModel={selectedModel}
          temperature={temperature}
          imageMode={imageMode}
          loading={loading}
          streamingContent={streamingContent}
          error={error}
          templates={templates}
          documents={chatDocuments}
          onSend={onSendMessage}
          onWelcomeSend={handleWelcomeSend}
          onModelChange={onModelChange}
          onTemperatureChange={onTemperatureChange}
          onImageModeChange={setImageMode}
          onUpload={handleUploadDocument}
          onDeleteDocument={handleDeleteDocument}
        />
      )}

      {showAssistantManager && (
        <AssistantManager
          assistants={assistants}
          isAdmin={user?.is_admin}
          onClose={() => setShowAssistantManager(false)}
          onCreate={handleCreateAssistant}
          onUpdate={handleUpdateAssistant}
          onDelete={handleDeleteAssistant}
        />
      )}

      {showTemplateManager && (
        <TemplateManager
          templates={templates}
          isAdmin={user?.is_admin}
          onClose={() => setShowTemplateManager(false)}
          onCreate={handleCreateTemplate}
          onUpdate={handleUpdateTemplate}
          onDelete={handleDeleteTemplate}
        />
      )}
    </div>
  )
}
