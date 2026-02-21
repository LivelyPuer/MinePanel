import { useState, useEffect, useRef } from 'react'
import { fetchAPI, putAPI, postAPI, deleteAPI, uploadFile } from '../api'

const TEXT_EXTENSIONS = new Set([
  '.properties', '.txt', '.yml', '.yaml', '.json', '.cfg', '.conf',
  '.log', '.toml', '.ini', '.csv', '.md', '.sh', '.bat', '.xml',
  '.lang', '.mcmeta',
])

function isTextFile(name) {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return TEXT_EXTENSIONS.has(name.substring(dot).toLowerCase())
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString()
}

function FileIcon({ type, name }) {
  if (type === 'dir') return <span style={{ fontSize: 18 }}>&#128193;</span>
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.jar') return <span style={{ fontSize: 18 }}>&#9881;</span>
  if (ext === '.log') return <span style={{ fontSize: 18 }}>&#128196;</span>
  if (isTextFile(name)) return <span style={{ fontSize: 18 }}>&#128221;</span>
  return <span style={{ fontSize: 18 }}>&#128462;</span>
}

export default function FileManager({ serverId }) {
  const [currentPath, setCurrentPath] = useState('.')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { path, content }
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showMkdir, setShowMkdir] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)

  const loadDir = (path) => {
    setLoading(true)
    setMessage('')
    fetchAPI(`/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`)
      .then(data => { setEntries(data); setCurrentPath(path) })
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadDir('.') }, [serverId])

  const pathParts = currentPath === '.' ? [] : currentPath.split('/').filter(Boolean)

  const navigateTo = (path) => {
    setEditing(null)
    loadDir(path)
  }

  const openFile = async (name) => {
    const filePath = currentPath === '.' ? name : `${currentPath}/${name}`
    if (!isTextFile(name)) {
      setMessage('Binary file — cannot edit in browser')
      return
    }
    setMessage('')
    try {
      const data = await fetchAPI(`/api/servers/${serverId}/files/read?path=${encodeURIComponent(filePath)}`)
      setEditing({ path: filePath, name })
      setEditContent(data.content)
    } catch (err) {
      setMessage(err.message)
    }
  }

  const handleSaveFile = async () => {
    setSaving(true)
    try {
      await putAPI(`/api/servers/${serverId}/files/write`, {
        path: editing.path,
        content: editContent,
      })
      setMessage('File saved')
      setEditing(null)
      loadDir(currentPath)
    } catch (err) {
      setMessage(err.message)
    }
    setSaving(false)
  }

  const handleUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setMessage('')
    try {
      for (const file of files) {
        await uploadFile(
          `/api/servers/${serverId}/files/upload`,
          file,
          currentPath,
        )
      }
      setMessage(`Uploaded ${files.length} file(s)`)
      loadDir(currentPath)
    } catch (err) {
      setMessage(err.message)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleMkdir = async () => {
    if (!newDirName.trim()) return
    const dirPath = currentPath === '.' ? newDirName.trim() : `${currentPath}/${newDirName.trim()}`
    try {
      await postAPI(`/api/servers/${serverId}/files/mkdir`, { path: dirPath })
      setShowMkdir(false)
      setNewDirName('')
      loadDir(currentPath)
    } catch (err) {
      setMessage(err.message)
    }
  }

  const handleDelete = async (name, type) => {
    if (!confirm(`Delete ${type === 'dir' ? 'folder' : 'file'} "${name}"?`)) return
    const delPath = currentPath === '.' ? name : `${currentPath}/${name}`
    try {
      await deleteAPI(`/api/servers/${serverId}/files?path=${encodeURIComponent(delPath)}`)
      loadDir(currentPath)
    } catch (err) {
      setMessage(err.message)
    }
  }

  // File editor view
  if (editing) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>
            &#8592; Back
          </button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text-dim)' }}>
            {editing.path}
          </span>
        </div>
        <textarea
          className="config-raw-editor"
          value={editContent}
          onChange={e => setEditContent(e.target.value)}
          spellCheck={false}
          style={{ minHeight: 450 }}
        />
        {message && (
          <div style={{
            padding: '8px 12px', marginTop: 12, fontSize: 13, borderRadius: 'var(--radius-sm)',
            background: message.includes('saved') ? 'var(--green-dim)' : 'var(--red-dim)',
            color: message.includes('saved') ? 'var(--green)' : 'var(--red)',
          }}>
            {message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveFile} disabled={saving}>
            {saving ? 'Saving...' : 'Save File'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Breadcrumbs */}
      <div className="file-breadcrumbs">
        <button
          className="file-breadcrumb"
          onClick={() => navigateTo('.')}
          style={{ fontWeight: currentPath === '.' ? 700 : 400 }}
        >
          /
        </button>
        {pathParts.map((part, i) => {
          const path = pathParts.slice(0, i + 1).join('/')
          return (
            <span key={i}>
              <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
              <button
                className="file-breadcrumb"
                onClick={() => navigateTo(path)}
                style={{ fontWeight: i === pathParts.length - 1 ? 700 : 400 }}
              >
                {part}
              </button>
            </span>
          )
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => setShowMkdir(true)}>
          New Folder
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => loadDir(currentPath)}>
          Refresh
        </button>
      </div>

      {/* New folder input */}
      {showMkdir && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            value={newDirName}
            onChange={e => setNewDirName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleMkdir(); if (e.key === 'Escape') setShowMkdir(false) }}
            style={{ flex: 1, padding: '6px 12px', fontSize: 13 }}
          />
          <button className="btn btn-success btn-sm" onClick={handleMkdir}>Create</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowMkdir(false); setNewDirName('') }}>Cancel</button>
        </div>
      )}

      {message && (
        <div style={{
          padding: '8px 12px', marginBottom: 12, fontSize: 13, borderRadius: 'var(--radius-sm)',
          background: message.includes('saved') || message.includes('Uploaded') ? 'var(--green-dim)' : 'var(--red-dim)',
          color: message.includes('saved') || message.includes('Uploaded') ? 'var(--green)' : 'var(--red)',
        }}>
          {message}
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="loading"><span className="spinner" />Loading...</div>
      ) : (
        <div className="file-list">
          {/* Parent directory link */}
          {currentPath !== '.' && (
            <div
              className="file-row"
              onClick={() => {
                const parent = pathParts.slice(0, -1).join('/') || '.'
                navigateTo(parent)
              }}
            >
              <span style={{ fontSize: 18 }}>&#128193;</span>
              <span className="file-name" style={{ color: 'var(--text-dim)' }}>..</span>
              <span />
              <span />
              <span />
            </div>
          )}

          {entries.map(entry => (
            <div
              key={entry.name}
              className="file-row"
              onClick={() => {
                if (entry.type === 'dir') {
                  const next = currentPath === '.' ? entry.name : `${currentPath}/${entry.name}`
                  navigateTo(next)
                } else {
                  openFile(entry.name)
                }
              }}
            >
              <FileIcon type={entry.type} name={entry.name} />
              <span className="file-name">{entry.name}</span>
              <span className="file-size">{entry.type === 'file' ? formatBytes(entry.size) : ''}</span>
              <span className="file-date">{formatDate(entry.modified)}</span>
              <button
                className="btn btn-danger btn-sm file-delete-btn"
                onClick={e => { e.stopPropagation(); handleDelete(entry.name, entry.type) }}
                title="Delete"
              >
                &#10005;
              </button>
            </div>
          ))}

          {entries.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
              Empty directory
            </p>
          )}
        </div>
      )}
    </div>
  )
}
