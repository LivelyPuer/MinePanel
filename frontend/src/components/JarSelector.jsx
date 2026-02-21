import { useState, useEffect } from 'react'
import { fetchAPI } from '../api'

const TYPE_ICONS = {
  paper: '📄', purpur: '🟣', spigot: '🔶', folia: '🍃',
  fabric: '🧵', forge: '🔨', neoforge: '⚒️', mohist: '🔀',
  velocity: '💨', waterfall: '💧', bungeecord: '🔗',
  vanilla: '🧱', snapshot: '📸', pufferfish: '🐡', leaves: '🍂', sponge: '🧽',
}

const CAT_COLORS = {
  vanilla: { bg: 'var(--blue-dim)', color: 'var(--blue)' },
  servers: { bg: 'var(--green-dim)', color: 'var(--green)' },
  modded: { bg: 'var(--orange-dim)', color: 'var(--orange)' },
  proxies: { bg: 'var(--red-dim)', color: 'var(--red)' },
}

export default function JarSelector({ onSelect, selected }) {
  const [types, setTypes] = useState({})
  const [versions, setVersions] = useState([])
  const [selectedType, setSelectedType] = useState(selected?.jar_type || '')
  const [selectedVersion, setSelectedVersion] = useState(selected?.jar_version || '')
  const [loading, setLoading] = useState(true)
  const [loadingVersions, setLoadingVersions] = useState(false)

  useEffect(() => {
    fetchAPI('/api/jars/types').then(setTypes).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedType) return
    setLoadingVersions(true)
    setVersions([])
    fetchAPI(`/api/jars/versions/${selectedType}`)
      .then(v => {
        setVersions(v || [])
        if (v && v.length > 0 && !selectedVersion) {
          setSelectedVersion(v[0].version)
          onSelect({ jar_type: selectedType, jar_version: v[0].version })
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVersions(false))
  }, [selectedType])

  const handleTypeClick = (type) => {
    setSelectedType(type)
    setSelectedVersion('')
    onSelect({ jar_type: type, jar_version: '' })
  }

  const handleVersionChange = (version) => {
    setSelectedVersion(version)
    onSelect({ jar_type: selectedType, jar_version: version })
  }

  if (loading) return <div className="loading"><span className="spinner" />Loading server types...</div>

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Server Type
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {Object.entries(types).map(([cat, names]) =>
            names.map(name => {
              const colors = CAT_COLORS[cat] || CAT_COLORS.servers
              const isActive = name === selectedType
              return (
                <button
                  key={name}
                  onClick={() => handleTypeClick(name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    background: isActive ? colors.bg : 'var(--bg-input)',
                    border: `1px solid ${isActive ? colors.color : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    color: isActive ? colors.color : 'var(--text-dim)',
                    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14,
                    fontWeight: isActive ? 700 : 500,
                    transition: 'all 0.15s', textTransform: 'capitalize',
                  }}
                >
                  <span>{TYPE_ICONS[name] || '📦'}</span>
                  {name}
                </button>
              )
            })
          )}
        </div>
      </div>

      {selectedType && (
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Version
          </label>
          {loadingVersions ? (
            <div className="loading"><span className="spinner" />Loading versions...</div>
          ) : (
            <select
              className="form-input"
              value={selectedVersion}
              onChange={e => handleVersionChange(e.target.value)}
            >
              <option value="">Select version...</option>
              {versions.map(v => (
                <option key={v.version} value={v.version}>{v.version}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}
