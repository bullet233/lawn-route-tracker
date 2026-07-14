import { describe, it, expect } from 'vitest'
import { computeLastMowByCustomer, indexById, mowingEligibleCustomers } from './dueSelectors.js'

const mow = { serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: 4000 }
const fert = { serviceId: 'f', name: 'Fert', category: 'fertilizer', priceCents: 6000 }

describe('dueSelectors', () => {
  it('computeLastMowByCustomer takes the latest completed mowing visit', () => {
    const visits = [
      { customerId: 'a', status: 'completed', businessDate: '2026-07-01', lineItems: [mow] },
      { customerId: 'a', status: 'completed', businessDate: '2026-07-08', lineItems: [mow] },
      { customerId: 'a', status: 'completed', businessDate: '2026-07-10', lineItems: [fert] }, // not mowing
      { customerId: 'b', status: 'skipped', businessDate: '2026-07-09', lineItems: [mow] }, // skipped
    ]
    const map = computeLastMowByCustomer(visits)
    expect(map.a).toBe('2026-07-08')
    expect(map.b).toBeUndefined()
  })

  it('indexById', () => {
    expect(indexById([{ id: 'x', name: 'X' }]).x.name).toBe('X')
  })

  it('mowingEligibleCustomers filters on interval', () => {
    const cs = [{ id: 'a', mowingIntervalDays: 7 }, { id: 'b', mowingIntervalDays: null }, { id: 'c' }]
    expect(mowingEligibleCustomers(cs).map((c) => c.id)).toEqual(['a'])
  })
})
