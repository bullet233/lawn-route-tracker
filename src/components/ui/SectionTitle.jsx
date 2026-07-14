// SectionTitle — icon + title + count (DESIGN §3, v1's pattern kept).

export function SectionTitle({ icon, children, count }) {
  return (
    <div className="section-title">
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {count != null && <span className="section-title__count">({count})</span>}
    </div>
  )
}
