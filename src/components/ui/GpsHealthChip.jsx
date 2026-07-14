// GpsHealthChip — floats during a route (DESIGN §5). green = fix < 15s old;
// amber = degraded accuracy or fix 15–60s; red = no fix (caller also raises a
// Banner + vibration). Presentational — the engine computes the health level.

const LABEL = { green: 'GPS', amber: 'GPS weak', red: 'GPS lost' }

export function GpsHealthChip({ level = 'green', ageSecs }) {
  return (
    <span className={`gps-chip gps-chip--${level}`} role="status">
      <span className="gps-chip__dot" aria-hidden="true" />
      {LABEL[level] || 'GPS'}
      {ageSecs != null && level !== 'red' && <span className="tabular"> · {ageSecs}s</span>}
    </span>
  )
}
