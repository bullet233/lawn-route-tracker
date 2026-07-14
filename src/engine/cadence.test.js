import { describe, it, expect } from 'vitest'
import { mowingDueItems, onHold } from './mowingCadence.js'
import { treatmentDueItems, classifyTreatment } from './treatmentCadence.js'
import { buildDueList, doubleUpCustomerIds } from './dueList.js'

const TODAY = '2026-07-14'

const mowCust = (id, intervalDays, extra = {}) => ({
  id,
  mowingIntervalDays: intervalDays,
  ...extra,
})

describe('mowing cadence', () => {
  it('due when interval elapsed; priority = days overdue', () => {
    const customers = [mowCust('a', 7)]
    const items = mowingDueItems({
      customers,
      lastMowByCustomerId: { a: '2026-07-01' }, // due 07-08, so 6 days overdue
      today: TODAY,
    })
    expect(items).toHaveLength(1)
    expect(items[0].engine).toBe('mowing')
    expect(items[0].priority).toBe(6)
  })

  it('not due yet is omitted', () => {
    const items = mowingDueItems({
      customers: [mowCust('a', 7)],
      lastMowByCustomerId: { a: '2026-07-12' }, // due 07-19
      today: TODAY,
    })
    expect(items).toHaveLength(0)
  })

  it('never-mowed customer is due now at priority 0', () => {
    const items = mowingDueItems({ customers: [mowCust('a', 7)], today: TODAY })
    expect(items[0].priority).toBe(0)
    expect(items[0].reason).toBe('never mowed')
  })

  it('vacation hold hides the customer', () => {
    const customers = [mowCust('a', 7, { holdUntil: '2026-08-01' })]
    const items = mowingDueItems({
      customers,
      lastMowByCustomerId: { a: '2026-07-01' },
      today: TODAY,
    })
    expect(items).toHaveLength(0)
    expect(onHold(customers[0], TODAY)).toBe(true)
    expect(onHold(customers[0], '2026-08-02')).toBe(false)
  })

  it('customers without an interval are never mowing-due', () => {
    const items = mowingDueItems({ customers: [{ id: 'x' }], today: TODAY })
    expect(items).toHaveLength(0)
  })
})

describe('treatment cadence', () => {
  const t = (over) => ({
    id: 't1',
    customerId: 'a',
    status: 'scheduled',
    windowStart: '2026-07-01',
    windowEnd: '2026-07-20',
    ...over,
  })

  it('classifyTreatment window states', () => {
    expect(classifyTreatment(t(), '2026-06-30')).toBe('not-open')
    expect(classifyTreatment(t(), '2026-07-10')).toBe('in-window')
    expect(classifyTreatment(t(), '2026-07-21')).toBe('overdue')
    expect(classifyTreatment(t({ status: 'completed' }), '2026-07-10')).toBe('completed')
    expect(classifyTreatment(t({ status: 'skipped' }), '2026-07-10')).toBe('skipped')
  })

  it('emits only in-window / overdue; completed & skipped never emit', () => {
    const treatments = [t(), t({ id: 't2', status: 'completed' }), t({ id: 't3', status: 'skipped' })]
    const items = treatmentDueItems({ treatments, today: TODAY })
    expect(items).toHaveLength(1)
    expect(items[0].meta.treatmentId).toBe('t1')
  })

  it('priority rises as the window closes and passes', () => {
    const early = treatmentDueItems({ treatments: [t()], today: '2026-07-05' })[0].priority
    const late = treatmentDueItems({ treatments: [t()], today: '2026-07-18' })[0].priority
    const past = treatmentDueItems({ treatments: [t()], today: '2026-07-25' })[0].priority
    expect(late).toBeGreaterThan(early)
    expect(past).toBeGreaterThan(late)
  })

  it('respects vacation hold via customersById', () => {
    const items = treatmentDueItems({
      treatments: [t()],
      customersById: { a: { id: 'a', holdUntil: '2026-08-01' } },
      today: TODAY,
    })
    expect(items).toHaveLength(0)
  })
})

describe('merged due list', () => {
  it('crossover: a mow 3d overdue and a treatment with 3d window left rank similarly', () => {
    // mow: last 07-04, interval 7 -> due 07-11 -> 3 days overdue on 07-14
    const mowP = mowingDueItems({
      customers: [mowCust('m', 7)],
      lastMowByCustomerId: { m: '2026-07-04' },
      today: TODAY,
    })[0].priority
    // treatment: window ends 07-17 -> 3 days left on 07-14
    const treatP = treatmentDueItems({
      treatments: [{ id: 't', customerId: 't', status: 'scheduled', windowStart: '2026-06-20', windowEnd: '2026-07-17' }],
      today: TODAY,
    })[0].priority
    expect(mowP).toBe(3)
    expect(treatP).toBe(3) // CROSSOVER(6) - daysLeft(3) = 3, matches the mow
  })

  it('sorts most-urgent first and finds double-ups', () => {
    const customers = [mowCust('a', 7)]
    const list = buildDueList({
      customers,
      lastMowByCustomerId: { a: '2026-07-01' }, // 6d overdue
      treatments: [
        { id: 't', customerId: 'a', status: 'scheduled', windowStart: '2026-07-01', windowEnd: '2026-07-16' },
      ],
      customersById: { a: customers[0] },
      today: TODAY,
    })
    expect(list.length).toBe(2)
    // most urgent (higher priority) first
    expect(list[0].priority).toBeGreaterThanOrEqual(list[1].priority)
    expect(doubleUpCustomerIds(list).has('a')).toBe(true)
  })
})
