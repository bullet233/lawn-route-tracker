import { describe, it, expect } from 'vitest'
import { filterByCategory, groupByDate, summarize, dayTotals, monthGrid } from './history.js'

const mow = { serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: 4000 }
const fert = { serviceId: 'f', name: 'Fert', category: 'fertilizer', priceCents: 6000 }

const visits = [
  { id: '1', businessDate: '2026-07-14', status: 'completed', durationSecs: 1800, driveTimeSecs: 300, lineItems: [mow] },
  { id: '2', businessDate: '2026-07-14', status: 'completed', durationSecs: 1200, driveTimeSecs: 200, lineItems: [fert] },
  { id: '3', businessDate: '2026-07-10', status: 'completed', durationSecs: 900, driveTimeSecs: 100, lineItems: [mow, fert] },
]

describe('history', () => {
  it('filterByCategory', () => {
    expect(filterByCategory(visits, 'all')).toHaveLength(3)
    expect(filterByCategory(visits, 'mowing').map((v) => v.id)).toEqual(['1', '3'])
    expect(filterByCategory(visits, 'fertilizer').map((v) => v.id)).toEqual(['2', '3'])
  })

  it('groupByDate newest first', () => {
    const g = groupByDate(visits)
    expect(g.map((d) => d.date)).toEqual(['2026-07-14', '2026-07-10'])
    expect(g[0].visits).toHaveLength(2)
  })

  it('dayTotals aggregates count + revenue per day', () => {
    const d = dayTotals(visits)
    expect(d['2026-07-14']).toEqual({ count: 2, cents: 10000 })
    expect(d['2026-07-10']).toEqual({ count: 1, cents: 10000 })
  })

  it('monthGrid lays out weeks of 7 with correct day count', () => {
    const weeks = monthGrid(2026, 7) // July 2026, 31 days, starts Wednesday
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    const days = weeks.flat().filter(Boolean)
    expect(days).toHaveLength(31)
    expect(days[0]).toBe('2026-07-01')
    expect(days[30]).toBe('2026-07-31')
  })

  it('summarize totals', () => {
    const s = summarize(visits)
    expect(s.visitCount).toBe(3)
    expect(s.revenueCents).toBe(4000 + 6000 + 10000)
    expect(s.jobSecs).toBe(1800 + 1200 + 900)
    expect(s.jobPlusDriveSecs).toBe(1800 + 1200 + 900 + 300 + 200 + 100)
    expect(s.byService.m.count).toBe(2)
  })
})
