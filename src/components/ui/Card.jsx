// Card — the base surface. `status` adds a 4px left border in a state color
// (DESIGN §3). Pages compose this; a page defining its own card style is a
// review flag.

const STATUS_CLASS = {
  green: 'card--green',
  amber: 'card--amber',
  red: 'card--red',
  blue: 'card--blue',
  slate: 'card--slate',
}

export function Card({ status, className = '', children, ...rest }) {
  const cls = ['card', status ? STATUS_CLASS[status] : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}
