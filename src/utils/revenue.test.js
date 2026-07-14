import { describe, it, expect } from 'vitest'
import {
  visitRevenueCents,
  isFertilizerVisit,
  isMowingVisit,
  isModelEligibleMowingVisit,
  revenueByCategory,
  revenueByService,
  totalRevenueCents,
  mowerSecondsForVisit,
} from './revenue.js'

const mowLine = { serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: 4000 }
const fertLine = { serviceId: 'f', name: 'Round 3', category: 'fertilizer', priceCents: 6000 }

const gpsMow = {
  status: 'completed',
  source: 'gps',
  durationSecs: 1800,
  lineItems: [mowLine],
}
const mixed = {
  status: 'completed',
  source: 'gps',
  durationSecs: 2400,
  lineItems: [mowLine, fertLine],
  addOns: [{ name: 'Tip', priceCents: 500 }],
}
const splitVisit = { status: 'completed', source: 'split', durationSecs: 900, lineItems: [mowLine] }

describe('revenue derivation', () => {
  it('visit revenue sums line items + add-ons', () => {
    expect(visitRevenueCents(gpsMow)).toBe(4000)
    expect(visitRevenueCents(mixed)).toBe(4000 + 6000 + 500)
  })

  it('category predicates', () => {
    expect(isMowingVisit(gpsMow)).toBe(true)
    expect(isFertilizerVisit(gpsMow)).toBe(false)
    expect(isFertilizerVisit(mixed)).toBe(true)
    expect(isMowingVisit(mixed)).toBe(true)
  })

  it('model eligibility excludes mixed and split visits', () => {
    expect(isModelEligibleMowingVisit(gpsMow)).toBe(true)
    expect(isModelEligibleMowingVisit(mixed)).toBe(false) // has fert line item
    expect(isModelEligibleMowingVisit(splitVisit)).toBe(false) // source split
  })

  it('revenueByCategory splits mixed visits without double count', () => {
    const r = revenueByCategory([mixed])
    expect(r.mowing).toBe(4000)
    expect(r.fertilizer).toBe(6000)
    expect(r.addOn).toBe(500)
  })

  it('revenueByService groups with counts', () => {
    const r = revenueByService([gpsMow, mixed])
    expect(r.m.cents).toBe(8000)
    expect(r.m.count).toBe(2)
    expect(r.f.cents).toBe(6000)
  })

  it('totalRevenue ignores skipped', () => {
    const skipped = { status: 'skipped', lineItems: [mowLine] }
    expect(totalRevenueCents([gpsMow, mixed, skipped])).toBe(4000 + 10500)
  })

  it('mower seconds only count mowing visits', () => {
    expect(mowerSecondsForVisit(gpsMow)).toBe(1800)
    expect(mowerSecondsForVisit(mixed)).toBe(2400) // mixed counts fully
    const fertOnly = { status: 'completed', durationSecs: 1200, lineItems: [fertLine] }
    expect(mowerSecondsForVisit(fertOnly)).toBe(0)
  })
})
