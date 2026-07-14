// Day Review (SPEC §8, DESIGN §5) — the end-of-day screen. Pre-filled visits,
// tap service pills to set line items, driveby keep/skip, EPA log per applicable
// visit, auto miles (haversine fallback), one Save All & Close that also runs
// the per-save backup (SPEC §10).

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, StatTile, Pill, Banner, EmptyState, PrimaryBar } from '../components/ui/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { activeServices } from '../db/servicesRepo.js'
import { visitsForDate, updateVisit } from '../db/visitsRepo.js'
import { indexById } from '../utils/dueSelectors.js'
import { formatCents, parsePriceToCents } from '../utils/money.js'
import { formatClock, formatMinutes } from '../utils/format.js'
import { visitRevenueCents } from '../utils/revenue.js'
import {
  lineItemFor,
  needsComplianceLog,
  dayRevenueCents,
  dayMiles,
  orderVisits,
  dayJobSeconds,
  dayDriveSeconds,
} from '../utils/dayReview.js'
import { downloadBackup } from '../data/download.js'
import { ComplianceLogModal } from './ComplianceLogModal.jsx'
import { allTreatments, completeTreatment, revertTreatment, revertTreatmentsForVisit } from '../db/treatmentsRepo.js'
import { openTreatmentInWindow } from '../utils/treatments.js'
import { isFertilizerVisit } from '../utils/revenue.js'
import { SplitVisitModal } from './SplitVisitModal.jsx'

// Complete-and-link (SPEC §6): a fertilizer line item in a treatment's window
// offers to complete + link it. Declining leaves the line item standing alone.
function TreatmentLink({ lineItems, servicesById, treatments, customerId, businessDate, visitId }) {
  const fertLi = lineItems.find((li) => servicesById[li.serviceId]?.category === 'fertilizer' || li.category === 'fertilizer')
  // already linked to this visit? (completed treatments are excluded from the
  // in-window lookup, so find the link explicitly)
  const linkedT = treatments.find((t) => t.completedByVisitId === visitId)
  const openT = fertLi ? openTreatmentInWindow(treatments, customerId, businessDate) : null
  if (!linkedT && !openT) return null

  const t = linkedT || openT
  const linked = !!linkedT
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--green-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 'var(--fs-small)' }}>
        {linked ? `🔗 Counts as ${t.stepName} ✓` : `🌱 This counts as ${t.stepName}?`}
      </span>
      {linked ? (
        <button type="button" className="btn btn-secondary" onClick={() => revertTreatment(t.id)}>
          Unlink
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => completeTreatment(t.id, visitId, fertLi.serviceId)}
        >
          Link
        </button>
      )}
    </div>
  )
}

export function DayReview({ businessDate, onClose }) {
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const services = useLiveQuery(() => activeServices(), [], null)
  const visits = useLiveQuery(() => visitsForDate(businessDate), [businessDate], null)
  const treatments = useLiveQuery(() => allTreatments(), [], null)

  // local editable copy keyed by visitId: { lineItems, status }
  const [edits, setEdits] = useState({})
  const [epaFor, setEpaFor] = useState(null) // visitId open in EPA modal
  const [splitFor, setSplitFor] = useState(null) // visit open in split modal
  const [savedMsg, setSavedMsg] = useState(null)

  useEffect(() => {
    if (!visits) return
    setEdits((prev) => {
      const next = { ...prev }
      for (const v of visits) {
        if (!next[v.id]) next[v.id] = { lineItems: v.lineItems || [], status: v.status }
      }
      return next
    })
  }, [visits])

  const servicesById = useMemo(() => indexById(services || []), [services])
  const customersById = useMemo(() => indexById(customers || []), [customers])

  if (!customers || !services || !visits) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const ordered = orderVisits(visits)
  // merge edits into visit objects for totals
  const merged = ordered.map((v) => ({ ...v, ...edits[v.id] }))
  const revenue = dayRevenueCents(merged)
  const miles = dayMiles(merged, customersById)
  const jobSecs = dayJobSeconds(merged)
  const driveSecs = dayDriveSeconds(merged)

  const toggleService = (visitId, service, customer) => {
    setEdits((e) => {
      const cur = e[visitId] || { lineItems: [], status: 'completed' }
      const has = cur.lineItems.some((li) => li.serviceId === service.id)
      const lineItems = has
        ? cur.lineItems.filter((li) => li.serviceId !== service.id)
        : [...cur.lineItems, lineItemFor(service, customer)]
      return { ...e, [visitId]: { ...cur, lineItems } }
    })
  }

  const setPrice = (visitId, serviceId, dollars) => {
    setEdits((e) => {
      const cur = e[visitId]
      const lineItems = cur.lineItems.map((li) =>
        li.serviceId === serviceId ? { ...li, priceCents: parsePriceToCents(dollars) } : li,
      )
      return { ...e, [visitId]: { ...cur, lineItems } }
    })
  }

  const setStatus = (visitId, status) =>
    setEdits((e) => ({ ...e, [visitId]: { ...e[visitId], status } }))

  async function saveAll() {
    for (const v of visits) {
      const edit = edits[v.id]
      if (!edit) continue
      await updateVisit(v.id, { lineItems: edit.lineItems, status: edit.status })
      // Integrity (SPEC §6): a visit that no longer completes with a fertilizer
      // line item can't fulfill a treatment — revert any it was linked to.
      const stillFulfills = edit.status === 'completed' && isFertilizerVisit({ lineItems: edit.lineItems })
      if (!stillFulfills) await revertTreatmentsForVisit(v.id)
    }
    const filename = await downloadBackup(Date.now())
    setSavedMsg(`Saved · ${filename}`)
    setTimeout(() => onClose?.(), 900)
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Close
      </button>
      <h1 className="page-title" style={{ marginBottom: 8 }}>
        Day Review · {businessDate}
      </h1>

      {ordered.length === 0 ? (
        <EmptyState>No visits recorded for this day yet.</EmptyState>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <StatTile label="Revenue" value={formatCents(revenue)} sub={`${merged.filter((v) => v.status === 'completed').length} jobs`} />
            <StatTile label="Job time" value={formatMinutes(jobSecs)} sub="on site" />
            <StatTile label="Job + drive" value={formatMinutes(jobSecs + driveSecs)} sub="total" />
          </div>

          {ordered.map((v) => {
            const customer = customersById[v.customerId]
            const edit = edits[v.id] || { lineItems: [], status: v.status }
            const isDriveby = (v.conditions || []).includes('driveby')
            const skipped = edit.status === 'skipped'
            const rev = visitRevenueCents({ ...v, ...edit })
            const epaNeeded = needsComplianceLog(edit.lineItems, servicesById)
            return (
              <Card key={v.id} status={skipped ? 'slate' : 'green'} style={{ marginBottom: 10, opacity: skipped ? 0.7 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 'var(--fs-card)' }}>{customer?.name || 'Customer'}</strong>
                  <span className="tabular" style={{ fontWeight: 700 }}>{formatCents(rev)}</span>
                </div>
                <p style={{ color: 'var(--text-muted)', margin: '2px 0 8px', fontSize: 'var(--fs-small)' }}>
                  {formatClock(v.durationSecs || 0)} on site · {formatMinutes(v.driveTimeSecs || 0)} drive · {v.source}
                </p>

                {isDriveby && (
                  <div style={{ marginBottom: 8 }}>
                    <Banner variant="warn" icon="⚡">
                      Short stop flagged as a driveby — keep it or skip.
                    </Banner>
                  </div>
                )}

                {!skipped && (
                  <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {services.map((s) => {
                        const on = edit.lineItems.some((li) => li.serviceId === s.id)
                        return (
                          <Pill key={s.id} selected={on} onClick={() => toggleService(v.id, s, customer)}>
                            {s.name}
                          </Pill>
                        )
                      })}
                    </div>
                    {edit.lineItems.map((li) => (
                      <div key={li.serviceId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 'var(--fs-small)' }}>{li.name}</span>
                        <span className="unit-field" style={{ width: 120 }}>
                          <span className="unit-field__suffix">$</span>
                          <input
                            type="number"
                            value={(li.priceCents / 100).toString()}
                            onChange={(e) => setPrice(v.id, li.serviceId, e.target.value)}
                          />
                        </span>
                      </div>
                    ))}
                    {epaNeeded && (
                      <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setEpaFor(v.id)}>
                        📋 EPA log
                      </button>
                    )}
                    <TreatmentLink
                      lineItems={edit.lineItems}
                      servicesById={servicesById}
                      treatments={treatments || []}
                      customerId={v.customerId}
                      businessDate={businessDate}
                      visitId={v.id}
                    />
                  </>
                )}

                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: skipped ? 'var(--green-dark)' : 'var(--red)' }}
                    onClick={() => setStatus(v.id, skipped ? 'completed' : 'skipped')}
                  >
                    {skipped ? 'Un-skip' : 'Skip this stop'}
                  </button>
                  {!skipped && (v.durationSecs || 0) > 0 && customers.length > 1 && (
                    <button type="button" className="btn btn-secondary" onClick={() => setSplitFor(v)}>
                      Split…
                    </button>
                  )}
                </div>
              </Card>
            )
          })}

          <Card status="blue">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🚙 Miles (straight-line)</span>
              <strong className="tabular">{miles.toFixed(1)} mi</strong>
            </div>
          </Card>
        </>
      )}

      {splitFor && (
        <SplitVisitModal
          visit={splitFor}
          customers={customers}
          mowService={services.find((s) => s.category === 'mowing')}
          onClose={() => setSplitFor(null)}
          onDone={() => setSplitFor(null)}
        />
      )}

      {epaFor && (
        <ComplianceLogModal
          visit={visits.find((v) => v.id === epaFor)}
          customer={customersById[visits.find((v) => v.id === epaFor).customerId]}
          fertLineItems={(edits[epaFor]?.lineItems || []).filter((li) => servicesById[li.serviceId]?.requiresComplianceLog)}
          onClose={() => setEpaFor(null)}
          onSaved={() => setEpaFor(null)}
        />
      )}

      {ordered.length > 0 && (
        <PrimaryBar>
          <button type="button" className="btn btn-primary" onClick={saveAll}>
            {savedMsg || 'Save All & Close'}
          </button>
        </PrimaryBar>
      )}
    </>
  )
}
