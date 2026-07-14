import { describe, it, expect } from 'vitest'
import { lineItemFor, needsComplianceLog, dayRevenueCents, dayMiles, orderVisits } from './dayReview.js'

const mowSvc = { id: 'm', name: 'Mow', category: 'mowing', defaultPriceCents: 4000, requiresComplianceLog: false }
const fertSvc = { id: 'f', name: 'Fert', category: 'fertilizer', defaultPriceCents: 6000, requiresComplianceLog: true }
const servicesById = { m: mowSvc, f: fertSvc }

describe('dayReview helpers', () => {
  it('lineItemFor resolves price with customer override', () => {
    const plain = lineItemFor(mowSvc, { serviceOverrides: {} })
    expect(plain.priceCents).toBe(4000)
    const overridden = lineItemFor(mowSvc, { serviceOverrides: { m: { priceCents: 3500 } } })
    expect(overridden.priceCents).toBe(3500)
  })

  it('needsComplianceLog detects fertilizer service', () => {
    expect(needsComplianceLog([{ serviceId: 'm' }], servicesById)).toBe(false)
    expect(needsComplianceLog([{ serviceId: 'm' }, { serviceId: 'f' }], servicesById)).toBe(true)
  })

  it('dayRevenueCents sums completed only', () => {
    const visits = [
      { status: 'completed', lineItems: [{ priceCents: 4000 }] },
      { status: 'completed', lineItems: [{ priceCents: 6000 }], addOns: [{ priceCents: 500 }] },
      { status: 'skipped', lineItems: [{ priceCents: 9999 }] },
    ]
    expect(dayRevenueCents(visits)).toBe(10500)
  })

  it('dayMiles is straight-line distance over located customers', () => {
    const visits = [
      { customerId: 'a', entryTime: 1 },
      { customerId: 'b', entryTime: 2 },
    ]
    const customersById = {
      a: { location: { lat: 40, lng: -75 } },
      b: { location: { lat: 40.1, lng: -75 } },
    }
    const miles = dayMiles(visits, customersById)
    expect(miles).toBeGreaterThan(6) // ~6.9 mi per 0.1 deg lat
    expect(miles).toBeLessThan(8)
    // a customer with no location is skipped, not zeroed
    expect(dayMiles(visits, { a: customersById.a, b: {} })).toBe(0)
  })

  it('orderVisits sorts by entryTime, nulls last', () => {
    const r = orderVisits([{ id: 1, entryTime: 200 }, { id: 2, entryTime: null }, { id: 3, entryTime: 100 }])
    expect(r.map((v) => v.id)).toEqual([3, 1, 2])
  })
})
