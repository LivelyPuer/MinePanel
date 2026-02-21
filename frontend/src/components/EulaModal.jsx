import { useState, useEffect } from 'react'

export default function EulaModal({ open, onAccept, onCancel }) {
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (open) setAccepted(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Minecraft EULA</h2>
        <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 16 }}>
          To create a Minecraft server, you must accept the Minecraft End User License Agreement.
        </p>
        <a
          href="https://aka.ms/MinecraftEULA"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            color: 'var(--accent)',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 20,
            textDecoration: 'underline',
          }}
        >
          Read the Minecraft EULA
        </a>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          padding: '12px 16px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 24,
        }}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={e => setAccepted(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 14, color: 'var(--text)' }}>
            I have read and agree to the Minecraft EULA
          </span>
        </label>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-success"
            disabled={!accepted}
            onClick={onAccept}
            style={{ opacity: accepted ? 1 : 0.5 }}
          >
            Accept & Create
          </button>
        </div>
      </div>
    </div>
  )
}
