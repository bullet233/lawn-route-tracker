import { describe, it, expect } from 'vitest'
import { matchesQuery, shapeCustomers, customerSubtitle } from './customerView.js'

const custs = [
  { id: '1', name: 'Alice Green', address: '12 Oak St', phone: '555-1111', createdAt: 3, lawnSqFt: 8000 },
  { id: '2', name: 'Bob White', address: '9 Elm Ave', phone: '555-2222', createdAt: 1, lawnSqFt: 12000 },
  { id: '3', name: 'Carol Oak', address: '4 Pine Rd', phone: '555-3333', createdAt: 2, lawnSqFt: null },
]

describe('customerView', () => {
  it('matchesQuery hits name, address, phone; empty matches all', () => {
    expect(matchesQuery(custs[0], '')).toBe(true)
    expect(matchesQuery(custs[0], 'alice')).toBe(true)
    expect(matchesQuery(custs[0], 'oak')).toBe(true) // address
    expect(matchesQuery(custs[1], '2222')).toBe(true) // phone
    expect(matchesQuery(custs[1], 'zzz')).toBe(false)
  })

  it('shapeCustomers filters then sorts by name', () => {
    const r = shapeCustomers(custs, { query: 'oak', sort: 'name' })
    // "Oak St" matches Alice, "Carol Oak" matches Carol
    expect(r.map((c) => c.name)).toEqual(['Alice Green', 'Carol Oak'])
  })

  it('sorts by newest and largest', () => {
    expect(shapeCustomers(custs, { sort: 'newest' }).map((c) => c.id)).toEqual(['1', '3', '2'])
    expect(shapeCustomers(custs, { sort: 'largest' }).map((c) => c.id)).toEqual(['2', '1', '3'])
  })

  it('customerSubtitle composes address + size', () => {
    expect(customerSubtitle(custs[0])).toBe('12 Oak St · 8,000 sq ft')
    expect(customerSubtitle({ address: '', lawnSqFt: null })).toBe('No address yet')
  })
})
