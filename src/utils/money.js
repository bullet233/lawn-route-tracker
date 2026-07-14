// Money is ALWAYS integer cents in the data model (SPEC §3). No floats stored,
// no exact-equality bugs. These helpers are the only place cents<->display and
// cents<->dollars conversions are allowed to happen.

/** Round a floating dollar amount to integer cents. Half-away-from-zero. */
export function dollarsToCents(dollars) {
  if (dollars == null || Number.isNaN(Number(dollars))) return 0
  const n = Number(dollars)
  // Round-trip through a fixed-precision string first so the float
  // representation of e.g. 1.005 (stored as 1.00499…) doesn't round DOWN.
  // This gives consistent half-up behavior at the cent boundary.
  return Math.round(Number((n * 100).toFixed(6)))
}

/** Integer cents -> Number of dollars (for math/charts only, never for storage). */
export function centsToDollars(cents) {
  return (cents || 0) / 100
}

/** Parse a user-typed price string ("$1,250.50", "40", "") into integer cents. */
export function parsePriceToCents(input) {
  if (input == null) return 0
  if (typeof input === 'number') return dollarsToCents(input)
  const cleaned = String(input).replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0
  return dollarsToCents(parseFloat(cleaned))
}

/** Format integer cents for display: 12550 -> "$125.50". */
export function formatCents(cents, { withSymbol = true, cents: showCents = true } = {}) {
  const c = Math.round(cents || 0)
  const neg = c < 0
  const abs = Math.abs(c)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  const grouped = dollars.toLocaleString('en-US')
  const body = showCents ? `${grouped}.${String(remainder).padStart(2, '0')}` : grouped
  return `${neg ? '-' : ''}${withSymbol ? '$' : ''}${body}`
}

/** Sum a list of {priceCents} (or raw numbers). Always integer-safe. */
export function sumCents(items, pick = (x) => (typeof x === 'number' ? x : x?.priceCents)) {
  return (items || []).reduce((acc, item) => acc + (pick(item) || 0), 0)
}
