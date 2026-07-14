import { describe, it, expect } from 'vitest'
import { gpsHealthLevel } from './gpsHealth.js'

describe('gpsHealthLevel', () => {
  it('green when fresh and accurate', () => {
    expect(gpsHealthLevel(4, 5)).toBe('green')
    expect(gpsHealthLevel(0, 10)).toBe('green')
  })
  it('amber when aging or degraded accuracy', () => {
    expect(gpsHealthLevel(30, 5)).toBe('amber')
    expect(gpsHealthLevel(4, 50)).toBe('amber') // accuracy worse than 30m
  })
  it('red when stale or missing', () => {
    expect(gpsHealthLevel(90, 5)).toBe('red')
    expect(gpsHealthLevel(null, 5)).toBe('red')
  })
})
