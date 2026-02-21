import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import CreateServer from './pages/CreateServer'
import ServerDetail from './pages/ServerDetail'
import Analytics from './pages/Analytics'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="nav-logo">
            <img src="/logo.png" alt="MinePanel" className="nav-logo-img" />
            <span className="nav-title">MinePanel</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to="/analytics" className="btn btn-accent-outline btn-sm">Analytics</Link>
            <Link to="/create" className="btn btn-primary">+ New Server</Link>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/create" element={<CreateServer />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/servers/:id" element={<ServerDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
