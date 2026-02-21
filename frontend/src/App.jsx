import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Dashboard from './pages/Dashboard'
import CreateServer from './pages/CreateServer'
import ServerDetail from './pages/ServerDetail'
import Analytics from './pages/Analytics'
import Login from './pages/Login'
import ChangeCredentials from './pages/ChangeCredentials'
import './App.css'

function AppRoutes() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="auth-page">
        <div className="loading">
          <span className="spinner" />Loading...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (user.must_change_password) {
    return <ChangeCredentials />
  }

  return (
    <div className="app">
      <nav className="navbar">
        <Link to="/" className="nav-logo">
          <img src="/logo.png" alt="MinePanel" className="nav-logo-img" />
          <span className="nav-title">MinePanel</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/analytics" className="btn btn-accent-outline btn-sm">Analytics</Link>
          <Link to="/create" className="btn btn-primary">+ New Server</Link>
          <div className="nav-links">
            <a href="https://github.com/livelypuer/minepanel" target="_blank" rel="noopener noreferrer" className="nav-icon-link" title="GitHub">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
            <a href="https://hub.docker.com/u/livelypuer" target="_blank" rel="noopener noreferrer" className="nav-icon-link" title="Docker Hub">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.187.186v1.887c0 .103.084.185.187.185zm-2.954-5.43h2.118a.186.186 0 00.187-.185V3.576a.186.186 0 00-.187-.186h-2.118a.186.186 0 00-.187.186v1.887c0 .102.084.185.187.185zm0 2.716h2.118a.187.187 0 00.187-.186V6.29a.187.187 0 00-.187-.186h-2.118a.187.187 0 00-.187.186v1.887c0 .103.084.186.187.186zm-2.93 0h2.12a.186.186 0 00.186-.186V6.29a.186.186 0 00-.186-.186H8.1a.186.186 0 00-.185.186v1.887c0 .103.083.186.185.186zm-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.186.186 0 00-.185-.186H5.136a.186.186 0 00-.186.186v1.887c0 .103.084.186.186.186zm5.893 2.715h2.118a.186.186 0 00.187-.185V9.006a.186.186 0 00-.187-.186h-2.118a.187.187 0 00-.187.186v1.887c0 .103.084.185.187.185zm-2.93 0h2.12a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H8.1a.185.185 0 00-.185.186v1.887c0 .103.083.185.185.185zm-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H5.136a.185.185 0 00-.186.186v1.887c0 .103.084.185.186.185zm-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .103.083.185.184.185zm10.202 2.66c-.243 0-.453.168-.523.4-.14.467-.453 1.09-1.187 1.455-.217.107-.383.252-.475.395-.092.143-.113.283-.067.407.046.124.165.223.35.223h4.627c.184 0 .304-.1.35-.223.046-.124.025-.264-.067-.407-.092-.143-.258-.288-.475-.395-.734-.365-1.047-.988-1.187-1.455-.07-.232-.28-.4-.523-.4h-.823zM24 11.325c0-2.197-1.508-3.407-3.412-4.05a5.37 5.37 0 00-.127-1.162c-.388-1.554-1.605-2.786-3.235-2.786-.414 0-.81.084-1.173.227C15.09 1.49 13.24 0 11.12 0 8.762 0 6.77 1.89 6.77 4.375c0 .163.008.324.024.482C4.142 5.463 2.3 7.29 2.3 9.773c0 .367.042.728.123 1.078C.953 11.67 0 13.044 0 14.625c0 2.367 1.758 4.326 4.03 4.607.08.606.293 1.186.622 1.686.72 1.09 1.974 1.8 3.373 1.8h7.94c1.4 0 2.654-.71 3.374-1.8.33-.5.543-1.08.622-1.686C22.242 18.95 24 16.99 24 14.625c0-1.12-.37-2.157-1-2.988.003-.104.006-.208.006-.312h-.006z"/></svg>
            </a>
            <button
              onClick={logout}
              className="nav-icon-link"
              title="Logout"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/create" element={<CreateServer />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/servers/:id" element={<ServerDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
