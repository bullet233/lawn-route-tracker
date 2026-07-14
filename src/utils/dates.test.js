import { describe, it, expect } from 'vitest'
import {
  businessDate,
  parseBusinessDate,
  daysBetween,
  addDays,
  compareBusinessDate,
  yearOf,
} from './dates.js'

describe('dates / businessDate', () => {
  it('businessDate uses LOCAL calendar fields', () => {
    // Construct a local date explicitly, round-trip it.
    const d = new Date(2026, 6, 14, 21, 30) // Jul 14 2026 9:30pm local
    expect(businessDate(d)).toBe('2026-07-14')
  })

  it('an evening timestamp stays on its local day (v1 UTC bug guard)', () => {
    // 11:30pm local on the 14th must not roll to the 15th.
    const late = new Date(2026, 6, 14, 23, 30)
    expect(businessDate(late)).toBe('2026-07-14')
  })

  it('parseBusinessDate builds local midnight', () => {
    const d = parseBusinessDate('2026-07-14')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(14)
    expect(d.getHours()).toBe(0)
  })

  it('daysBetween is DST-safe across a spring-forward boundary', () => {
    // US DST 2026 begins Mar 8. Span it.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-03-08', '2026-03-08')).toBe(0)
    expect(daysBetween('2026-07-14', '2026-07-01')).toBe(-13)
  })

  it('addDays crosses month + DST', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02')
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('compareBusinessDate + yearOf', () => {
    expect(compareBusinessDate('2026-01-01', '2026-07-01')).toBe(-1)
    expect(compareBusinessDate('2026-07-01', '2026-07-01')).toBe(0)
    expect(yearOf('2026-07-14')).toBe(2026)
  })
})
