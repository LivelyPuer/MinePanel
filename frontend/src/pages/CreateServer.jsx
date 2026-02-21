import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postAPI } from '../api'
import JarSelector from '../components/JarSelector'
import EulaModal from '../components/EulaModal'

const STEPS = ['Name & Port', 'Server Type', 'Settings', 'Confirm']

export default function CreateServer() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showEula, setShowEula] = useState(false)

  const [form, setForm] = useState({
    name: '',
    port: '',
    jar_type: '',
    jar_version: '',
    min_ram: '1G',
    max_ram: '2G',
    jvm_args: '',
    auto_restart: false,
  })

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const canNext = () => {
    if (step === 0) return form.name.trim().length > 0
    if (step === 1) return form.jar_type && form.jar_version
    return true
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const data = await postAPI('/api/servers', {
        name: form.name.trim(),
        port: form.port ? parseInt(form.port) : undefined,
        jar_type: form.jar_type,
        jar_version: form.jar_version,
        min_ram: form.min_ram,
        max_ram: form.max_ram,
        jvm_args: form.jvm_args,
        auto_restart: form.auto_restart,
        eula: true,
      })
      navigate(`/servers/${data.id}`)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Create Server</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>Set up a new Minecraft server in a few steps.</p>

      {/* Step indicators */}
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`wizard-step ${i < step ? 'done' : i === step ? 'active' : ''}`} />
        ))}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      {/* Step 0: Name & Port */}
      {step === 0 && (
        <div>
          <div className="form-group">
            <label>Server Name</label>
            <input
              className="form-input"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="My Minecraft Server"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Port (leave empty for auto-assign)</label>
            <input
              className="form-input"
              type="number"
              value={form.port}
              onChange={e => update('port', e.target.value)}
              placeholder="25565"
            />
          </div>
        </div>
      )}

      {/* Step 1: Server Type */}
      {step === 1 && (
        <JarSelector
          selected={{ jar_type: form.jar_type, jar_version: form.jar_version }}
          onSelect={({ jar_type, jar_version }) => {
            update('jar_type', jar_type)
            update('jar_version', jar_version)
          }}
        />
      )}

      {/* Step 2: Settings */}
      {step === 2 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Min RAM</label>
              <select className="form-input" value={form.min_ram} onChange={e => update('min_ram', e.target.value)}>
                {['512M', '1G', '2G', '4G'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Max RAM</label>
              <select className="form-input" value={form.max_ram} onChange={e => update('max_ram', e.target.value)}>
                {['1G', '2G', '4G', '6G', '8G', '12G', '16G'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>JVM Arguments (optional)</label>
            <input
              className="form-input"
              value={form.jvm_args}
              onChange={e => update('jvm_args', e.target.value)}
              placeholder="-XX:+UseG1GC -XX:+ParallelRefProcEnabled"
              style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={form.auto_restart}
                onChange={e => update('auto_restart', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Auto-restart on crash</span>
            </label>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Review</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px', fontFamily: 'var(--mono)', fontSize: 13 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {form.name}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Port:</span> {form.port || 'auto'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Type:</span> {form.jar_type}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Version:</span> {form.jar_version}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>RAM:</span> {form.min_ram} – {form.max_ram}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Auto-restart:</span> {form.auto_restart ? 'Yes' : 'No'}</div>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            You will be asked to accept the Minecraft EULA before creating the server.
          </p>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
        {step > 0 && (
          <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>Back</button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            className="btn btn-primary"
            disabled={!canNext()}
            onClick={() => setStep(step + 1)}
            style={{ opacity: canNext() ? 1 : 0.5 }}
          >
            Next
          </button>
        ) : (
          <button
            className="btn btn-success"
            onClick={() => setShowEula(true)}
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Server'}
          </button>
        )}
      </div>
      <EulaModal
        open={showEula}
        onAccept={() => { setShowEula(false); handleSubmit() }}
        onCancel={() => setShowEula(false)}
      />
    </div>
  )
}
