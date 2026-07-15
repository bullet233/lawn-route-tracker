import { describe, it, expect } from 'vitest'
import { estimateRouteRemaining, averageVisitSecs, ROAD_FACTOR, AVG_DRIVE_SPEED_MPS } from './routeEta.js'

// model y = 1 * x^1 → predicted secs == lawnSqFt (flat terrain multiplier = 1)
const model = { a: 1, b: 1, n: 5, r2: 0.9 }

const customersById = {
  a: { id: 'a', lawnSqFt: 1200, terrain: 'flat' }, // → 1200s = 20 min
  b: { id: 'b', lawnSqFt: 600, terrain: 'flat' }, // → 600s = 10 min
  c: { id: 'c', lawnSqFt: null }, // model can't predict → fallback
}

const loc = (lng) => ({ lat: 0, lng })

describe('estimateRouteRemaining', () => {
  it('sums model-predicted job time for remaining stops only', () => {
    const stops = [
      { id: 'a', done: true, location: loc(0) },
      { id: 'b', done: false, location: null },
    ]
    const eta = estimateRouteRemaining({ stops, customersById, model })
    expect(eta.remainingStops).toBe(1)
    expect(eta.jobSecs).toBe(600) // only b; a is done
    expect(eta.perStopJobSecs).toEqual({ b: 600 })
  })

  it('falls back when the model cannot predict a stop', () => {
    const stops = [{ id: 'c', done: false, location: null }]
    const eta = estimateRouteRemaining({ stops, customersById, model, fallbackJobSecs: 900 })
    expect(eta.jobSecs).toBe(900)
  })

  it('subtracts elapsed time on the active stop, floored at zero', () => {
    const stops = [{ id: 'a', done: false, location: null }]
    const partial = estimateRouteRemaining({
      stops, customersById, model, activeCustomerId: 'a', activeElapsedSecs: 500,
    })
    expect(partial.jobSecs).toBe(700) // 1200 - 500
    const over = estimateRouteRemaining({
      stops, customersById, model, activeCustomerId: 'a', activeElapsedSecs: 5000,
    })
    expect(over.jobSecs).toBe(0)
  })

  it('estimates drive time across located remaining stops from the current fix', () => {
    // 0.01° of longitude at the equator ≈ 1113 m per leg, two legs
    const stops = [
      { id: 'a', done: false, location: loc(0.01) },
      { id: 'b', done: false, location: loc(0.02) },
    ]
    const eta = estimateRouteRemaining({ stops, customersById, model, currentPos: loc(0) })
    const expected = Math.round((2 * 1113 * ROAD_FACTOR) / AVG_DRIVE_SPEED_MPS)
    expect(Math.abs(eta.driveSecs - expected)).toBeLessThan(5)
    expect(eta.totalSecs).toBe(eta.jobSecs + eta.driveSecs)
  })

  it('handles no remaining stops and no fix', () => {
    const eta = estimateRouteRemaining({ stops: [{ id: 'a', done: true, location: loc(0) }], customersById, model })
    expect(eta).toMatchObject({ remainingStops: 0, jobSecs: 0, driveSecs: 0, totalSecs: 0 })
  })
})

describe('averageVisitSecs', () => {
  it('averages completed timed visits, defaults otherwise', () => {
    expect(
      averageVisitSecs([
        { status: 'completed', durationSecs: 600 },
        { status: 'completed', durationSecs: 1200 },
        { status: 'skipped', durationSecs: 999 },
        { status: 'completed', durationSecs: 0 },
      ]),
    ).toBe(900)
    expect(averageVisitSecs([], 777)).toBe(777)
  })
})
