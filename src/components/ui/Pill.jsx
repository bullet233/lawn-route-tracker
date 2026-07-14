// Pill — chip for filters, categories, statuses. Selected = green border +
// green-bg (DESIGN §3). `color` overrides the dot/text for category chips.

export function Pill({ selected, onClick, color, children }) {
  const cls = ['pill', selected ? 'pill--selected' : ''].filter(Boolean).join(' ')
  const style = color ? { color, borderColor: color } : undefined
  return (
    <button type="button" className={cls} style={style} onClick={onClick}>
      {color && (
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: 999, background: color, display: 'inline-block' }}
        />
      )}
      {children}
    </button>
  )
}
