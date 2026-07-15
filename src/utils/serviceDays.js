// Service-day helpers (weekly routing). A customer may be assigned a fixed
// weekday (serviceDay 0–6, Sun–Sat matching JS Date.getDay()) they get serviced
// on. null = no fixed day (only surfaces on the cadence-driven due list). Pure
// functions only — callers pass the weekday in; the Date edge stays in the UI.

export const WEEKDAYS = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

/** Full weekday name for a 0–6 value, or '' if unset/invalid. */
export function weekdayLabel(day) {
  return WEEKDAYS[day]?.label || ''
}

/** Three-letter weekday for a 0–6 value, or '' if unset/invalid. */
export function weekdayShort(day) {
  return WEEKDAYS[day]?.short || ''
}

/** True when `day` is a valid weekday index (0–6). */
export function isWeekday(day) {
  return Number.isInteger(day) && day >= 0 && day <= 6
}

/**
 * Customers assigned to a given weekday, name-order preserved from the input.
 * @param {Array} customers
 * @param {number} day  0–6
 */
export function customersForDay(customers, day) {
  if (!isWeekday(day)) return []
  return (customers || []).filter((c) => c.serviceDay === day)
}

/** Count of assigned customers per weekday → { 0: n, 1: n, … } (only nonzero). */
export function countByDay(customers) {
  const counts = {}
  for (const c of customers || []) {
    if (isWeekday(c.serviceDay)) counts[c.serviceDay] = (counts[c.serviceDay] || 0) + 1
  }
  return counts
}
