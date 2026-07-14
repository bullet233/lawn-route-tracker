// Treatments — the fertilizer home (SPEC §8). Ports v1's proven layout: "Now"
// season indicator, Needs Attention, Upcoming-45d, enrollment w/ Enroll All,
// skipped w/ un-skip. Every completion goes through a visit (SPEC §6): logging
// an application creates a manual visit + line item, links the treatment, and
// opens the EPA log.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Pill, SectionTitle, EmptyState, Modal } from '../components/ui/index.js'
import { formatCents } from '../utils/money.js'
import { resolvePriceCents } from '../db/servicesRepo.js'
import { allCustomers } from '../db/customersRepo.js'
import { activeServices, resolveBillingService } from '../db/servicesRepo.js'
import { allPrograms } from '../db/programsRepo.js'
import { allTreatments, enrollCustomer, enrollAll, skipTreatment, unskipTreatment, completeTreatment } from '../db/treatmentsRepo.js'
import { addManualVisit } from '../db/visitsRepo.js'
import { indexById } from '../utils/dueSelectors.js'
import { today, yearOf } from '../utils/dates.js'
import { needsAttention, upcoming, currentStepName } from '../utils/treatments.js'
import { classifyTreatment } from '../engine/treatmentCadence.js'
import { lineItemFor } from '../utils/dayReview.js'
import { ComplianceLogModal } from './ComplianceLogModal.jsx'
import { ProgramEditor } from './ProgramEditor.jsx'

export function Treatments() {
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const services = useLiveQuery(() => activeServices(), [], null)
  const programs = useLiveQuery(() => allPrograms(), [], null)
  const treatments = useLiveQuery(() => allTreatments(), [], null)

  const [epaVisit, setEpaVisit] = useState(null)
  const [epaCustomer, setEpaCustomer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(null) // { treatment, customer } when billing service is ambiguous
  const [editingProgram, setEditingProgram] = useState(false)

  if (!customers || !services || !programs || !treatments) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
  }

  const bd = today()
  const year = yearOf(bd)
  const customersById = indexById(customers)
  const program = programs.find((p) => p.active) || programs[0]

  const thisYear = treatments.filter((t) => t.year === year)
  const attention = needsAttention(thisYear, bd)
  const soon = upcoming(thisYear, bd, 45)
  const skipped = thisYear.filter((t) => t.status === 'skipped')

  const enrolledIds = new Set(thisYear.map((t) => t.customerId))
  const notEnrolled = customers.filter((c) => !enrolledIds.has(c.id))

  const fertServices = services.filter((s) => s.category === 'fertilizer')

  async function logApplication(t) {
    const customer = customersById[t.customerId]
    const step = program?.steps?.find((s) => s.id === t.stepId)
    const service = resolveBillingService(services, step, customer)
    if (service) return doLog(t, customer, service)
    // ambiguous (>1 active fertilizer service, no step billing service) — ask (SPEC §3)
    if (fertServices.length === 1) return doLog(t, customer, fertServices[0])
    setPicker({ treatment: t, customer })
  }

  async function doLog(t, customer, service) {
    setBusy(true)
    const visit = await addManualVisit(customer.id, [lineItemFor(service, customer)])
    await completeTreatment(t.id, visit.id, service.id)
    setBusy(false)
    setPicker(null)
    setEpaVisit(visit)
    setEpaCustomer(customer)
  }

  async function rolloverSeason() {
    const enrolled = [...new Set(thisYear.map((t) => t.customerId))]
    if (!enrolled.length) return
    if (!confirm(`Enroll ${enrolled.length} customer(s) into ${program.name} for ${year + 1}?`)) return
    await enrollAll(program, enrolled, year + 1)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Treatments</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {program && currentStepName(program, bd) && (
            <Pill selected>Now: {currentStepName(program, bd)}</Pill>
          )}
          {program && (
            <button type="button" className="btn btn-secondary" onClick={() => setEditingProgram(true)}>
              Edit program
            </button>
          )}
        </div>
      </div>

      {!program ? (
        <EmptyState>No treatment program defined yet.</EmptyState>
      ) : (
        <>
          <SectionTitle icon="⚠️" count={attention.length}>
            Needs attention
          </SectionTitle>
          {attention.length === 0 ? (
            <EmptyState>Nothing needs attention — all open treatments are outside their window.</EmptyState>
          ) : (
            attention.map((t) => {
              const state = classifyTreatment(t, bd)
              return (
                <Card key={t.id} status={state === 'overdue' ? 'red' : 'amber'} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{customersById[t.customerId]?.name || 'Customer'}</strong>
                      <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                        {t.stepName} · {state === 'overdue' ? 'window closed' : `window ${t.windowStart} → ${t.windowEnd}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => logApplication(t)}>
                        Log
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => skipTreatment(t.id)}>
                        Skip
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })
          )}

          <SectionTitle icon="📅" count={soon.length}>
            Upcoming (45 days)
          </SectionTitle>
          {soon.length === 0 ? (
            <EmptyState>No windows opening in the next 45 days.</EmptyState>
          ) : (
            <Card>
              {soon.map((t) => (
                <div key={t.id} className="data-row">
                  <span className="data-row__label">{customersById[t.customerId]?.name}</span>
                  <span className="data-row__value" style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                    {t.stepName} · opens {t.windowStart}
                  </span>
                </div>
              ))}
            </Card>
          )}

          <SectionTitle icon="✍️" count={notEnrolled.length}>
            Enrollment · {year}
          </SectionTitle>
          {notEnrolled.length === 0 ? (
            <EmptyState>Every customer is enrolled for {year}.</EmptyState>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => enrollAll(program, notEnrolled.map((c) => c.id), year)}
                >
                  Enroll all ({notEnrolled.length})
                </button>
              </div>
              <Card>
                {notEnrolled.map((c) => (
                  <div key={c.id} className="data-row">
                    <span className="data-row__label">{c.name}</span>
                    <button type="button" className="btn btn-secondary" onClick={() => enrollCustomer(program, c.id, year)}>
                      Enroll
                    </button>
                  </div>
                ))}
              </Card>
            </>
          )}

          {thisYear.length > 0 && (
            <>
              <SectionTitle icon="🔄">Season rollover</SectionTitle>
              <Card status="blue" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 'var(--fs-small)' }}>
                    Enroll this year's customers into {program.name} for {year + 1}.
                  </span>
                  <button type="button" className="btn btn-secondary" onClick={rolloverSeason}>
                    Roll to {year + 1}
                  </button>
                </div>
              </Card>
            </>
          )}

          {skipped.length > 0 && (
            <>
              <SectionTitle icon="⏭️" count={skipped.length}>
                Skipped
              </SectionTitle>
              <Card>
                {skipped.map((t) => (
                  <div key={t.id} className="data-row">
                    <span className="data-row__label">
                      {customersById[t.customerId]?.name} · {t.stepName}
                    </span>
                    <button type="button" className="btn btn-secondary" onClick={() => unskipTreatment(t.id)}>
                      Un-skip
                    </button>
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {editingProgram && program && (
        <ProgramEditor
          program={program}
          fertServices={fertServices}
          onClose={() => setEditingProgram(false)}
          onSaved={() => setEditingProgram(false)}
        />
      )}

      {picker && (
        <Modal
          title="Which service does this bill as?"
          onClose={() => setPicker(null)}
          actions={
            <button type="button" className="btn btn-secondary" onClick={() => setPicker(null)}>
              Cancel
            </button>
          }
        >
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {picker.customer.name} has more than one fertilizer service — pick the one this
            application bills as.
          </p>
          {fertServices.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn-secondary"
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8 }}
              disabled={busy}
              onClick={() => doLog(picker.treatment, picker.customer, s)}
            >
              {s.name} · {formatCents(resolvePriceCents(s, picker.customer))}
            </button>
          ))}
        </Modal>
      )}

      {epaVisit && epaCustomer && (
        <ComplianceLogModal
          visit={epaVisit}
          customer={epaCustomer}
          fertLineItems={epaVisit.lineItems.filter((li) => li.category === 'fertilizer')}
          onClose={() => {
            setEpaVisit(null)
            setEpaCustomer(null)
          }}
          onSaved={() => {}}
        />
      )}
    </>
  )
}
