// History (SPEC §8): filter pills, summary tiles (visits / revenue with
// per-service breakdown / job time / job+drive shown separately), day-grouped
// visit cards.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, StatTile, Pill, SectionTitle, EmptyState } from '../components/ui/index.js'
import { db } from '../db/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { indexById } from '../utils/dueSelectors.js'
import { filterByCategory, groupByDate, summarize, dayTotals, monthGrid } from '../utils/history.js'
import { formatCents } from '../utils/money.js'
import { formatMinutes, formatClock } from '../utils/format.js'
import { visitRevenueCents } from '../utils/revenue.js'
import { today, yearOf } from '../utils/dates.js'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mowing', label: 'Mowing' },
  { key: 'fertilizer', label: 'Fertilizer' },
  { key: 'cleanup', label: 'Cleanup' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function CalendarMonth({ totals, cursor, setCursor, today }) {
  const weeks = monthGrid(cursor.year, cursor.month)
  const step = (delta) => {
    let m = cursor.month + delta
    let y = cursor.year
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setCursor({ year: y, month: m })
  }
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={() => step(-1)}>
          ‹
        </button>
        <strong>
          {MONTHS[cursor.month - 1]} {cursor.year}
        </strong>
        <button type="button" className="btn btn-secondary" onClick={() => step(1)}>
          ›
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-micro)', fontWeight: 600 }}>
            {d}
          </div>
        ))}
        {weeks.flat().map((cell, i) => {
          if (!cell) return <div key={i} />
          const t = totals[cell]
          const day = Number(cell.slice(8))
          const isToday = cell === today
          return (
            <div
              key={i}
              style={{
                minHeight: 52,
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 4,
                background: t ? 'var(--green-bg)' : 'var(--bg-card)',
                outline: isToday ? '2px solid var(--green)' : 'none',
              }}
            >
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)' }}>{day}</div>
              {t && (
                <div style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--green-dark)' }}>
                  {t.count}· {formatCents(t.cents, { cents: false })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function History({ onClose }) {
  const visits = useLiveQuery(() => db.visits.toArray(), [], null)
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const [cat, setCat] = useState('all')
  const [view, setView] = useState('list')
  const bd = today()
  const [cursor, setCursor] = useState(() => ({ year: yearOf(bd), month: Number(bd.slice(5, 7)) }))

  if (!visits || !customers) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const customersById = indexById(customers)
  const filtered = filterByCategory(visits, cat)
  const s = summarize(filtered)
  const grouped = groupByDate(filtered)
  const services = Object.values(s.byService)

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h1 className="page-title" style={{ marginBottom: 8 }}>
        History
      </h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <Pill key={f.key} selected={cat === f.key} onClick={() => setCat(f.key)}>
              {f.label}
            </Pill>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill selected={view === 'list'} onClick={() => setView('list')}>
            List
          </Pill>
          <Pill selected={view === 'calendar'} onClick={() => setView('calendar')}>
            Calendar
          </Pill>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <StatTile label="Visits" value={String(s.visitCount)} />
        <StatTile label="Revenue" value={formatCents(s.revenueCents)} />
        <StatTile label="Time in field" value={formatMinutes(s.jobSecs)} sub={`${formatMinutes(s.jobPlusDriveSecs)} w/ drive`} />
      </div>

      {services.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div className="stat-tile__label" style={{ marginBottom: 8 }}>
            Revenue by service
          </div>
          {services.map((row) => (
            <div key={row.name} className="data-row">
              <span className="data-row__label">
                {row.name} <span style={{ color: 'var(--text-muted)' }}>×{row.count}</span>
              </span>
              <span className="data-row__value tabular">{formatCents(row.cents)}</span>
            </div>
          ))}
        </Card>
      )}

      {view === 'calendar' && (
        <CalendarMonth totals={dayTotals(filtered)} cursor={cursor} setCursor={setCursor} today={bd} />
      )}

      {view === 'list' && grouped.length === 0 ? (
        <EmptyState>No visits recorded yet.</EmptyState>
      ) : (
        view === 'list' &&
        grouped.map((day) => (
          <div key={day.date}>
            <SectionTitle icon="📆" count={day.visits.length}>
              {day.date}
            </SectionTitle>
            {day.visits.map((v) => {
              const skipped = v.status === 'skipped'
              return (
                <Card key={v.id} status={skipped ? 'slate' : 'green'} style={{ marginBottom: 6, opacity: skipped ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>{customersById[v.customerId]?.name || 'Customer'}</strong>
                    <span className="tabular" style={{ fontWeight: 700 }}>
                      {skipped ? 'skipped' : formatCents(visitRevenueCents(v))}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                    {formatClock(v.durationSecs || 0)} · {(v.lineItems || []).map((li) => li.name).join(', ') || 'no services'} · {v.source}
                  </p>
                </Card>
              )
            })}
          </div>
        ))
      )}
    </>
  )
}
