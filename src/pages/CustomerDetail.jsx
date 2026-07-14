// Customer detail (SPEC §8, DESIGN §6). Keeps v1's tab structure
// (Details / Services / Stats / Location / Fertilizer) rebuilt from shared
// components. Phase 2 wires the Details tab (editable) + Location placeholder
// for the zone editor; Services/Stats/Fertilizer fill in as those systems land.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Pill, DataRow, UnitField, Banner, StatTile, EmptyState } from '../components/ui/index.js'
import { db } from '../db/index.js'
import { updateCustomer, deleteCustomer, allCustomers } from '../db/customersRepo.js'
import { visitsForCustomer } from '../db/visitsRepo.js'
import { treatmentsForCustomer } from '../db/treatmentsRepo.js'
import { activeServices, resolvePriceCents } from '../db/servicesRepo.js'
import { logsForCustomer } from '../db/complianceRepo.js'
import { getTargetHourlyRateCents } from '../db/settingsRepo.js'
import { customerSubtitle } from '../utils/customerView.js'
import { formatCents, parsePriceToCents } from '../utils/money.js'
import { formatMinutes } from '../utils/format.js'
import { visitRevenueCents } from '../utils/revenue.js'
import { indexById } from '../utils/dueSelectors.js'
import { fitMowDurationModel } from '../utils/pricingModel.js'
import { customerStats } from '../utils/customerStats.js'
import { today } from '../utils/dates.js'
import {
  shapeCustomerServices,
  formatServiceDate,
  relativeDay,
  mergeServiceOverrides,
} from '../utils/customerServices.js'
import { shapeCustomerFertilizer } from '../utils/customerFertilizer.js'
import { geocodeAddress } from '../maps/geocode.js'
import { ZoneEditor } from './ZoneEditor.jsx'
import { ComplianceLogModal } from './ComplianceLogModal.jsx'

const TONE_COLOR = { red: 'var(--red)', green: 'var(--green-dark)', slate: 'var(--text-muted)' }
const SOURCE_LABEL = { gps: 'GPS', manual: 'Manual', split: 'Split' }
const CATEGORY_LABEL = { mowing: 'Mowing', fertilizer: 'Fertilizer', cleanup: 'Cleanup', other: 'Other', addOn: 'Add-ons' }

const TABS = ['Details', 'Services', 'Stats', 'Location', 'Fertilizer']

export function CustomerDetail({ customer, onBack, onDeleted }) {
  const [tab, setTab] = useState('Details')

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 12 }}>
        ← All clients
      </button>
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        {customer.name}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>{customerSubtitle(customer)}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <Pill key={t} selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>

      {tab === 'Details' && <DetailsTab customer={customer} onDeleted={onDeleted} />}
      {tab === 'Services' && <ServicesTab customer={customer} />}
      {tab === 'Stats' && <StatsTab customer={customer} />}
      {tab === 'Location' && <LocationTab customer={customer} />}
      {tab === 'Fertilizer' && <FertilizerTab customer={customer} />}
    </>
  )
}

function DetailsTab({ customer, onDeleted }) {
  const [form, setForm] = useState(customer)
  const [savedAt, setSavedAt] = useState(null)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    await updateCustomer(customer.id, {
      name: form.name,
      address: form.address,
      phone: form.phone,
      email: form.email,
      lawnSqFt: form.lawnSqFt,
      mowingIntervalDays: form.mowingIntervalDays,
      terrain: form.terrain,
      obstacleCount: form.obstacleCount,
      fencedBackyard: form.fencedBackyard,
      propertyNotes: form.propertyNotes,
      specialApplications: form.specialApplications,
    })
    setSavedAt(Date.now())
  }

  async function remove() {
    if (!confirm(`Delete ${customer.name}? This cannot be undone.`)) return
    await deleteCustomer(customer.id)
    onDeleted?.()
  }

  return (
    <>
      <Card>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="input-label">Name</span>
          <input className="input-field" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="input-label">Address</span>
          <input
            className="input-field"
            value={form.address || ''}
            onChange={(e) => set({ address: e.target.value })}
          />
        </label>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <label style={{ display: 'block' }}>
            <span className="input-label">Phone</span>
            <input className="input-field" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="input-label">Email</span>
            <input className="input-field" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} />
          </label>
        </div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <UnitField label="Lawn size" value={form.lawnSqFt} onChange={(v) => set({ lawnSqFt: v })} unit="sq ft" min={0} />
          <UnitField
            label="Mow interval"
            value={form.mowingIntervalDays}
            onChange={(v) => set({ mowingIntervalDays: v })}
            unit="days"
            min={1}
          />
        </div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <label style={{ display: 'block' }}>
            <span className="input-label">Terrain</span>
            <select
              className="input-field"
              value={form.terrain || 'flat'}
              onChange={(e) => set({ terrain: e.target.value })}
            >
              <option value="flat">Flat</option>
              <option value="moderate">Moderate</option>
              <option value="hilly">Hilly</option>
            </select>
          </label>
          <UnitField
            label="Obstacles"
            value={form.obstacleCount}
            onChange={(v) => set({ obstacleCount: v ?? 0 })}
            unit="count"
            min={0}
          />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={!!form.fencedBackyard}
            onChange={(e) => set({ fencedBackyard: e.target.checked })}
          />
          <span>Fenced backyard</span>
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="input-label">Property notes</span>
          <textarea
            className="input-field"
            rows={2}
            value={form.propertyNotes || ''}
            onChange={(e) => set({ propertyNotes: e.target.value })}
            placeholder="Gate code, dog, access notes…"
          />
        </label>
        <label style={{ display: 'block' }}>
          <span className="input-label">Special applications</span>
          <textarea
            className="input-field"
            rows={2}
            value={form.specialApplications || ''}
            onChange={(e) => set({ specialApplications: e.target.value })}
            placeholder="Chemical constraints — shown in the EPA log + treatment stops"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save changes
          </button>
          <button type="button" className="btn btn-secondary" onClick={remove} style={{ color: 'var(--red)' }}>
            Delete
          </button>
          {savedAt && <span style={{ color: 'var(--green-dark)', fontSize: 'var(--fs-small)' }}>Saved ✓</span>}
        </div>
      </Card>
    </>
  )
}

function StateBadge({ tone, children }) {
  return (
    <span
      style={{
        fontSize: 'var(--fs-small)',
        fontWeight: 600,
        color: TONE_COLOR[tone] || 'var(--text-muted)',
        border: `1px solid ${TONE_COLOR[tone] || 'var(--border)'}`,
        borderRadius: 999,
        padding: '1px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function FertilizerTab({ customer }) {
  const visits = useLiveQuery(() => visitsForCustomer(customer.id), [customer.id], null)
  const logs = useLiveQuery(() => logsForCustomer(customer.id), [customer.id], null)
  const [openApp, setOpenApp] = useState(null) // {visit, items} whose EPA log is open

  if (visits === null || logs === null)
    return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const f = shapeCustomerFertilizer(visits, logs)

  return (
    <>
      {customer.specialApplications ? (
        <Banner variant="warn" icon="⚠️">
          <strong>Chemical constraints:</strong> {customer.specialApplications}
        </Banner>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)', margin: '0 0 4px' }}>
          No chemical constraints on file. Add any on the Details tab.
        </p>
      )}

      <Card style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <StatTile label="Applications" value={String(f.count)} sub="lifetime" />
          <StatTile label="EPA logs" value={String(f.withLog)} sub="on file" />
          <StatTile
            label="Missing"
            value={String(f.missing)}
            sub={f.missing > 0 ? 'need a log' : 'all logged'}
          />
        </div>
        {f.missing > 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-small)', color: 'var(--red)', fontWeight: 600 }}>
            {f.missing} application{f.missing > 1 ? 's are' : ' is'} missing an EPA record.
          </p>
        )}
      </Card>

      {f.products.length > 0 && (
        <>
          <p className="section-title" style={{ margin: '20px 0 8px' }}>
            🧪 Products applied here
          </p>
          <Card>
            {f.products.map((p) => (
              <DataRow
                key={p.productName + p.epaRegNum}
                label={p.epaRegNum ? `${p.productName} · EPA ${p.epaRegNum}` : p.productName}
                value={`${p.count}×`}
              />
            ))}
          </Card>
        </>
      )}

      <p className="section-title" style={{ margin: '20px 0 8px' }}>
        🧾 Application history
      </p>
      {f.applications.length === 0 ? (
        <EmptyState>
          No fertilizer or chemical applications logged yet. They appear here once a fertilizer
          service is added to a visit.
        </EmptyState>
      ) : (
        f.applications.map((a) => (
          <Card key={a.visit.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong>{formatServiceDate(a.visit.businessDate)}</strong>
              {a.log ? (
                <StateBadge tone="green">EPA logged</StateBadge>
              ) : (
                <StateBadge tone="red">No EPA log</StateBadge>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
              {a.items.map((li) => li.name).join(', ')}
            </p>
            {a.log?.products?.length > 0 && (
              <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-small)' }}>
                {a.log.products
                  .filter((p) => p.productName)
                  .map((p) => (p.epaRegNum ? `${p.productName} (EPA ${p.epaRegNum})` : p.productName))
                  .join(' · ') || <span style={{ color: 'var(--text-muted)' }}>No products recorded</span>}
              </p>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 10, ...(a.log ? {} : { color: 'var(--red)' }) }}
              onClick={() => setOpenApp(a)}
            >
              {a.log ? 'View / print EPA record' : '+ Add EPA record'}
            </button>
          </Card>
        ))
      )}

      {openApp && (
        <ComplianceLogModal
          visit={openApp.visit}
          customer={customer}
          fertLineItems={openApp.items}
          onClose={() => setOpenApp(null)}
          onSaved={() => setOpenApp(null)}
        />
      )}
    </>
  )
}

function StatsTab({ customer }) {
  const visits = useLiveQuery(() => visitsForCustomer(customer.id), [customer.id], null)
  const allVisits = useLiveQuery(() => db.visits.toArray(), [], null)
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const services = useLiveQuery(() => activeServices(), [], null)
  const rateCents = useLiveQuery(() => getTargetHourlyRateCents(), [], null)

  if (visits === null || allVisits === null || customers === null || services === null || rateCents == null)
    return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const now = today()
  const model = fitMowDurationModel(allVisits, indexById(customers))
  const mowService = services.find((s) => s.category === 'mowing')
  const mowPriceCents = mowService ? resolvePriceCents(mowService, customer) : null

  const s = customerStats({
    visits,
    customer,
    model,
    targetHourlyRateCents: rateCents,
    mowPriceCents,
    today: now,
  })

  if (s.completedCount === 0)
    return <EmptyState>No completed visits yet — stats appear once this client has been serviced.</EmptyState>

  const under = s.effHourlyCents != null && s.effHourlyCents < rateCents
  const categoryRows = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])

  // predicted vs actual deltas
  const timeDelta =
    s.predictedMowMinutes != null && s.avgMowMinutes != null ? s.avgMowMinutes - s.predictedMowMinutes : null
  const priceDelta =
    s.suggestedMowPriceCents != null && s.currentMowPriceCents != null
      ? s.currentMowPriceCents - s.suggestedMowPriceCents
      : null

  return (
    <>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <StatTile
            label="Earned"
            value={s.effHourlyCents != null ? formatCents(s.effHourlyCents, { cents: false }) + '/hr' : '—'}
            sub={`target ${formatCents(rateCents, { cents: false })}/hr`}
          />
          <StatTile
            label="Avg / visit"
            value={s.avgRevenuePerVisitCents != null ? formatCents(s.avgRevenuePerVisitCents, { cents: false }) : '—'}
            sub={`${s.completedCount} visits`}
          />
          <StatTile
            label="Avg mow"
            value={s.avgMowSecs != null ? formatMinutes(s.avgMowSecs) : '—'}
            sub={s.avgMowSecs != null ? 'per visit' : 'no timed mows'}
          />
        </div>
        {s.effHourlyCents != null && (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-small)',
              color: under ? 'var(--red)' : 'var(--green-dark)',
              fontWeight: 600,
            }}
          >
            {under
              ? `Under your target rate by ${formatCents(rateCents - s.effHourlyCents)}/hr.`
              : `Beating your target rate by ${formatCents(s.effHourlyCents - rateCents)}/hr.`}
          </p>
        )}
      </Card>

      <p className="section-title" style={{ margin: '20px 0 8px' }}>
        📐 Predicted vs actual
      </p>
      {!s.hasModel ? (
        <Banner variant="info" icon="📐">
          Need 3+ GPS-timed pure-mow visits across your clients to fit the size→time model.
        </Banner>
      ) : (
        <Card>
          <DataRow
            label="Predicted mow time"
            value={s.predictedMowMinutes != null ? `${s.predictedMowMinutes} min` : '—'}
          />
          <DataRow label="Actual avg mow time" value={s.avgMowMinutes != null ? `${s.avgMowMinutes} min` : '—'} />
          {timeDelta != null && (
            <p style={{ margin: '4px 0 12px', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
              {timeDelta > 0
                ? `Mows ${timeDelta} min slower than its size predicts — likely interior obstacles.`
                : timeDelta < 0
                  ? `Mows ${-timeDelta} min faster than its size predicts.`
                  : 'Right on the predicted time.'}
            </p>
          )}
          <DataRow
            label="Matrix-suggested price"
            value={s.suggestedMowPriceCents != null ? formatCents(s.suggestedMowPriceCents) : '—'}
          />
          <DataRow
            label="Your Mow price"
            value={s.currentMowPriceCents != null ? formatCents(s.currentMowPriceCents) : '—'}
          />
          {priceDelta != null && priceDelta < 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-small)', color: 'var(--red)', fontWeight: 600 }}>
              {formatCents(-priceDelta)} under the matrix for this lawn.
            </p>
          )}
        </Card>
      )}

      <p className="section-title" style={{ margin: '20px 0 8px' }}>
        🔁 Mowing cadence
      </p>
      <Card>
        <DataRow label="Target interval" value={s.targetIntervalDays ? `${s.targetIntervalDays} days` : 'Not set'} />
        <DataRow
          label="Actual average"
          value={s.actualAvgIntervalDays != null ? `${s.actualAvgIntervalDays} days` : 'Need 2+ mows'}
        />
        <DataRow
          label="Last mowed"
          value={s.lastMowDate ? `${formatServiceDate(s.lastMowDate)} · ${relativeDay(s.lastMowDate, now)}` : '—'}
        />
        {s.nextDueDate && (
          <DataRow
            label="Next due"
            value={
              <span style={{ color: s.overdueDays >= 0 ? 'var(--red)' : 'inherit' }}>
                {formatServiceDate(s.nextDueDate)} · {relativeDay(s.nextDueDate, now)}
              </span>
            }
          />
        )}
      </Card>

      <p className="section-title" style={{ margin: '20px 0 8px' }}>
        💰 Revenue
      </p>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
          <StatTile
            label={`This season`}
            value={formatCents(s.revenueThisSeasonCents, { cents: false })}
            sub={`${s.mowsThisSeason} mows`}
          />
          <StatTile label="Lifetime" value={formatCents(s.revenueLifetimeCents, { cents: false })} sub="all time" />
        </div>
        {categoryRows.map(([cat, cents]) => (
          <DataRow key={cat} label={CATEGORY_LABEL[cat] || cat} value={formatCents(cents)} />
        ))}
      </Card>
    </>
  )
}

function PricingCard({ customer, services }) {
  // Effective price per service (customer override or catalog default), in cents.
  const [prices, setPrices] = useState(() => {
    const init = {}
    for (const s of services) init[s.id] = resolvePriceCents(s, customer)
    return init
  })
  const [savedAt, setSavedAt] = useState(null)

  const setPrice = (id, dollars) => {
    setPrices((p) => ({ ...p, [id]: parsePriceToCents(dollars) }))
    setSavedAt(null)
  }

  async function save() {
    const overrides = mergeServiceOverrides(customer.serviceOverrides, services, prices)
    await updateCustomer(customer.id, { serviceOverrides: overrides })
    setSavedAt(Date.now())
  }

  return (
    <>
      <p className="section-title" style={{ margin: '20px 0 8px' }}>
        💵 Pricing
      </p>
      <Card>
        <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
          Set this client’s price for each service. Blank/​default tracks the catalog price;
          a custom price is used automatically when the service is added to a visit.
        </p>
        {services.map((svc) => {
          const custom = prices[svc.id] !== svc.defaultPriceCents
          return (
            <div
              key={svc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 'var(--fs-small)' }}>{svc.name}</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                  {custom ? `Custom · default ${formatCents(svc.defaultPriceCents)}` : 'Catalog default'}
                </p>
              </div>
              <span className="unit-field" style={{ width: 120 }}>
                <span className="unit-field__suffix">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(prices[svc.id] / 100).toString()}
                  onChange={(e) => setPrice(svc.id, e.target.value)}
                />
              </span>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save pricing
          </button>
          {savedAt && (
            <span style={{ color: 'var(--green-dark)', fontSize: 'var(--fs-small)' }}>Saved ✓</span>
          )}
        </div>
      </Card>
    </>
  )
}

function ServicesTab({ customer }) {
  const visits = useLiveQuery(() => visitsForCustomer(customer.id), [customer.id], null)
  const treatments = useLiveQuery(() => treatmentsForCustomer(customer.id), [customer.id], null)
  const services = useLiveQuery(() => activeServices(), [], null)

  if (visits === null || treatments === null || services === null)
    return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const now = today()
  const s = shapeCustomerServices(visits, treatments, now)

  return (
    <>
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <StatTile label="Services" value={String(s.completedCount)} sub="completed" />
          <StatTile label="Revenue" value={formatCents(s.revenueCents, { cents: false })} sub="lifetime" />
          <StatTile
            label="Last visit"
            value={s.lastVisitDate ? relativeDay(s.lastVisitDate, now) : '—'}
            sub={s.lastVisitDate ? formatServiceDate(s.lastVisitDate) : 'never serviced'}
            tabular={false}
          />
        </div>
      </Card>

      <PricingCard customer={customer} services={services} />

      {s.hasTreatments && (
        <>
          <p className="section-title" style={{ margin: '20px 0 8px' }}>
            🌱 Treatment schedule
          </p>
          <Card>
            {s.treatments.map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 'var(--fs-small)' }}>
                    {t.stepName || 'Treatment'}
                  </strong>
                  <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                    {t.windowStart && t.windowEnd
                      ? `Window ${formatServiceDate(t.windowStart)} – ${formatServiceDate(t.windowEnd)}`
                      : `${t.year}`}
                  </p>
                </div>
                <StateBadge tone={t.tone}>{t.label}</StateBadge>
              </div>
            ))}
          </Card>
        </>
      )}

      <p className="section-title" style={{ margin: '20px 0 8px' }}>
        🧾 Service history
      </p>
      {s.history.length === 0 ? (
        <EmptyState>No services logged yet. Completed visits show up here.</EmptyState>
      ) : (
        s.history.map((day) => (
          <Card key={day.date} style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <strong>{formatServiceDate(day.date)}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                {relativeDay(day.date, now)}
              </span>
            </div>
            {day.visits.map((v) => (
              <VisitRow key={v.id} visit={v} />
            ))}
          </Card>
        ))
      )}
    </>
  )
}

function VisitRow({ visit }) {
  const skipped = visit.status === 'skipped'
  const items = visit.lineItems || []
  const addOns = visit.addOns || []
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
          <StateBadge tone={skipped ? 'slate' : 'green'}>
            {skipped ? 'Skipped' : SOURCE_LABEL[visit.source] || 'Visit'}
          </StateBadge>
          {!skipped && visit.durationSecs ? formatMinutes(visit.durationSecs) : null}
        </span>
        {!skipped && (
          <strong className="tabular">{formatCents(visitRevenueCents(visit))}</strong>
        )}
      </div>
      {!skipped &&
        items.map((li, i) => (
          <div
            key={i}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-small)', marginTop: 4 }}
          >
            <span>{li.name}</span>
            <span className="tabular" style={{ color: 'var(--text-muted)' }}>
              {formatCents(li.priceCents)}
            </span>
          </div>
        ))}
      {!skipped &&
        addOns.map((a, i) => (
          <div
            key={`a${i}`}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-small)', marginTop: 4 }}
          >
            <span>＋ {a.name}</span>
            <span className="tabular" style={{ color: 'var(--text-muted)' }}>
              {formatCents(a.priceCents)}
            </span>
          </div>
        ))}
      {visit.note && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
          “{visit.note}”
        </p>
      )}
    </div>
  )
}

function LocationTab({ customer }) {
  const all = useLiveQuery(() => allCustomers(), [], [])
  const [editing, setEditing] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState(null)

  // other customers' zones, for the overlap check (exclude this customer)
  const otherZones = all
    .filter((c) => c.id !== customer.id && c.arrivalZone)
    .map((c) => ({ customerId: c.id, name: c.name, polygon: c.arrivalZone }))

  async function geocode() {
    if (!customer.address) {
      setError('Add an address on the Details tab first.')
      return
    }
    setGeocoding(true)
    setError(null)
    try {
      const { lat, lng } = await geocodeAddress(customer.address)
      await updateCustomer(customer.id, { location: { lat, lng } })
    } catch (e) {
      setError(e.message)
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <>
      <Card>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Banner variant="error" icon="⚠️">
              {error}
            </Banner>
          </div>
        )}
        {customer.location ? (
          <DataRow
            label="📍 Location"
            value={`${customer.location.lat.toFixed(5)}, ${customer.location.lng.toFixed(5)}`}
          />
        ) : (
          <Banner variant="warn" icon="📍">
            No location yet — geocode the address, then place the arrival zone.
          </Banner>
        )}
        <DataRow label="Arrival zone" value={customer.arrivalZone ? `${customer.arrivalZone.length} points` : 'Not set'} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={geocode} disabled={geocoding}>
            {geocoding ? 'Geocoding…' : 'Geocode from address'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing(true)}
            disabled={!customer.location && !customer.arrivalZone}
          >
            {customer.arrivalZone ? 'Edit arrival zone' : 'Place arrival zone'}
          </button>
        </div>
        {!customer.location && !customer.arrivalZone && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)', margin: '8px 0 0' }}>
            Geocode first so the map opens on the property.
          </p>
        )}
      </Card>

      {editing && (
        <ZoneEditor
          customer={customer}
          otherZones={otherZones}
          initialCenter={customer.location}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </>
  )
}
