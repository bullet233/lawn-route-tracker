import { describe, it, expect } from 'vitest'
import {
  dollarsToCents,
  centsToDollars,
  parsePriceToCents,
  formatCents,
  sumCents,
} from './money.js'

describe('money', () => {
  it('dollarsToCents rounds half-away and handles junk', () => {
    expect(dollarsToCents(40)).toBe(4000)
    expect(dollarsToCents(40.005)).toBe(4001) // round up
    expect(dollarsToCents(1.005)).toBe(101)
    expect(dollarsToCents(null)).toBe(0)
    expect(dollarsToCents('abc')).toBe(0)
  })

  it('cents<->dollars round-trip stays integer-exact', () => {
    for (const c of [0, 1, 99, 4000, 125_50, 999_999]) {
      expect(dollarsToCents(centsToDollars(c))).toBe(c)
    }
  })

  it('parsePriceToCents strips symbols and commas', () => {
    expect(parsePriceToCents('$1,250.50')).toBe(125_050)
    expect(parsePriceToCents('40')).toBe(4000)
    expect(parsePriceToCents('')).toBe(0)
    expect(parsePriceToCents('.')).toBe(0)
    expect(parsePriceToCents(40.25)).toBe(4025)
  })

  it('formatCents formats with grouping and sign', () => {
    expect(formatCents(125_050)).toBe('$1,250.50')
    expect(formatCents(4000)).toBe('$40.00')
    expect(formatCents(-500)).toBe('-$5.00')
    expect(formatCents(125_050, { withSymbol: false })).toBe('1,250.50')
    expect(formatCents(125_050, { cents: false })).toBe('$1,250')
  })

  it('sumCents adds line items and raw numbers', () => {
    expect(sumCents([{ priceCents: 4000 }, { priceCents: 2500 }])).toBe(6500)
    expect(sumCents([100, 200, 300])).toBe(600)
    expect(sumCents(null)).toBe(0)
  })
})
