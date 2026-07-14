// Analytics (SPEC §8): pricing matrix + power model (fit ONLY on model-eligible
// mowing visits — SPEC §6), $/hr, per-customer profitability. Charts stay
// minimal; the matrix is a table (a direct label beats a legend).

import { useLiveQuery } from 'dexie-react-hooks'
import { Card, StatTile, SectionTitle, EmptyState } from '../components/ui/index.js'
import { db } from '../db/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { getTargetHourlyRateCents } from '../db/settingsRepo.js'
import { indexById } from '../utils/dueSelectors.js'
import { visitRevenueCents } from '../utils/revenue.js'
import { pricingMatrix, effectiveHourlyCents } from '../utils/matrix.js'
import { fitMowDurationModel } from '../utils/pricingModel.js'
import { formatCents } from '../utils/money.js'

const BUCKETS = [3000, 5000, 7500, 10000, 15000, 20000]

export function Analytics({ onClose }) {
  const visits = useLiveQuery(() => db.visits.toArray(), [], null)
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const rateCents = useLiveQuery(() => getTargetHourlyRateCents(), [], null)

  if (!visits || !customers || rateCents == null) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
  }

  const customersById = indexById(customers)

  // model-eligible mowing visits at known lawn sizes, fit to a power curve
  const model = fitMowDurationModel(visits, customersById)
  const matrix = model ? pricingMatrix(model, BUCKETS, rateCents) : []

  // profitability: effective $/hr per completed visit
  const profit = visits
    .filter((v) => v.status === 'completed' && v.durationSecs > 0)
    .map((v) => ({
      name: customersById[v.customerId]?.name || 'Customer',
      hourlyCents: effectiveHourlyCents(visitRevenueCents(v), v.durationSecs),
    }))
    .filter((p) => p.hourlyCents != null)
    .sort((a, b) => b.hourlyCents - a.hourlyCents)

  const avgHourly = profit.length
    ? Math.round(profit.reduce((s, p) => s + p.hourlyCents, 0) / profit.length)
    : null

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h1 className="page-title" style={{ marginBottom: 8 }}>
        Analytics
      </h1>

      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <StatTile label="Target rate" value={formatCents(rateCents) + '/hr'} />
        <StatTile label="Avg earned" value={avgHourly != null ? formatCents(avgHourly) + '/hr' : '—'} sub={`${profit.length} visits`} />
        <StatTile label="Model fit" value={model ? `R² ${model.r2.toFixed(2)}` : '—'} sub={model ? `${model.n} mows` : 'need 3+ mows'} />
      </div>

      <SectionTitle icon="📈">Pricing matrix</SectionTitle>
      {!model ? (
        <EmptyState>
          Need at least 3 GPS-timed pure-mowing visits at known lawn sizes to fit the pricing curve.
        </EmptyState>
      ) : (
        <Card style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                <th style={{ padding: '4px 0' }}>Lawn (sq ft)</th>
                <th>Est. minutes</th>
                <th>Suggested price</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.sqft} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="tabular" style={{ padding: '6px 0' }}>{row.sqft.toLocaleString()}</td>
                  <td className="tabular">{row.minutes != null ? Math.round(row.minutes) : '—'}</td>
                  <td className="tabular" style={{ fontWeight: 600 }}>{row.priceCents != null ? formatCents(row.priceCents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionTitle icon="💰" count={profit.length}>
        Profitability ($/hr earned)
      </SectionTitle>
      {profit.length === 0 ? (
        <EmptyState>No completed timed visits yet.</EmptyState>
      ) : (
        <Card>
          {profit.map((p, i) => {
            const under = p.hourlyCents < rateCents
            return (
              <div key={i} className="data-row">
                <span className="data-row__label">{p.name}</span>
                <span className="data-row__value tabular" style={{ color: under ? 'var(--red)' : 'var(--green-dark)' }}>
                  {formatCents(p.hourlyCents)}/hr
                </span>
              </div>
            )
          })}
        </Card>
      )}
    </>
  )
}
