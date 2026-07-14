import { describe, it, expect } from 'vitest'
import { computeSplitWeights, splitVisit } from './splitVisit.js'

describe('splitVisit', () => {
  it('computeSplitWeights falls back to lawn size, sums to 1', () => {
    const w = computeSplitWeights([{ lawnSqFt: 6000 }, { lawnSqFt: 2000 }], null)
    expect(w[0]).toBeCloseTo(0.75)
    expect(w[1]).toBeCloseTo(0.25)
    expect(w[0] + w[1]).toBeCloseTo(1)
  })

  it('computeSplitWeights equal when no size/model', () => {
    const w = computeSplitWeights([{}, {}], null)
    expect(w).toEqual([0.5, 0.5])
  })

  it('splitVisit apportions duration + drive by weight, stamps source split', () => {
    let n = 0
    const idFn = () => `split_${++n}`
    const visit = { id: 'v1', businessDate: '2026-07-14', durationSecs: 3600, driveTimeSecs: 600, routeId: 'r1' }
    const allocations = [
      { customerId: 'a', weight: 0.75 },
      { customerId: 'b', weight: 0.25 },
    ]
    const lineItemsFor = (id) => [{ serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: id === 'a' ? 5000 : 3000 }]
    const out = splitVisit(visit, allocations, lineItemsFor, idFn)

    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ customerId: 'a', durationSecs: 2700, driveTimeSecs: 450, source: 'split', attribution: 'estimated' })
    expect(out[1]).toMatchObject({ customerId: 'b', durationSecs: 900, driveTimeSecs: 150 })
    expect(out[0].lineItems[0].priceCents).toBe(5000)
    expect(out[0].note).toContain('v1')
  })
})
