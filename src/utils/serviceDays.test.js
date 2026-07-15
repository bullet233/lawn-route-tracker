import { describe, it, expect } from 'vitest'
import { WEEKDAYS, weekdayLabel, weekdayShort, isWeekday, customersForDay, countByDay } from './serviceDays.js'

describe('serviceDays', () => {
  it('exposes all seven days Sun–Sat', () => {
    expect(WEEKDAYS.map((d) => d.short)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('labels a weekday value', () => {
    expect(weekdayLabel(2)).toBe('Tuesday')
    expect(weekdayShort(6)).toBe('Sat')
  })

  it('returns empty string for an unset/invalid day', () => {
    expect(weekdayLabel(null)).toBe('')
    expect(weekdayShort(9)).toBe('')
  })

  it('validates the 0–6 range', () => {
    expect(isWeekday(0)).toBe(true)
    expect(isWeekday(6)).toBe(true)
    expect(isWeekday(7)).toBe(false)
    expect(isWeekday(null)).toBe(false)
    expect(isWeekday(2.5)).toBe(false)
  })

  const customers = [
    { id: 'a', serviceDay: 1 },
    { id: 'b', serviceDay: 2 },
    { id: 'c', serviceDay: 1 },
    { id: 'd', serviceDay: null },
    { id: 'e' },
  ]

  it('filters customers by assigned day, preserving order', () => {
    expect(customersForDay(customers, 1).map((c) => c.id)).toEqual(['a', 'c'])
    expect(customersForDay(customers, 2).map((c) => c.id)).toEqual(['b'])
    expect(customersForDay(customers, 5)).toEqual([])
  })

  it('returns empty for an invalid day filter', () => {
    expect(customersForDay(customers, null)).toEqual([])
  })

  it('counts assigned customers per weekday, ignoring unassigned', () => {
    expect(countByDay(customers)).toEqual({ 1: 2, 2: 1 })
  })
})
