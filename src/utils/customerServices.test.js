import { describe, it, expect } from 'vitest'
import { shapeCustomerServices, formatServiceDate, relativeDay } from './customerServices.js'

const mow = { serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: 4000 }
const fert = { serviceId: 'f', name: 'Fert', category: 'fertilizer', priceCents: 6000 }

const visits = [
  { id: '1', businessDate: '2026-07-14', status: 'completed', durationSecs: 1800, lineItems: [mow] },
  { id: '2', businessDate: '2026-07-10', status: 'completed', durationSecs: 900, lineItems: [mow, fert] },
  { id: '3', businessDate: '2026-07-08', status: 'skipped', lineItems: [] },
]

// windows relative to a fixed "today" of 2026-07-14
const treatments = [
  { id: 't1', stepName: 'Summer Fert', windowStart: '2026-06-01', windowEnd: '2026-07-20', status: 'scheduled', dueDate: '2026-07-20' },
  { id: 't2', stepName: 'Winterizer', windowStart: '2026-10-01', windowEnd: '2026-11-15', status: 'scheduled', dueDate: '2026-11-15' },
  { id: 't3', stepName: 'Pre-Emergent', windowStart: '2026-03-01', windowEnd: '2026-04-15', status: 'completed', dueDate: '2026-04-15' },
]

describe('customerServices', () => {
  it('summarizes completed visits only', () => {
    const s = shapeCustomerServices(visits, [], '2026-07-14')
    expect(s.completedCount).toBe(2) // skipped excluded
    expect(s.revenueCents).toBe(14000) // 4000 + (4000+6000)
    expect(s.lastVisitDate).toBe('2026-07-14') // newest, incl. skipped grouping
  })

  it('groups history newest-day first', () => {
    const s = shapeCustomerServices(visits, [], '2026-07-14')
    expect(s.history.map((d) => d.date)).toEqual(['2026-07-14', '2026-07-10', '2026-07-08'])
  })

  it('classifies + orders treatments: due-now, scheduled, done', () => {
    const s = shapeCustomerServices([], treatments, '2026-07-14')
    expect(s.hasTreatments).toBe(true)
    expect(s.treatments.map((t) => t.label)).toEqual(['Due now', 'Scheduled', 'Done'])
    expect(s.treatments[0].id).toBe('t1')
  })

  it('handles empty input', () => {
    const s = shapeCustomerServices([], [], '2026-07-14')
    expect(s.completedCount).toBe(0)
    expect(s.revenueCents).toBe(0)
    expect(s.lastVisitDate).toBe(null)
    expect(s.hasTreatments).toBe(false)
  })

  it('relativeDay reads naturally', () => {
    expect(relativeDay('2026-07-14', '2026-07-14')).toBe('today')
    expect(relativeDay('2026-07-13', '2026-07-14')).toBe('yesterday')
    expect(relativeDay('2026-07-07', '2026-07-14')).toBe('7 days ago')
    expect(relativeDay('2026-07-20', '2026-07-14')).toBe('in 6 days')
  })

  it('formatServiceDate is human-readable', () => {
    expect(formatServiceDate('2026-07-14')).toBe('Jul 14, 2026')
  })
})
