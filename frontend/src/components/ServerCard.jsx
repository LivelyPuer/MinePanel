import { Link } from 'react-router-dom'
import { postAPI } from '../api'
import StatusBadge from './StatusBadge'

const TYPE_ICONS = {
  paper: '📄', purpur: '🟣', spigot: '🔶', folia: '🍃',
  fabric: '🧵', forge: '🔨', neoforge: '⚒️', mohist: '🔀',
  velocity: '💨', waterfall: '💧', bungeecord: '🔗',
  vanilla: '🧱', snapshot: '📸', pufferfish: '🐡', leaves: '🍂', sponge: '🧽',
}

export default function ServerCard({ server, onRefresh }) {
  const icon = TYPE_ICONS[server.jar_type] || '📦'

  const handleStart = async (e) => {
    e.preventDefault()
    try {
      await postAPI(`/api/servers/${server.id}/start`)
      onRefresh()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleStop = async (e) => {
    e.preventDefault()
    try {
      await postAPI(`/api/servers/${server.id}/stop`)
      onRefresh()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <Link to={`/servers/${server.id}`} className="card server-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: server.status === 'running' ? 'var(--green-dim)' : 'var(--bg-hover)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{server.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {server.jar_type} {server.jar_version} · :{server.port}
          </div>
        </div>
        <StatusBadge status={server.status} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {server.status !== 'running' ? (
          <button className="btn btn-success btn-sm" onClick={handleStart}>Start</button>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={handleStop}>Stop</button>
        )}
      </div>
    </Link>
  )
}
