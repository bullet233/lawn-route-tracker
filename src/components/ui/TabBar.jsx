// TabBar — bottom navigation, 5 tabs, always visible except inside modals
// (DESIGN §4). Route tab shows a green dot when a route is active.

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'route', label: 'Route', icon: '🚚' },
  { key: 'clients', label: 'Clients', icon: '👥' },
  { key: 'treatments', label: 'Treatments', icon: '🌱' },
  { key: 'more', label: 'More', icon: '⋯' },
]

export function TabBar({ active, onChange, routeActive = false }) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={'tab-bar__item' + (active === t.key ? ' tab-bar__item--active' : '')}
          onClick={() => onChange(t.key)}
        >
          <span className="tab-bar__icon" aria-hidden="true">
            {t.icon}
          </span>
          {t.label}
          {t.key === 'route' && routeActive && <span className="tab-bar__dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  )
}

export { TABS }
