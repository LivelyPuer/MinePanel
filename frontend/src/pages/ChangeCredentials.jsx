import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { changeCredentials } from '../api'

export default function ChangeCredentials() {
  const { updateUser } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newUsername.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const data = await changeCredentials(currentPassword, newUsername, newPassword)
      updateUser(data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const isValid = currentPassword && newUsername && newPassword && confirmPassword

  return (
    <div className="auth-page">
      <div className="auth-container" style={{ maxWidth: 440 }}>
        <div className="auth-header">
          <img src="/logo.png" alt="MinePanel" className="auth-logo" />
          <h1 className="auth-title" style={{ fontSize: 24 }}>Change Your Credentials</h1>
          <p className="auth-subtitle" style={{ lineHeight: 1.6 }}>
            You are using default credentials. For security, please set a new
            username and password before continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card auth-form">
          <div className="form-group">
            <label>Current Password</label>
            <input
              className="form-input"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
              autoFocus
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          <div className="form-group">
            <label>New Username</label>
            <input
              className="form-input"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              placeholder="Choose a new username"
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input
              className="form-input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              className="form-input"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || !isValid}
          >
            {loading ? 'Saving...' : 'Save New Credentials'}
          </button>
        </form>
      </div>
    </div>
  )
}
