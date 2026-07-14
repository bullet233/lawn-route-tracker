import { describe, it, expect } from 'vitest'
import { customerStats } from './customerStats.js'

const mow = (price = 4000) => ({ serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: price })
const fert = { serviceId: 'f', name: 'Fert', category: 'fertilizer', priceCents: 6000 }

// three mows 7 days apart, one 900s, one 1200s, one skipped-out fertilizer
const visits = [
  { id: '1', businessDate: '2026-06-30', status: 'completed', source: 'gps', durationSecs: 900, lineItems: [mow()] },
  { id: '2', businessDate: '2026-07-07', status: 'completed', source: 'gps', durationSecs: 1200, lineItems: [mow()] },
  { id: '3', businessDate: '2026-07-14', status: 'completed', source: 'gps', durationSecs: 1800, lineItems: [mow(), fert] },
  { id: '4', businessDate: '2026-05-01', status: 'skipped', lineItems: [] },
]

const customer = { id: 'c1', mowingIntervalDays: 7, lawnSqFt: 8000, terrain: 'flat' }

describe('customerStats', () => {
  const s = customerStats({
    visits,
    customer,
    model: null,
    targetHourlyRateCents: 10000,
    mowPriceCents: 4000,
    today: '2026-07-16',
  })

  it('counts only completed visits', () => {
    expect(s.completedCount).toBe(3)
  })

  it('pools $/hr across timed visits', () => {
    // revenue: 4000 + 4000 + (4000+6000) = 18000 cents over 3900s
    // 18000/3900*3600 = 16615 cents/hr
    expect(s.effHourlyCents).toBe(16615)
  })

  it('averages revenue per visit and mow time', () => {
    expect(s.revenueLifetimeCents).toBe(18000)
    expect(s.avgRevenuePerVisitCents).toBe(6000)
    expect(s.avgMowMinutes).toBe(Math.round(((900 + 1200 + 1800) / 3 / 60))) // 22
  })

  it('computes actual average mow interval and next-due', () => {
    expect(s.actualAvgIntervalDays).toBe(7) // 6-30 → 7-07 → 7-14
    expect(s.lastMowDate).toBe('2026-07-14')
    expect(s.daysSinceLastMow).toBe(2)
    expect(s.nextDueDate).toBe('2026-07-21')
    expect(s.overdueDays).toBe(-5) // due in 5 days
  })

  it('splits revenue by category', () => {
    expect(s.byCategory).toEqual({ mowing: 12000, fertilizer: 6000 })
  })

  it('leaves model-dependent stats null without a model', () => {
    expect(s.hasModel).toBe(false)
    expect(s.predictedMowMinutes).toBe(null)
    expect(s.suggestedMowPriceCents).toBe(null)
  })

  it('fills predicted time + suggested price with a model', () => {
    // a=1, b=1 → predict(secs)=lawnSqFt; 8000s→133.3min; flat difficulty=1
    const withModel = customerStats({
      visits,
      customer,
      model: { a: 1, b: 1, n: 5, r2: 0.9 },
      targetHourlyRateCents: 10000,
      today: '2026-07-16',
    })
    expect(withModel.hasModel).toBe(true)
    expect(withModel.predictedMowMinutes).toBe(133) // 8000/60
    // 133.33 min / 60 * $100 = ~$222
    expect(withModel.suggestedMowPriceCents).toBe(22222)
  })

  it('handles a customer with no visits', () => {
    const empty = customerStats({ visits: [], customer, targetHourlyRateCents: 10000, today: '2026-07-16' })
    expect(empty.completedCount).toBe(0)
    expect(empty.effHourlyCents).toBe(null)
    expect(empty.actualAvgIntervalDays).toBe(null)
    expect(empty.lastMowDate).toBe(null)
    expect(empty.byCategory).toEqual({})
  })
})
