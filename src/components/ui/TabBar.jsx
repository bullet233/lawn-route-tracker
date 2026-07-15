// TabBar — bottom navigation (DESIGN §4). The Route tab is the route builder;
// a separate Live tab (the active-route tracking + map) appears only while a
// route is running or awaiting resume, and carries the green active-dot.

const TABS = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'route', label: 'Route', icon: '🚚' },
  { key: 'live', label: 'Live', icon: '📍', liveOnly: true },
  { key: 'clients', label: 'Clients', icon: '👥' },
  { key: 'treatments', label: 'Treatments', icon: '🌱' },
  { key: 'more', label: 'More', icon: '⋯' },
]

export function TabBar({ active, onChange, routeActive = false, showLive = false }) {
  const tabs = TABS.filter((t) => !t.liveOnly || showLive)
  return (
    <nav className="tab-bar">
      {tabs.map((t) => (
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
          {t.key === 'live' && routeActive && <span className="tab-bar__dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  )
}

export { TABS }
