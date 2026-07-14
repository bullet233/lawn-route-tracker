// More (SPEC §4): entry point for the office screens not on the tab bar.

import { Card } from '../components/ui/index.js'

const ITEMS = [
  { key: 'history', icon: '📆', label: 'History', sub: 'Past visits, revenue, time in field' },
  { key: 'analytics', icon: '📈', label: 'Analytics', sub: 'Pricing matrix, $/hr, profitability' },
  { key: 'healthCheck', icon: '🩺', label: 'Health Check', sub: 'Missing zones, overlaps, data issues' },
  { key: 'settings', icon: '⚙️', label: 'Settings', sub: 'Rates, applicator, backup & restore' },
]

export function More({ onOpen }) {
  return (
    <>
      <h1 className="page-title">More</h1>
      {ITEMS.map((it) => (
        <Card key={it.key} onClick={() => onOpen(it.key)} style={{ cursor: 'pointer', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
              {it.icon}
            </span>
            <div style={{ flex: 1 }}>
              <strong>{it.label}</strong>
              <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>{it.sub}</p>
            </div>
            <span aria-hidden="true">→</span>
          </div>
        </Card>
      ))}
    </>
  )
}
