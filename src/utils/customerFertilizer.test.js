import { describe, it, expect } from 'vitest'
import { shapeCustomerFertilizer } from './customerFertilizer.js'

const mow = { serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: 4000 }
const fert = { serviceId: 'f', name: 'Fertilizer Round', category: 'fertilizer', priceCents: 6000 }

const visits = [
  { id: 'v1', businessDate: '2026-04-09', status: 'completed', lineItems: [fert] },
  { id: 'v2', businessDate: '2026-05-28', status: 'completed', lineItems: [mow, fert] },
  { id: 'v3', businessDate: '2026-06-01', status: 'completed', lineItems: [mow] }, // not fertilizer
  { id: 'v4', businessDate: '2026-06-15', status: 'skipped', lineItems: [fert] }, // skipped
]

const logs = [
  {
    id: 'l1',
    visitId: 'v1',
    customerId: 'c1',
    products: [{ productName: 'Lesco 24-0-11', epaRegNum: '123-45' }],
  },
]

describe('shapeCustomerFertilizer', () => {
  const s = shapeCustomerFertilizer(visits, logs)

  it('lists only completed fertilizer applications, newest first', () => {
    expect(s.applications.map((a) => a.visit.id)).toEqual(['v2', 'v1'])
    expect(s.count).toBe(2)
  })

  it('joins logs and flags missing ones', () => {
    expect(s.withLog).toBe(1) // v1 has a log
    expect(s.missing).toBe(1) // v2 does not
    expect(s.applications.find((a) => a.visit.id === 'v1').log.id).toBe('l1')
    expect(s.applications.find((a) => a.visit.id === 'v2').log).toBe(null)
  })

  it('exposes only the fertilizer line items per application', () => {
    const v2 = s.applications.find((a) => a.visit.id === 'v2')
    expect(v2.items).toEqual([fert]) // mow filtered out
  })

  it('rolls up distinct products', () => {
    expect(s.products).toEqual([{ productName: 'Lesco 24-0-11', epaRegNum: '123-45', count: 1 }])
  })

  it('handles no applications', () => {
    const empty = shapeCustomerFertilizer([{ id: 'x', status: 'completed', lineItems: [mow] }], [])
    expect(empty.count).toBe(0)
    expect(empty.missing).toBe(0)
    expect(empty.products).toEqual([])
  })
})
