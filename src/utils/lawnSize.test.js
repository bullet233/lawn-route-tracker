import { describe, it, expect } from 'vitest'
import { parseLawnSize } from './lawnSize.js'

describe('parseLawnSize', () => {
  it('parses bare square footage', () => {
    const r = parseLawnSize('12500')
    expect(r.sqFt).toBe(12500)
    expect(r.needsReview).toBe(false)
  })

  it('parses commas and "k" shorthand', () => {
    expect(parseLawnSize('12,500').sqFt).toBe(12500)
    expect(parseLawnSize('12k').sqFt).toBe(12000)
  })

  it('parses explicit acres', () => {
    expect(parseLawnSize('1.5 acres').sqFt).toBe(Math.round(1.5 * 43560))
    expect(parseLawnSize('2 ac').sqFt).toBe(87120)
  })

  it('FIXES the v1 "ac" substring bug', () => {
    // "back" contains "ac" but is NOT acres — must flag, not multiply.
    const r = parseLawnSize('back')
    expect(r.sqFt).toBeNull()
    expect(r.needsReview).toBe(true)

    // "vacant lot" likewise must not become acres.
    const r2 = parseLawnSize('vacant lot')
    expect(r2.sqFt).toBeNull()
    expect(r2.needsReview).toBe(true)
  })

  it('flags numeric-with-unparseable-trailing text for review', () => {
    const r = parseLawnSize('5000 front only')
    expect(r.sqFt).toBe(5000)
    expect(r.needsReview).toBe(true)
  })

  it('flags implausibly small bare numbers (likely acres/typo)', () => {
    const r = parseLawnSize('2')
    expect(r.needsReview).toBe(true)
  })

  it('handles numbers and empties', () => {
    expect(parseLawnSize(8000).sqFt).toBe(8000)
    expect(parseLawnSize('').sqFt).toBeNull()
    expect(parseLawnSize(null).sqFt).toBeNull()
  })
})
