import { describe, it, expect } from 'vitest'
import { formatClock, formatMinutes } from './format.js'

describe('format', () => {
  it('formatClock M:SS and H:MM:SS', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(63)).toBe('1:03')
    expect(formatClock(3661)).toBe('1:01:01')
    expect(formatClock(-5)).toBe('0:00')
  })
  it('formatMinutes', () => {
    expect(formatMinutes(120)).toBe('2m')
    expect(formatMinutes(3900)).toBe('1h 5m')
  })
})
