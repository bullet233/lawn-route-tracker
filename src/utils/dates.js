// businessDate is the ONLY day-grouping key in the app (SPEC §3). It is a
// 'YYYY-MM-DD' string computed from LOCAL time at write time. Locale date
// strings and UTC ISO dates must never be used as keys — v1 mixed both and an
// evening-built route could land on the wrong day.

/**
 * Local-time businessDate string for a ms-epoch timestamp (or Date).
 * Uses local calendar fields, so it is stable across DST and correct in the
 * operator's own timezone. Defaults to now.
 */
export function businessDate(tsOrDate = Date.now()) {
  const d = tsOrDate instanceof Date ? tsOrDate : new Date(tsOrDate)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a 'YYYY-MM-DD' businessDate into a local Date at midnight. */
export function parseBusinessDate(bd) {
  const [y, m, d] = bd.split('-').map(Number)
  return new Date(y, m - 1, d) // local midnight — DST-safe construction
}

/** Whole calendar days between two businessDate strings (b - a). DST-safe. */
export function daysBetween(a, b) {
  const da = parseBusinessDate(a)
  const db = parseBusinessDate(b)
  // Normalize to noon to sidestep DST hour shifts, then divide.
  const ms = db.setHours(12) - da.setHours(12)
  return Math.round(ms / 86_400_000)
}

/** businessDate shifted by n days (may be negative). */
export function addDays(bd, n) {
  const d = parseBusinessDate(bd)
  d.setDate(d.getDate() + n)
  return businessDate(d)
}

/** today's businessDate (local). */
export function today() {
  return businessDate(Date.now())
}

/** Compare businessDate strings: -1 | 0 | 1. Lexical works for zero-padded ISO. */
export function compareBusinessDate(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Year (number) of a businessDate. */
export function yearOf(bd) {
  return Number(bd.slice(0, 4))
}
