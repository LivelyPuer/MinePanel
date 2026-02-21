import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchAPI, postAPI, patchAPI, deleteAPI } from '../api'
import StatusBadge from '../components/StatusBadge'
import Console from '../components/Console'
import ConfigEditor from '../components/ConfigEditor'
import FileManager from '../components/FileManager'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

export default function ServerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('console')
  const [settings, setSettings] = useState({})
  const [saving, setSaving] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [metricsHistory, setMetricsHistory] = useState([])
  const [metricsPeriod, setMetricsPeriod] = useState('1h')

  const load = () => {
    fetchAPI(`/api/servers/${id}`)
      .then(s => { setServer(s); setSettings({ name: s.name, min_ram: s.min_ram, max_ram: s.max_ram, jvm_args: s.jvm_args || '', auto_restart: !!s.auto_restart }) })
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [id])

  useEffect(() => {
    if (tab !== 'metrics') return
    const loadMetrics = async () => {
      try {
        const [current, hist] = await Promise.all([
          fetchAPI('/api/analytics/servers'),
          fetchAPI(`/api/analytics/servers/${id}/history?period=${metricsPeriod}`),
        ])
        setMetrics(current.find(s => s.server_id === id) || null)
        setMetricsHistory(hist.map(row => ({
          ...row,
          time: new Date(row.timestamp * 1000).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit',
          }),
        })))
      } catch (err) { console.error('Metrics load error:', err) }
    }
    loadMetrics()
    const iv = setInterval(loadMetrics, 30000)
    return () => clearInterval(iv)
  }, [tab, id, metricsPeriod])

  if (loading || !server) return <div className="loading"><span className="spinner" />Loading...</div>

  const handleStart = async () => {
    try { await postAPI(`/api/servers/${id}/start`); load() } catch (err) { alert(err.message) }
  }
  const handleStop = async () => {
    try { await postAPI(`/api/servers/${id}/stop`); load() } catch (err) { alert(err.message) }
  }
  const handleRestart = async () => {
    try { await postAPI(`/api/servers/${id}/restart`); load() } catch (err) { alert(err.message) }
  }
  const handleDelete = async () => {
    if (!confirm(`Delete server "${server.name}"? This cannot be undone.`)) return
    try { await deleteAPI(`/api/servers/${id}`); navigate('/') } catch (err) { alert(err.message) }
  }
  const handleSave = async () => {
    setSaving(true)
    try { await patchAPI(`/api/servers/${id}`, settings); load() } catch (err) { alert(err.message) }
    setSaving(false)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>{server.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {server.jar_type} {server.jar_version} · Port {server.port}
            {server.uptime != null && ` · Uptime ${Math.floor(server.uptime / 60)}m`}
          </div>
        </div>
        <StatusBadge status={server.status} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {server.status !== 'running' ? (
          <button className="btn btn-success btn-sm" onClick={handleStart}>Start</button>
        ) : (
          <>
            <button className="btn btn-danger btn-sm" onClick={handleStop}>Stop</button>
            <button className="btn btn-secondary btn-sm" onClick={handleRestart}>Restart</button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {['console', 'files', 'config', 'metrics', 'settings'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              background: 'none', border: 'none',
              borderBottom: t === tab ? '2px solid var(--accent)' : '2px solid transparent',
              color: t === tab ? 'var(--text)' : 'var(--text-muted)',
              fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', textTransform: 'capitalize',
              transition: 'all 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Console Tab */}
      {tab === 'console' && (
        <div className="card" style={{ padding: 16 }}>
          <Console serverId={id} />
        </div>
      )}

      {/* Files Tab */}
      {tab === 'files' && (
        <div className="card" style={{ padding: 16 }}>
          <FileManager serverId={id} />
        </div>
      )}

      {/* Config Tab */}
      {tab === 'config' && (
        <div className="card" style={{ padding: 16 }}>
          <ConfigEditor serverId={id} />
        </div>
      )}

      {/* Metrics Tab */}
      {tab === 'metrics' && (
        <div className="card" style={{ padding: 20 }}>
          {server.status !== 'running' ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Запустите сервер, чтобы увидеть метрики ресурсов
            </div>
          ) : (
            <>
              {metrics && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                  <div style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: 24, textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: 36, fontWeight: 800, fontFamily: 'var(--mono)',
                      color: 'var(--accent)',
                    }}>
                      {metrics.cpu_percent.toFixed(1)}%
                    </div>
                    <div style={{
                      fontSize: 12, color: 'var(--text-muted)', marginTop: 4,
                      textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700,
                    }}>
                      CPU
                    </div>
                  </div>
                  <div style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: 24, textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: 36, fontWeight: 800, fontFamily: 'var(--mono)',
                      color: 'var(--blue)',
                    }}>
                      {Math.round(metrics.ram_used_mb)} MB
                    </div>
                    <div style={{
                      fontSize: 12, color: 'var(--text-muted)', marginTop: 4,
                      textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700,
                    }}>
                      Память (RSS)
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {[{ key: '1h', label: '1 час' }, { key: '6h', label: '6 часов' }, { key: '24h', label: '24 часа' }].map(p => (
                  <button key={p.key}
                    onClick={() => setMetricsPeriod(p.key)}
                    className={`btn btn-sm ${p.key === metricsPeriod ? 'btn-primary' : 'btn-secondary'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <h4 style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12,
                }}>
                  История CPU
                </h4>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={metricsHistory}>
                    <defs>
                      <linearGradient id="svCpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11}
                      fontFamily="var(--mono)" tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11}
                      fontFamily="var(--mono)" tickLine={false}
                      tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--mono)', fontSize: 12,
                    }} />
                    <Area type="monotone" dataKey="cpu_percent" name="CPU %"
                      stroke="#6c5ce7" fill="url(#svCpuGrad)" strokeWidth={2}
                      dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h4 style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12,
                }}>
                  История памяти
                </h4>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={metricsHistory}>
                    <defs>
                      <linearGradient id="svRamGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4facfe" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4facfe" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11}
                      fontFamily="var(--mono)" tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11}
                      fontFamily="var(--mono)" tickLine={false}
                      tickFormatter={v => `${Math.round(v)} MB`} />
                    <Tooltip contentStyle={{
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--mono)', fontSize: 12,
                    }} />
                    <Area type="monotone" dataKey="ram_used_mb" name="RAM (MB)"
                      stroke="#4facfe" fill="url(#svRamGrad)" strokeWidth={2}
                      dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className="card">
          <div className="form-group">
            <label>Server Name</label>
            <input className="form-input" value={settings.name || ''} onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Min RAM</label>
              <select className="form-input" value={settings.min_ram} onChange={e => setSettings(prev => ({ ...prev, min_ram: e.target.value }))}>
                {['512M', '1G', '2G', '4G'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Max RAM</label>
              <select className="form-input" value={settings.max_ram} onChange={e => setSettings(prev => ({ ...prev, max_ram: e.target.value }))}>
                {['1G', '2G', '4G', '6G', '8G', '12G', '16G'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>JVM Arguments</label>
            <input
              className="form-input"
              value={settings.jvm_args}
              onChange={e => setSettings(prev => ({ ...prev, jvm_args: e.target.value }))}
              placeholder="-XX:+UseG1GC"
              style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={settings.auto_restart}
                onChange={e => setSettings(prev => ({ ...prev, auto_restart: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Auto-restart on crash</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 24 }}>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete Server</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
