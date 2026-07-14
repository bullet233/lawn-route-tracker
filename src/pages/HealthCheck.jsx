// Health Check (SPEC §8): one card per issue class, each row deep-linkable to
// the fix. Green all-clear when nothing's wrong.

import { useLiveQuery } from 'dexie-react-hooks'
import { Card, SectionTitle } from '../components/ui/index.js'
import { db } from '../db/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { indexById } from '../utils/dueSelectors.js'
import { findOverlappingCustomers } from '../engine/geo.js'

export function HealthCheck({ onClose }) {
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const visits = useLiveQuery(() => db.visits.toArray(), [], null)

  if (!customers || !visits) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const customersById = indexById(customers)
  const missingZones = customers.filter((c) => !c.arrivalZone)
  const missingLocation = customers.filter((c) => !c.location)
  const zones = customers.filter((c) => c.arrivalZone).map((c) => ({ customerId: c.id, polygon: c.arrivalZone }))
  const overlaps = findOverlappingCustomers(zones)
  const estimated = visits.filter((v) => v.attribution === 'estimated')

  const issues = [
    { key: 'zones', title: 'Customers missing an arrival zone', rows: missingZones.map((c) => c.name) },
    { key: 'loc', title: 'Customers missing a location', rows: missingLocation.map((c) => c.name) },
    {
      key: 'overlap',
      title: 'Overlapping zone pairs',
      rows: overlaps.map((p) => `${customersById[p.a]?.name} ↔ ${customersById[p.b]?.name}`),
    },
    { key: 'est', title: 'Visits with estimated times', rows: estimated.map((v) => `${customersById[v.customerId]?.name} · ${v.businessDate}`) },
  ].filter((i) => i.rows.length > 0)

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h1 className="page-title" style={{ marginBottom: 8 }}>
        Health Check
      </h1>

      {issues.length === 0 ? (
        <Card status="green">
          <strong>✓ All clear</strong>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
            No missing zones, overlaps, or estimated-time visits.
          </p>
        </Card>
      ) : (
        issues.map((issue) => (
          <div key={issue.key}>
            <SectionTitle icon="⚠️" count={issue.rows.length}>
              {issue.title}
            </SectionTitle>
            <Card status="amber" style={{ marginBottom: 8 }}>
              {issue.rows.map((r, i) => (
                <div key={i} className="data-row">
                  <span className="data-row__label">{r}</span>
                </div>
              ))}
            </Card>
          </div>
        ))
      )}
    </>
  )
}
