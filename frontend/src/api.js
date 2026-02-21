const API_BASE = ''

function handle401(res) {
  if (res.status === 401) {
    window.location.href = '/'
    throw new Error('Session expired')
  }
  return res
}

export async function fetchAPI(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
  })
  handle401(res)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function postAPI(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  handle401(res)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function patchAPI(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  handle401(res)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function putAPI(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  handle401(res)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function deleteAPI(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  handle401(res)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function uploadFile(path, file, destPath = '.') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('path', destPath)
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  handle401(res)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

// ─── Auth API ────────────────────────────────────────────────────────────

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'Login failed')
}

export async function logout() {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'Logout failed')
}

export async function getAuthMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    credentials: 'include',
  })
  if (res.status === 401) return null
  const json = await res.json()
  if (json.status === 'ok') return json.data
  return null
}

export async function changeCredentials(currentPassword, username, password) {
  const res = await fetch(`${API_BASE}/api/auth/change-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, username, password }),
    credentials: 'include',
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'Failed to change credentials')
}

export async function getWsTicket() {
  return await fetchAPI('/api/auth/ws-ticket')
}

export function wsURL(path, ticket) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${window.location.host}${path}`
  if (ticket) return `${url}?ticket=${ticket}`
  return url
}
