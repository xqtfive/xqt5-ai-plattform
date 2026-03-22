const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001'

// FastAPI can return detail as a string OR as a list of validation error objects
function extractDetail(err, fallback) {
  const d = err?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length > 0) return d[0]?.msg || fallback
  return fallback
}

function getAccessToken() {
  return localStorage.getItem('access_token')
}

function getRefreshToken() {
  return localStorage.getItem('refresh_token')
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem('access_token', accessToken)
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
}

function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

function authHeaders() {
  const token = getAccessToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

async function authFetch(url, options = {}) {
  const headers = { ...authHeaders(), ...(options.headers || {}) }
  let response = await fetch(url, { ...options, headers })

  // Try refresh on 401
  if (response.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const retryHeaders = { ...authHeaders(), ...(options.headers || {}) }
      response = await fetch(url, { ...options, headers: retryHeaders })
    }
  }

  return response
}

async function tryRefresh() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!response.ok) {
      clearTokens()
      return false
    }
    const data = await response.json()
    setTokens(data.access_token, null)
    return true
  } catch {
    clearTokens()
    return false
  }
}

// XHR-based upload for progress tracking.
// onProgress(pct): 0-100 = file transfer %, -1 = server processing (file sent, waiting for response)
function uploadWithXhr(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    const token = getAccessToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
      xhr.upload.addEventListener('load', () => onProgress(-1))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) } catch { resolve(xhr.responseText) }
      } else {
        try {
          const err = JSON.parse(xhr.responseText)
          reject(new Error(extractDetail(err, `HTTP ${xhr.status}`)))
        } catch { reject(new Error(`HTTP ${xhr.status}`)) }
      }
    }
    xhr.onerror = () => reject(new Error('Netzwerkfehler beim Hochladen'))
    xhr.send(formData)
  })
}

export const api = {
  // Auth
  async register(username, email, password) {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.detail || 'Registrierung fehlgeschlagen')
    }
    const data = await response.json()
    setTokens(data.access_token, data.refresh_token)
    return data.user
  },

  async login(username, password) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.detail || 'Login fehlgeschlagen')
    }
    const data = await response.json()
    setTokens(data.access_token, data.refresh_token)
    return data.user
  },

  async getMe() {
    const token = getAccessToken()
    if (!token) return null
    const response = await authFetch(`${API_BASE}/api/auth/me`)
    if (!response.ok) {
      clearTokens()
      return null
    }
    return response.json()
  },

  logout() {
    clearTokens()
  },

  // Usage
  async getUsage() {
    const response = await authFetch(`${API_BASE}/api/usage`)
    if (!response.ok) throw new Error('Konnte Nutzung nicht laden')
    return response.json()
  },

  // Conversations
  async listConversations() {
    const response = await authFetch(`${API_BASE}/api/conversations`)
    if (!response.ok) throw new Error('Konnte Konversationen nicht laden')
    return response.json()
  },

  async createConversation(title = 'New Conversation', assistantId = null) {
    const payload = { title }
    if (assistantId) payload.assistant_id = assistantId
    const response = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error('Konnte Konversation nicht erstellen')
    return response.json()
  },

  async getConversation(id) {
    const response = await authFetch(`${API_BASE}/api/conversations/${id}`)
    if (!response.ok) throw new Error('Konnte Konversation nicht laden')
    return response.json()
  },

  async updateConversation(id, updates) {
    const response = await authFetch(`${API_BASE}/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!response.ok) throw new Error('Konnte Konversation nicht aktualisieren')
    return response.json()
  },

  async deleteConversation(id) {
    const response = await authFetch(`${API_BASE}/api/conversations/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Konversation nicht löschen')
    return response.json()
  },

  async listModels() {
    const response = await fetch(`${API_BASE}/api/models`)
    if (!response.ok) throw new Error('Konnte Modelle nicht laden')
    return response.json()
  },

  async sendMessage(id, content, model, temperature, imageMode = 'auto') {
    const response = await authFetch(`${API_BASE}/api/conversations/${id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, model, temperature, image_mode: imageMode, stream: false }),
    })
    if (!response.ok) throw new Error('Konnte Nachricht nicht senden')
    return response.json()
  },

  // Assistants
  async listAssistants() {
    const response = await authFetch(`${API_BASE}/api/assistants`)
    if (!response.ok) throw new Error('Konnte Assistenten nicht laden')
    return response.json()
  },

  async createAssistant(data) {
    const response = await authFetch(`${API_BASE}/api/assistants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Assistenten nicht erstellen'))
    }
    return response.json()
  },

  async updateAssistant(id, data) {
    const response = await authFetch(`${API_BASE}/api/assistants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error('Konnte Assistenten nicht aktualisieren')
    return response.json()
  },

  async deleteAssistant(id) {
    const response = await authFetch(`${API_BASE}/api/assistants/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Assistenten nicht löschen')
    return response.json()
  },

  // Templates
  async listTemplates() {
    const response = await authFetch(`${API_BASE}/api/templates`)
    if (!response.ok) throw new Error('Konnte Templates nicht laden')
    return response.json()
  },

  async createTemplate(data) {
    const response = await authFetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Template nicht erstellen'))
    }
    return response.json()
  },

  async updateTemplate(id, data) {
    const response = await authFetch(`${API_BASE}/api/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error('Konnte Template nicht aktualisieren')
    return response.json()
  },

  async deleteTemplate(id) {
    const response = await authFetch(`${API_BASE}/api/templates/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Template nicht löschen')
    return response.json()
  },

  // Admin
  async adminListUsers() {
    const response = await authFetch(`${API_BASE}/api/admin/users`)
    if (!response.ok) throw new Error('Konnte Benutzer nicht laden')
    return response.json()
  },

  async adminUpdateUser(userId, data) {
    const response = await authFetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Benutzer nicht aktualisieren'))
    }
    return response.json()
  },

  async adminDeleteUser(userId) {
    const response = await authFetch(`${API_BASE}/api/admin/users/${userId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Benutzer nicht löschen'))
    }
    return response.json()
  },

  async adminGetUsage(startDate, endDate) {
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    const query = params.toString()
    const response = await authFetch(`${API_BASE}/api/admin/usage${query ? '?' + query : ''}`)
    if (!response.ok) throw new Error('Konnte Nutzungsdaten nicht laden')
    return response.json()
  },

  async adminGetStats() {
    const response = await authFetch(`${API_BASE}/api/admin/stats`)
    if (!response.ok) throw new Error('Konnte Statistiken nicht laden')
    return response.json()
  },

  async adminGetRagSettings() {
    const response = await authFetch(`${API_BASE}/api/admin/rag-settings`)
    if (!response.ok) throw new Error('Konnte RAG-Einstellungen nicht laden')
    return response.json()
  },

  async adminUpdateRagSettings(data) {
    const response = await authFetch(`${API_BASE}/api/admin/rag-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte RAG-Einstellungen nicht speichern'))
    }
    return response.json()
  },

  async adminRechunkDocuments() {
    const response = await authFetch(`${API_BASE}/api/admin/rechunk-documents`, { method: 'POST' })
    if (response.status === 409) throw new Error('Re-Chunking läuft bereits')
    if (!response.ok) throw new Error('Re-Chunking konnte nicht gestartet werden')
    return response.json()
  },

  async adminGetRechunkStatus() {
    const response = await authFetch(`${API_BASE}/api/admin/rechunk-status`)
    if (!response.ok) throw new Error('Status konnte nicht abgerufen werden')
    return response.json()
  },

  async adminListModels() {
    const response = await authFetch(`${API_BASE}/api/admin/models`)
    if (!response.ok) throw new Error('Konnte Modell-Konfigurationen nicht laden')
    return response.json()
  },

  async adminCreateModel(data) {
    const response = await authFetch(`${API_BASE}/api/admin/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Modell nicht erstellen'))
    }
    return response.json()
  },

  async adminUpdateModel(id, data) {
    const response = await authFetch(`${API_BASE}/api/admin/models/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error('Konnte Modell nicht aktualisieren')
    return response.json()
  },

  async adminDeleteModel(id) {
    const response = await authFetch(`${API_BASE}/api/admin/models/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Modell nicht löschen')
    return response.json()
  },

  async adminListProviderModels(provider) {
    const response = await authFetch(`${API_BASE}/api/admin/providers/${provider}/models`)
    if (!response.ok) throw new Error('Konnte Modelle nicht laden')
    return response.json()
  },

  // Provider Keys
  async adminListProviders() {
    const response = await authFetch(`${API_BASE}/api/admin/providers`)
    if (!response.ok) throw new Error('Konnte Provider nicht laden')
    return response.json()
  },

  async adminSetProviderKey(provider, apiKey, { endpoint_url, api_version } = {}) {
    const body = { api_key: apiKey }
    if (endpoint_url) body.endpoint_url = endpoint_url
    if (api_version) body.api_version = api_version
    const response = await authFetch(`${API_BASE}/api/admin/providers/${provider}/key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Key nicht speichern'))
    }
    return response.json()
  },

  async adminDeleteProviderKey(provider) {
    const response = await authFetch(`${API_BASE}/api/admin/providers/${provider}/key`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Key nicht löschen')
    return response.json()
  },

  async adminTestProvider(provider) {
    const response = await authFetch(`${API_BASE}/api/admin/providers/${provider}/test`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error('Test fehlgeschlagen')
    return response.json()
  },

  async adminGetAuditLogs(limit = 100, offset = 0, action = null, userId = null) {
    let url = `${API_BASE}/api/admin/audit-logs?limit=${limit}&offset=${offset}`
    if (action) url += `&action=${encodeURIComponent(action)}`
    if (userId) url += `&user_id=${encodeURIComponent(userId)}`
    const response = await authFetch(url)
    if (!response.ok) throw new Error('Konnte Audit-Logs nicht laden')
    return response.json()
  },

  // Documents / RAG
  async uploadDocument(file, chatId = null, onProgress = null) {
    const formData = new FormData()
    formData.append('file', file)
    if (chatId) formData.append('chat_id', chatId)
    return uploadWithXhr(`${API_BASE}/api/documents/upload`, formData, onProgress)
  },

  async listDocuments(chatId = null, scope = 'all') {
    let url = `${API_BASE}/api/documents?scope=${scope}`
    if (chatId) url += `&chat_id=${chatId}`
    const response = await authFetch(url)
    if (!response.ok) throw new Error('Konnte Dokumente nicht laden')
    return response.json()
  },

  async deleteDocument(docId) {
    const response = await authFetch(`${API_BASE}/api/documents/${docId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Dokument nicht löschen')
    return response.json()
  },

  // ── Pools ──
  async listPools() {
    const response = await authFetch(`${API_BASE}/api/pools`)
    if (!response.ok) throw new Error('Konnte Pools nicht laden')
    return response.json()
  },

  async createPool(data) {
    const response = await authFetch(`${API_BASE}/api/pools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Pool nicht erstellen'))
    }
    return response.json()
  },

  async getPool(poolId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}`)
    if (!response.ok) throw new Error('Konnte Pool nicht laden')
    return response.json()
  },

  async updatePool(poolId, data) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error('Konnte Pool nicht aktualisieren')
    return response.json()
  },

  async deletePool(poolId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Pool nicht löschen')
    return response.json()
  },

  // Pool Members
  async listPoolMembers(poolId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/members`)
    if (!response.ok) throw new Error('Konnte Mitglieder nicht laden')
    return response.json()
  },

  async addPoolMember(poolId, username, role) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Mitglied nicht hinzufügen'))
    }
    return response.json()
  },

  async updatePoolMember(poolId, userId, role) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!response.ok) throw new Error('Konnte Rolle nicht ändern')
    return response.json()
  },

  async removePoolMember(poolId, userId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/members/${userId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Mitglied nicht entfernen'))
    }
    return response.json()
  },

  // Pool Invites
  async listPoolInvites(poolId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/invites`)
    if (!response.ok) throw new Error('Konnte Einladungen nicht laden')
    return response.json()
  },

  async createPoolInvite(poolId, role, maxUses = null, expiresAt = null) {
    const body = { role }
    if (maxUses !== null) body.max_uses = maxUses
    if (expiresAt !== null) body.expires_at = expiresAt
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error('Konnte Einladung nicht erstellen')
    return response.json()
  },

  async revokePoolInvite(poolId, inviteId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/invites/${inviteId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Einladung nicht widerrufen')
    return response.json()
  },

  async joinPool(token) {
    const response = await authFetch(`${API_BASE}/api/pools/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Pool nicht beitreten'))
    }
    return response.json()
  },

  // Pool Documents
  async listPoolDocuments(poolId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/documents`)
    if (!response.ok) throw new Error('Konnte Dokumente nicht laden')
    return response.json()
  },

  async getPoolDocumentPreview(poolId, documentId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/documents/${documentId}/preview`)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Konnte Vorschau nicht laden'))
    }
    return response.json()
  },

  async uploadPoolDocument(poolId, file, onProgress = null) {
    const formData = new FormData()
    formData.append('file', file)
    return uploadWithXhr(`${API_BASE}/api/pools/${poolId}/documents/upload`, formData, onProgress)
  },

  async uploadPoolText(poolId, title, content) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/documents/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(extractDetail(err, 'Text konnte nicht gespeichert werden'))
    }
    return response.json()
  },

  async deletePoolDocument(poolId, documentId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/documents/${documentId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Dokument nicht löschen')
    return response.json()
  },

  // Pool Chats
  async listPoolChats(poolId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/chats`)
    if (!response.ok) throw new Error('Konnte Chats nicht laden')
    return response.json()
  },

  async createPoolChat(poolId, data) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error('Konnte Chat nicht erstellen')
    return response.json()
  },

  async getPoolChat(poolId, chatId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/chats/${chatId}`)
    if (!response.ok) throw new Error('Konnte Chat nicht laden')
    return response.json()
  },

  async sendPoolMessage(poolId, chatId, content, model, temperature, imageMode = 'auto') {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/chats/${chatId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, model, temperature, image_mode: imageMode, stream: false }),
    })
    if (!response.ok) throw new Error('Konnte Nachricht nicht senden')
    return response.json()
  },

  async sendPoolMessageStream(poolId, chatId, content, model, temperature, imageMode, onDelta, onDone, onError) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/chats/${chatId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, model, temperature, image_mode: imageMode || 'auto', stream: true }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || 'Konnte Nachricht nicht senden')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.error) {
            onError(typeof data.error === 'string' ? data.error : (data.error?.message || data.error?.detail || 'Serverfehler'))
            return
          }
          if (data.delta) {
            onDelta(data.delta)
          }
          if (data.done) {
            await onDone(data.content, data.sources || [], data.image_sources || [])
            return
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  },

  async deletePoolChat(poolId, chatId) {
    const response = await authFetch(`${API_BASE}/api/pools/${poolId}/chats/${chatId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw new Error('Konnte Chat nicht löschen')
    return response.json()
  },

  // Streaming (existing)
  async sendMessageStream(id, content, model, temperature, imageMode, onDelta, onDone, onError) {
    const response = await authFetch(`${API_BASE}/api/conversations/${id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, model, temperature, image_mode: imageMode || 'auto', stream: true }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || 'Konnte Nachricht nicht senden')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.error) {
            onError(typeof data.error === 'string' ? data.error : (data.error?.message || data.error?.detail || 'Serverfehler'))
            return
          }
          if (data.delta) {
            onDelta(data.delta)
          }
          if (data.done) {
            await onDone(data.content, data.sources || [], data.image_sources || [])
            return
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  },
}
