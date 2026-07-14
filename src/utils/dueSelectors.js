// Pure selectors feeding the due engines from raw table rows (SPEC §7/§11 —
// no reduce in JSX; the cadence engines stay pure and take plain maps).

import { isMowingVisit } from './revenue.js'
import { compareBusinessDate } from './dates.js'

/**
 * Latest mowing-category visit businessDate per customer, from all visits.
 * Only completed visits count. Returns { [customerId]: 'YYYY-MM-DD' }.
 */
export function computeLastMowByCustomer(visits) {
  const out = {}
  for (const v of visits || []) {
    if (v.status !== 'completed' || !isMowingVisit(v)) continue
    const cur = out[v.customerId]
    if (!cur || compareBusinessDate(v.businessDate, cur) > 0) {
      out[v.customerId] = v.businessDate
    }
  }
  return out
}

/** Map customers array → { [id]: customer } for engine lookups. */
export function indexById(customers) {
  const out = {}
  for (const c of customers || []) out[c.id] = c
  return out
}

/** Only mowing-eligible customers: active mow service + a mow interval (SPEC §6). */
export function mowingEligibleCustomers(customers) {
  return (customers || []).filter((c) => c.mowingIntervalDays && c.mowingIntervalDays > 0)
}
