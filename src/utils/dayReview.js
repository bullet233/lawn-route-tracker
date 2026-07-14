// Pure helpers for Day Review (SPEC §8/§11 — all displayed numbers come from
// tested functions, no reduce in JSX).

import { resolvePriceCents } from '../db/servicesRepo.js'
import { visitRevenueCents } from './revenue.js'
import { routeDistanceMeters, metersToMiles } from '../engine/geo.js'

/** A line item snapshot for a service applied to a customer (price resolved). */
export function lineItemFor(service, customer) {
  return {
    serviceId: service.id,
    name: service.name,
    category: service.category,
    priceCents: resolvePriceCents(service, customer),
  }
}

/** Does any line item require an EPA compliance log? (SPEC §3 requiresComplianceLog) */
export function needsComplianceLog(lineItems, servicesById) {
  return (lineItems || []).some((li) => servicesById[li.serviceId]?.requiresComplianceLog)
}

/** Total revenue across a day's edited visits (cents). */
export function dayRevenueCents(visits) {
  let total = 0
  for (const v of visits || []) {
    if (v.status === 'completed') total += visitRevenueCents(v)
  }
  return total
}

/**
 * Straight-line day mileage (miles) over the ordered visits' customer
 * locations — the offline fallback (SPEC §8). Visits without a located
 * customer are skipped, not zeroed.
 */
export function dayMiles(orderedVisits, customersById) {
  const points = (orderedVisits || [])
    .map((v) => customersById[v.customerId]?.location)
    .filter(Boolean)
  return metersToMiles(routeDistanceMeters(points))
}

/** Total on-site seconds across completed visits. */
export function dayJobSeconds(visits) {
  let s = 0
  for (const v of visits || []) if (v.status === 'completed') s += v.durationSecs || 0
  return s
}

/** Total drive seconds across visits. */
export function dayDriveSeconds(visits) {
  let s = 0
  for (const v of visits || []) s += v.driveTimeSecs || 0
  return s
}

/** Order visits by entry time (route order), nulls last. */
export function orderVisits(visits) {
  return [...(visits || [])].sort((a, b) => (a.entryTime ?? Infinity) - (b.entryTime ?? Infinity))
}
