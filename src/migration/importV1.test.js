import { describe, it, expect } from 'vitest'
import {
  importV1,
  categoryForServiceName,
  toBusinessDate,
  reconstructLineItems,
  normalizeStops,
  transformComplianceLogs,
} from './importV1.js'
import { summarizeV2, parityCheck } from './parityCheck.js'

describe('importV1 helpers', () => {
  it('categoryForServiceName re-derives coarse categories', () => {
    expect(categoryForServiceName('Weekly Mow')).toBe('mowing')
    expect(categoryForServiceName('Round 3 Fertilizer')).toBe('fertilizer')
    expect(categoryForServiceName('Pre-Emergent')).toBe('fertilizer')
    expect(categoryForServiceName('Leaf Cleanup')).toBe('cleanup')
    expect(categoryForServiceName('Consulting')).toBe('other')
  })

  it('toBusinessDate normalizes UTC ISO / epoch / already-bd', () => {
    expect(toBusinessDate('2026-07-14')).toBe('2026-07-14')
    expect(toBusinessDate(new Date(2026, 6, 14, 10).getTime())).toBe('2026-07-14')
    expect(toBusinessDate(null)).toBeNull()
  })

  it('reconstructLineItems: explicit stays exact, total-only becomes estimated', () => {
    const exact = reconstructLineItems(
      { services: [{ serviceId: 'm', name: 'Mow', price: 40 }] },
      { m: { id: 'm', name: 'Mow', category: 'mowing' } },
    )
    expect(exact.attribution).toBe('exact')
    expect(exact.items[0].priceCents).toBe(4000)
    expect(exact.items[0].category).toBe('mowing')

    const est = reconstructLineItems({ total: 55, serviceName: 'Mow' }, {})
    expect(est.attribution).toBe('estimated')
    expect(est.items[0].priceCents).toBe(5500)
  })

  it('normalizeStops upgrades legacy id-only stops', () => {
    const stops = normalizeStops(['c1', { customerId: 'c2', plannedServiceIds: ['s'] }])
    expect(stops[0]).toMatchObject({ customerId: 'c1', order: 0, plannedServiceIds: [] })
    expect(stops[1]).toMatchObject({ customerId: 'c2', order: 1, plannedServiceIds: ['s'] })
  })

  it('single-product compliance log becomes products[]', () => {
    const [log] = transformComplianceLogs([
      { id: 'l1', visitId: 'v1', productName: 'Weed-B-Gon', epaRegNum: '123-45', date: '2026-07-01' },
    ])
    expect(Array.isArray(log.products)).toBe(true)
    expect(log.products[0].productName).toBe('Weed-B-Gon')
    expect(log.products[0].epaRegNum).toBe('123-45')
  })
})

describe('importV1 full dump + parity', () => {
  const v1 = {
    services: [
      { id: 'm', name: 'Mow', price: 40 },
      { id: 'f', name: 'Fertilizer Round 3', price: 60 },
    ],
    customers: [
      { id: 'c1', name: 'Alice', lawnSize: '8000', createdAt: 1 },
      { id: 'c2', name: 'Bob', lawnSize: 'back', createdAt: 2 }, // triggers review
    ],
    visits: [
      {
        id: 'v1',
        customerId: 'c1',
        date: '2026-07-01',
        status: 'completed',
        services: [{ serviceId: 'm', name: 'Mow', price: 40 }],
      },
      {
        id: 'v2',
        customerId: 'c1',
        date: '2026-07-08',
        status: 'completed',
        services: [
          { serviceId: 'm', name: 'Mow', price: 40 },
          { serviceId: 'f', name: 'Fertilizer Round 3', price: 60 },
        ],
      },
      {
        id: 'v3',
        customerId: 'c2',
        date: '2026-07-02',
        status: 'completed',
        total: 45, // only a total → estimated
      },
      { id: 'v4', customerId: 'c2', date: '2026-07-09', status: 'skipped', total: 45 },
    ],
  }

  it('transforms a dump and flags unparseable lawn size', () => {
    const { stores, review } = importV1(v1)
    expect(stores.services).toHaveLength(2)
    expect(stores.customers.find((c) => c.id === 'c1').lawnSqFt).toBe(8000)
    // Bob's "back" is flagged, not turned into acres (v1 bug fixed)
    expect(stores.customers.find((c) => c.id === 'c2').lawnSqFt).toBeNull()
    expect(review.some((r) => r.id === 'c2' && r.field === 'lawnSqFt')).toBe(true)

    const v3 = stores.visits.find((v) => v.id === 'v3')
    expect(v3.attribution).toBe('estimated')
  })

  it('parity check passes when v2 aggregates match v1 History numbers', () => {
    const { stores } = importV1(v1)
    const v2summary = summarizeV2(stores.visits)

    // v1 History all-time: completed = v1(4000)+v2(10000)+v3(4500) = 18500;
    // 3 completed visits; per customer c1=14000, c2=4500 (v4 skipped).
    const v1expected = {
      totalRevenueCents: 18_500,
      completedVisits: 3,
      perCustomerCents: { c1: 14_000, c2: 4_500 },
    }
    const result = parityCheck(v2summary, v1expected)
    expect(result.ok).toBe(true)
    expect(result.diffs).toEqual([])
  })

  it('parity check reports diffs when numbers disagree', () => {
    const { stores } = importV1(v1)
    const v2summary = summarizeV2(stores.visits)
    const bad = { totalRevenueCents: 99_999, completedVisits: 3, perCustomerCents: { c1: 14_000, c2: 4_500 } }
    const result = parityCheck(v2summary, bad)
    expect(result.ok).toBe(false)
    expect(result.diffs[0].metric).toBe('totalRevenueCents')
  })
})
