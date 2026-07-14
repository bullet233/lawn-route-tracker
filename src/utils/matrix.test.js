import { describe, it, expect } from 'vitest'
import {
  difficultyMultiplier,
  fitPowerModel,
  predict,
  predictMowMinutes,
  pricingMatrix,
  effectiveHourlyCents,
} from './matrix.js'

describe('matrix / power model', () => {
  it('difficultyMultiplier is 1.0 for a neutral property', () => {
    expect(difficultyMultiplier({})).toBe(1.0)
    expect(difficultyMultiplier({ terrain: 'flat', obstacleCount: 0 })).toBe(1.0)
    expect(difficultyMultiplier({ terrain: 'hilly' })).toBeGreaterThan(1.2)
    expect(difficultyMultiplier({ fencedBackyard: true })).toBeCloseTo(1.06)
  })

  it('recovers a known power law y = 0.5 * x^0.6', () => {
    const a = 0.5
    const b = 0.6
    const xs = [1000, 3000, 5000, 8000, 12000, 20000]
    const samples = xs.map((x) => ({ x, y: a * Math.pow(x, b) }))
    const m = fitPowerModel(samples)
    expect(m).not.toBeNull()
    expect(m.a).toBeCloseTo(a, 4)
    expect(m.b).toBeCloseTo(b, 4)
    expect(m.r2).toBeCloseTo(1, 6)
    expect(predict(m, 5000)).toBeCloseTo(a * Math.pow(5000, b), 3)
  })

  it('returns null when too few points or no spread', () => {
    expect(fitPowerModel([{ x: 1000, y: 5 }])).toBeNull()
    expect(fitPowerModel([{ x: 100, y: 1 }, { x: 100, y: 2 }, { x: 100, y: 3 }])).toBeNull()
  })

  it('predictMowMinutes applies difficulty on top of the size curve', () => {
    const samples = [1000, 3000, 6000, 10000].map((x) => ({ x, y: x * 0.1 })) // secs
    const m = fitPowerModel(samples)
    const flat = predictMowMinutes(m, { lawnSqFt: 5000, terrain: 'flat' })
    const hilly = predictMowMinutes(m, { lawnSqFt: 5000, terrain: 'hilly' })
    expect(hilly).toBeGreaterThan(flat)
  })

  it('pricingMatrix implies price from target hourly rate', () => {
    const samples = [1000, 4000, 9000].map((x) => ({ x, y: 60 * Math.sqrt(x / 1000) })) // secs
    const m = fitPowerModel(samples)
    const rows = pricingMatrix(m, [4000], 6000) // $60/hr
    expect(rows[0].sqft).toBe(4000)
    expect(rows[0].minutes).toBeGreaterThan(0)
    expect(rows[0].priceCents).toBe(Math.round((rows[0].minutes / 60) * 6000))
  })

  it('effectiveHourlyCents', () => {
    expect(effectiveHourlyCents(4000, 1800)).toBe(8000) // $40 in 30min = $80/hr
    expect(effectiveHourlyCents(4000, 0)).toBeNull()
  })
})
