const API_BASE = ''

export async function fetchAPI(path) {
  const res = await fetch(`${API_BASE}${path}`)
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function postAPI(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function patchAPI(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function putAPI(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export async function deleteAPI(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
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
  })
  const json = await res.json()
  if (json.status === 'ok') return json.data
  throw new Error(json.message || 'API error')
}

export function wsURL(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
