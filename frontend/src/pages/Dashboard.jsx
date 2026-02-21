import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchAPI } from '../api'
import ServerCard from '../components/ServerCard'

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{
      width: '100%', height: 6, borderRadius: 3,
      background: 'var(--border)', overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', borderRadius: 3, background: color,
        width: `${pct}%`, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
      }} />
    </div>
  )
}

export default function Dashboard() {
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [system, setSystem] = useState(null)

  const load = () => {
    fetchAPI('/api/servers')
      .then(setServers)
      .catch(() => setServers([]))
      .finally(() => setLoading(false))
  }

  const loadSystem = () => {
    fetchAPI('/api/analytics/system')
      .then(setSystem)
      .catch(() => {})
  }

  useEffect(() => {
    load()
    loadSystem()
    const iv1 = setInterval(load, 3000)
    const iv2 = setInterval(loadSystem, 10000)
    return () => { clearInterval(iv1); clearInterval(iv2) }
  }, [])

  const running = servers.filter(s => s.status === 'running').length

  return (
    <div>
      {/* Resource overview */}
      {system && (
        <div className="card resource-bar" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto',
          alignItems: 'center', gap: 24, padding: '18px 24px', marginBottom: 24,
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CPU</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{system.cpu_percent.toFixed(1)}%</span>
            </div>
            <MiniBar value={system.cpu_percent} max={100} color="var(--accent)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RAM</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{(system.ram_used_mb / 1024).toFixed(1)} / {(system.ram_total_mb / 1024).toFixed(1)} GB</span>
            </div>
            <MiniBar value={system.ram_used_mb} max={system.ram_total_mb} color="var(--blue)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Disk</span>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--orange)' }}>{system.disk_used_gb.toFixed(1)} / {system.disk_total_gb.toFixed(1)} GB</span>
            </div>
            <MiniBar value={system.disk_used_gb} max={system.disk_total_gb} color="var(--orange)" />
          </div>
          <Link to="/analytics" className="btn btn-accent-outline" style={{ whiteSpace: 'nowrap' }}>
            Analytics →
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Servers</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
            {servers.length} server{servers.length !== 1 ? 's' : ''} · {running} running
          </p>
        </div>
        <Link to="/create" className="btn btn-primary">+ New Server</Link>
      </div>

      {loading ? (
        <div className="loading"><span className="spinner" />Loading servers...</div>
      ) : servers.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
          <h2 style={{ marginBottom: 8 }}>No servers yet</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Create your first Minecraft server to get started.</p>
          <Link to="/create" className="btn btn-primary">Create Server</Link>
        </div>
      ) : (
        <div className="server-grid">
          {servers.map(s => (
            <ServerCard key={s.id} server={s} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  )
}
