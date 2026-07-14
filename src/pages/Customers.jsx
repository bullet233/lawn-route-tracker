// Customers screen (SPEC §8, DESIGN §6): card grid with search + sort, quick-add,
// and a due badge slot (populated once visits/treatments exist). Selecting a
// card opens the detail view.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Pill, SectionTitle, EmptyState } from '../components/ui/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { shapeCustomers, customerSubtitle } from '../utils/customerView.js'
import { QuickAddCustomer } from './QuickAddCustomer.jsx'
import { CustomerDetail } from './CustomerDetail.jsx'

const SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'newest', label: 'Newest' },
  { key: 'largest', label: 'Largest' },
]

export function Customers() {
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  if (customers === null) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : null
  if (selected) {
    return (
      <CustomerDetail
        customer={selected}
        onBack={() => setSelectedId(null)}
        onDeleted={() => setSelectedId(null)}
      />
    )
  }

  const shaped = shapeCustomers(customers, { query, sort })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Clients</h1>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          + Add
        </button>
      </div>

      <input
        className="input-field"
        placeholder="Search name, address, phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {SORTS.map((s) => (
          <Pill key={s.key} selected={sort === s.key} onClick={() => setSort(s.key)}>
            {s.label}
          </Pill>
        ))}
      </div>

      <SectionTitle icon="👥" count={shaped.length}>
        {query ? 'Matches' : 'All clients'}
      </SectionTitle>

      {shaped.length === 0 ? (
        <EmptyState cta={query ? undefined : 'Add your first customer'} onCta={() => setAdding(true)}>
          {query ? 'No customers match your search.' : 'No customers yet. Add one to start building routes.'}
        </EmptyState>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {shaped.map((c) => (
            <Card
              key={c.id}
              status={c.holdUntil ? 'slate' : undefined}
              onClick={() => setSelectedId(c.id)}
              style={{ cursor: 'pointer' }}
            >
              <strong style={{ fontSize: 'var(--fs-card)' }}>{c.name}</strong>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 'var(--fs-small)' }}>
                {customerSubtitle(c)}
              </p>
              {c.mowingIntervalDays && (
                <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-small)' }}>
                  🌿 Mow every {c.mowingIntervalDays}d
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {adding && <QuickAddCustomer onClose={() => setAdding(false)} onAdded={(c) => setSelectedId(c.id)} />}
    </>
  )
}
