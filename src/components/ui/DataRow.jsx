// DataRow — icon + label left, value right. Settings, breakdowns (DESIGN §3).

export function DataRow({ icon, label, value }) {
  return (
    <div className="data-row">
      <span className="data-row__label">
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
      </span>
      <span className="data-row__value">{value}</span>
    </div>
  )
}
