import { useState, useEffect } from 'react'
import { fetchAPI, putAPI } from '../api'

const PROPERTY_SCHEMA = {
  // Booleans
  'pvp':                   { type: 'boolean', label: 'PvP', category: 'gameplay' },
  'online-mode':           { type: 'boolean', label: 'Online Mode', category: 'network' },
  'allow-flight':          { type: 'boolean', label: 'Allow Flight', category: 'gameplay' },
  'allow-nether':          { type: 'boolean', label: 'Allow Nether', category: 'gameplay' },
  'spawn-npcs':            { type: 'boolean', label: 'Spawn NPCs', category: 'gameplay' },
  'spawn-animals':         { type: 'boolean', label: 'Spawn Animals', category: 'gameplay' },
  'spawn-monsters':        { type: 'boolean', label: 'Spawn Monsters', category: 'gameplay' },
  'generate-structures':   { type: 'boolean', label: 'Generate Structures', category: 'world' },
  'enable-command-block':  { type: 'boolean', label: 'Command Blocks', category: 'gameplay' },
  'white-list':            { type: 'boolean', label: 'Whitelist', category: 'network' },
  'force-gamemode':        { type: 'boolean', label: 'Force Gamemode', category: 'gameplay' },
  'hardcore':              { type: 'boolean', label: 'Hardcore', category: 'gameplay' },
  'enable-status':         { type: 'boolean', label: 'Enable Status', category: 'network' },
  'hide-online-players':   { type: 'boolean', label: 'Hide Online Players', category: 'network' },

  // Numbers
  'max-players':           { type: 'number', label: 'Max Players', category: 'network', min: 1, max: 1000 },
  'view-distance':         { type: 'number', label: 'View Distance', category: 'performance', min: 2, max: 32 },
  'simulation-distance':   { type: 'number', label: 'Simulation Distance', category: 'performance', min: 2, max: 32 },
  'max-world-size':        { type: 'number', label: 'Max World Size', category: 'world', min: 1, max: 29999984 },
  'server-port':           { type: 'number', label: 'Server Port', category: 'network', min: 1, max: 65535 },
  'spawn-protection':      { type: 'number', label: 'Spawn Protection', category: 'gameplay', min: 0, max: 256 },
  'max-tick-time':         { type: 'number', label: 'Max Tick Time (ms)', category: 'performance', min: -1, max: 600000 },
  'entity-broadcast-range-percentage': { type: 'number', label: 'Entity Broadcast Range %', category: 'performance', min: 10, max: 1000 },
  'rate-limit':            { type: 'number', label: 'Rate Limit', category: 'network', min: 0, max: 1000 },
  'op-permission-level':   { type: 'number', label: 'OP Permission Level', category: 'gameplay', min: 1, max: 4 },

  // Enums
  'gamemode':              { type: 'enum', label: 'Game Mode', category: 'gameplay',
                             options: ['survival', 'creative', 'adventure', 'spectator'] },
  'difficulty':            { type: 'enum', label: 'Difficulty', category: 'gameplay',
                             options: ['peaceful', 'easy', 'normal', 'hard'] },
  'level-type':            { type: 'enum', label: 'Level Type', category: 'world',
                             options: ['minecraft\\:normal', 'minecraft\\:flat', 'minecraft\\:large_biomes', 'minecraft\\:amplified', 'minecraft\\:single_biome_surface'] },

  // Strings
  'motd':                  { type: 'string', label: 'MOTD', category: 'network' },
  'level-name':            { type: 'string', label: 'Level Name', category: 'world' },
  'level-seed':            { type: 'string', label: 'Level Seed', category: 'world' },
  'resource-pack':         { type: 'string', label: 'Resource Pack URL', category: 'network' },
  'resource-pack-sha1':    { type: 'string', label: 'Resource Pack SHA1', category: 'network' },
  'server-ip':             { type: 'string', label: 'Server IP (Bind)', category: 'network' },
}

const CATEGORIES = {
  gameplay: 'Gameplay',
  network: 'Network',
  world: 'World',
  performance: 'Performance',
}

function PropertyField({ propKey, value, schema, onChange }) {
  if (schema?.type === 'boolean') {
    return (
      <label className="config-field" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={e => onChange(propKey, e.target.checked ? 'true' : 'false')}
          style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
        />
        <span>{schema.label}</span>
      </label>
    )
  }

  if (schema?.type === 'enum') {
    return (
      <div className="config-field-block">
        <label>{schema.label}</label>
        <select
          className="form-input"
          value={value}
          onChange={e => onChange(propKey, e.target.value)}
        >
          {schema.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  if (schema?.type === 'number') {
    return (
      <div className="config-field-block">
        <label>{schema.label}</label>
        <input
          className="form-input"
          type="number"
          value={value}
          min={schema.min}
          max={schema.max}
          onChange={e => onChange(propKey, e.target.value)}
          style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
        />
      </div>
    )
  }

  // String or unknown
  return (
    <div className="config-field-block">
      <label>{schema?.label || propKey}</label>
      <input
        className="form-input"
        type="text"
        value={value}
        onChange={e => onChange(propKey, e.target.value)}
        style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
      />
    </div>
  )
}

export default function ConfigEditor({ serverId }) {
  const [properties, setProperties] = useState({})
  const [rawContent, setRawContent] = useState('')
  const [rawMode, setRawMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchAPI(`/api/servers/${serverId}/config`)
      .then(data => {
        setProperties(data.properties || {})
        setRawContent(data.raw || '')
      })
      .catch(() => setMessage('Failed to load config'))
      .finally(() => setLoading(false))
  }, [serverId])

  const handleChange = (key, value) => {
    setProperties(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleRawChange = (value) => {
    setRawContent(value)
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      if (rawMode) {
        // Parse raw content into properties
        const parsed = {}
        for (const line of rawContent.split('\n')) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...rest] = trimmed.split('=')
            parsed[key.trim()] = rest.join('=').trim()
          }
        }
        await putAPI(`/api/servers/${serverId}/config`, { properties: parsed })
      } else {
        await putAPI(`/api/servers/${serverId}/config`, { properties })
      }
      setDirty(false)
      setMessage('Config saved. Restart the server for changes to take effect.')
    } catch (err) {
      setMessage(err.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="loading"><span className="spinner" />Loading config...</div>

  // Group properties by category
  const grouped = {}
  const other = {}

  for (const [key, value] of Object.entries(properties)) {
    const schema = PROPERTY_SCHEMA[key]
    if (schema) {
      const cat = schema.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push({ key, value, schema })
    } else {
      other[key] = value
    }
  }

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button
          className={`btn btn-sm ${!rawMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setRawMode(false)}
        >
          Structured
        </button>
        <button
          className={`btn btn-sm ${rawMode ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setRawMode(true)}
        >
          Raw
        </button>
      </div>

      {rawMode ? (
        <textarea
          className="config-raw-editor"
          value={rawContent}
          onChange={e => handleRawChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div>
          {Object.entries(CATEGORIES).map(([catKey, catLabel]) => {
            const fields = grouped[catKey]
            if (!fields || fields.length === 0) return null
            return (
              <div key={catKey} className="config-section">
                <h3 className="config-section-header">{catLabel}</h3>
                <div className="config-section-body">
                  {fields.map(({ key, value, schema }) => (
                    <PropertyField
                      key={key}
                      propKey={key}
                      value={value}
                      schema={schema}
                      onChange={handleChange}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {Object.keys(other).length > 0 && (
            <div className="config-section">
              <h3 className="config-section-header">Other</h3>
              <div className="config-section-body">
                {Object.entries(other).map(([key, value]) => (
                  <PropertyField
                    key={key}
                    propKey={key}
                    value={value}
                    schema={null}
                    onChange={handleChange}
                  />
                ))}
              </div>
            </div>
          )}

          {Object.keys(properties).length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
              No server.properties found. Start the server once to generate the config.
            </p>
          )}
        </div>
      )}

      {message && (
        <div style={{
          padding: '10px 14px',
          background: message.includes('saved') ? 'var(--green-dim)' : 'var(--red-dim)',
          color: message.includes('saved') ? 'var(--green)' : 'var(--red)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 13,
          marginTop: 16,
        }}>
          {message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{ opacity: dirty ? 1 : 0.5 }}
        >
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>
    </div>
  )
}
