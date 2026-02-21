import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchAPI } from '../api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const PERIODS = [
  { key: '1h', label: '1 час' },
  { key: '6h', label: '6 часов' },
  { key: '24h', label: '24 часа' },
]

/* ── SVG Circular gauge ── */
function Gauge({ value, max = 100, label, detail, color }) {
  const pct = Math.min((value / max) * 100, 100)
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div style={{ textAlign: 'center', flex: '1 1 0' }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none"
          stroke="var(--border)" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)' }} />
        <text x="70" y="62" textAnchor="middle" fill="var(--text)"
          fontSize="26" fontWeight="800" fontFamily="var(--font)">
          {Math.round(pct)}%
        </text>
        <text x="70" y="82" textAnchor="middle" fill="var(--text-dim)"
          fontSize="11" fontFamily="var(--mono)">
          {detail}
        </text>
      </svg>
      <div style={{
        marginTop: 8, fontSize: 12, fontWeight: 700,
        color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.8px',
      }}>
        {label}
      </div>
    </div>
  )
}

/* ── Custom dark tooltip ── */
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)', padding: '10px 14px',
      fontFamily: 'var(--mono)', fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
    }}>
      <div style={{ color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  )
}

/* ── Chart wrapper ── */
function MetricChart({ data, dataKey, name, color, yFormatter, title }) {
  const gradientId = `grad_${dataKey}`
  return (
    <div className="card" style={{ padding: '20px 20px 12px', marginBottom: 16 }}>
      <h3 style={{
        fontSize: 13, fontWeight: 700, color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 16,
      }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11}
            fontFamily="var(--mono)" tickLine={false} />
          <YAxis stroke="var(--text-muted)" fontSize={11}
            fontFamily="var(--mono)" tickLine={false}
            tickFormatter={yFormatter} />
          <Tooltip content={<DarkTooltip />} />
          <Area type="monotone" dataKey={dataKey} name={name}
            stroke={color} fill={`url(#${gradientId})`}
            strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Analytics() {
  const [system, setSystem] = useState(null)
  const [servers, setServers] = useState([])
  const [history, setHistory] = useState([])
  const [period, setPeriod] = useState('1h')
  const [loading, setLoading] = useState(true)

  const loadCurrent = async () => {
    try {
      const [sys, svrs] = await Promise.all([
        fetchAPI('/api/analytics/system'),
        fetchAPI('/api/analytics/servers'),
      ])
      setSystem(sys)
      setServers(svrs)
    } catch (err) {
      console.error('Failed to load current metrics:', err)
    }
  }

  const loadHistory = async (p) => {
    try {
      const data = await fetchAPI(`/api/analytics/history?period=${p}`)
      setHistory(data.map(row => ({
        ...row,
        time: new Date(row.timestamp * 1000).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit',
        }),
      })))
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  useEffect(() => {
    Promise.all([loadCurrent(), loadHistory(period)])
      .finally(() => setLoading(false))
    const iv = setInterval(loadCurrent, 30000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => { loadHistory(period) }, [period])

  if (loading) {
    return <div className="loading"><span className="spinner" />Загрузка аналитики...</div>
  }

  const fmtUptime = (s) => {
    if (s < 60) return `${s}с`
    if (s < 3600) return `${Math.floor(s / 60)}м`
    return `${Math.floor(s / 3600)}ч ${Math.floor((s % 3600) / 60)}м`
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Аналитика</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          Системные ресурсы и производительность серверов
        </p>
      </div>

      {/* System gauges */}
      {system && (
        <div className="card analytics-gauges" style={{
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          padding: '32px 24px', marginBottom: 24, gap: 16,
        }}>
          <Gauge value={system.cpu_percent} max={100}
            label="CPU" detail={`${system.cpu_percent.toFixed(1)}%`}
            color="var(--accent)" />
          <Gauge
            value={system.ram_used_mb / 1024}
            max={system.ram_total_mb / 1024}
            label="Память"
            detail={`${(system.ram_used_mb / 1024).toFixed(1)} / ${(system.ram_total_mb / 1024).toFixed(1)} GB`}
            color="var(--blue)" />
          <Gauge
            value={system.disk_used_gb}
            max={system.disk_total_gb}
            label="Диск"
            detail={`${system.disk_used_gb.toFixed(1)} / ${system.disk_total_gb.toFixed(1)} GB`}
            color="var(--orange)" />
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {PERIODS.map(p => (
          <button key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`btn btn-sm ${p.key === period ? 'btn-primary' : 'btn-secondary'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* CPU History */}
      <MetricChart
        data={history} dataKey="cpu_percent" name="CPU %"
        color="#6c5ce7" title="Загрузка CPU"
        yFormatter={v => `${v}%`} />

      {/* RAM History */}
      <MetricChart
        data={history} dataKey="ram_used_mb" name="RAM (MB)"
        color="#4facfe" title="Использование памяти"
        yFormatter={v => `${Math.round(v)} MB`} />

      {/* Disk History */}
      <MetricChart
        data={history} dataKey="disk_percent" name="Disk %"
        color="#ffa348" title="Использование диска"
        yFormatter={v => `${v}%`} />

      {/* Per-Server breakdown */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>
          Ресурсы серверов
        </h2>
        {servers.length === 0 ? (
          <div className="card" style={{
            padding: 40, textAlign: 'center', color: 'var(--text-muted)',
          }}>
            Нет запущенных серверов для отображения метрик
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {servers.map(s => (
              <Link key={s.server_id} to={`/servers/${s.server_id}`}
                className="card" style={{
                  textDecoration: 'none', color: 'inherit',
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 120px 100px',
                  alignItems: 'center', gap: 16, padding: '16px 20px',
                }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)',
                    fontFamily: 'var(--mono)',
                  }}>
                    {s.jar_type} · :{s.port}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    fontFamily: 'var(--mono)', color: 'var(--accent)',
                  }}>
                    {s.cpu_percent.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>CPU</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 20, fontWeight: 800,
                    fontFamily: 'var(--mono)', color: 'var(--blue)',
                  }}>
                    {Math.round(s.ram_used_mb)} MB
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RAM</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 14, fontFamily: 'var(--mono)',
                    color: 'var(--text-dim)',
                  }}>
                    {fmtUptime(s.uptime)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Uptime</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
