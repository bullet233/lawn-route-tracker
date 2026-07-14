// Pure list-shaping for the Customers screen (SPEC §11 — no reduce/filter logic
// buried in JSX; it lives here with tests).

/** Case-insensitive match across name / address / phone. */
export function matchesQuery(customer, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  return (
    customer.name?.toLowerCase().includes(q) ||
    customer.address?.toLowerCase().includes(q) ||
    customer.phone?.toLowerCase().includes(q)
  )
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  largest: (a, b) => (b.lawnSqFt || 0) - (a.lawnSqFt || 0),
}

/** Filter by query then sort by key ('name' | 'newest' | 'largest'). */
export function shapeCustomers(customers, { query = '', sort = 'name' } = {}) {
  const filtered = (customers || []).filter((c) => matchesQuery(c, query))
  const sorter = SORTERS[sort] || SORTERS.name
  return [...filtered].sort(sorter)
}

/** Short one-line address/summary for a card. */
export function customerSubtitle(customer) {
  const bits = []
  if (customer.address) bits.push(customer.address)
  if (customer.lawnSqFt) bits.push(`${customer.lawnSqFt.toLocaleString()} sq ft`)
  return bits.join(' · ') || 'No address yet'
}
