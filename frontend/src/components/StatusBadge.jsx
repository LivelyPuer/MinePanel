export default function StatusBadge({ status }) {
  const cls = `badge badge-${status || 'stopped'}`
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Stopped'
  return (
    <span className={cls}>
      <span className="badge-dot" />
      {label}
    </span>
  )
}
