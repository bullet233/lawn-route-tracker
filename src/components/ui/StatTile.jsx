// StatTile — micro-label + big number (+ optional sub-line). Dashboard/History
// summaries (DESIGN §3). Value is passed pre-formatted (no reduce in JSX).

export function StatTile({ label, value, sub, tabular = true }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className={'stat-tile__value' + (tabular ? ' tabular' : '')}>{value}</div>
      {sub != null && <div className="stat-tile__sub">{sub}</div>}
    </div>
  )
}
