// Derived revenue facts (SPEC §3). These are computed at read, NEVER stored.
// v1's getVisitRevenueBreakdown guessing logic is deleted; in this schema the
// line item is the atomic unit of revenue, so grouping is exact.
//
// JSX contains no reduce (SPEC §11) — every total a screen shows comes from one
// of these tested functions.

import { sumCents } from './money.js'

/** Total revenue for a visit = Σ lineItems + Σ addOns (integer cents). */
export function visitRevenueCents(visit) {
  if (!visit) return 0
  return sumCents(visit.lineItems) + sumCents(visit.addOns)
}

/** Does this visit include any line item of the given category? */
export function visitHasCategory(visit, category) {
  return (visit?.lineItems || []).some((li) => li.category === category)
}

/** "is a fertilizer visit" — any fertilizer-category line item (SPEC §3). */
export function isFertilizerVisit(visit) {
  return visitHasCategory(visit, 'fertilizer')
}

/** "is a mowing visit" — any mowing-category line item. */
export function isMowingVisit(visit) {
  return visitHasCategory(visit, 'mowing')
}

/**
 * A pure-mowing GPS visit is the only kind the pricing model may train on
 * (SPEC §6): source 'gps' and EVERY line item mowing-category. Mixed/split
 * visits inflate the mowing curve with spreader time.
 */
export function isModelEligibleMowingVisit(visit) {
  if (!visit || visit.source !== 'gps' || visit.status !== 'completed') return false
  const items = visit.lineItems || []
  return items.length > 0 && items.every((li) => li.category === 'mowing')
}

/**
 * Revenue grouped by service category across many visits.
 * Returns { [category]: cents }. Mixed visits split naturally by line item —
 * nothing is ever double counted.
 */
export function revenueByCategory(visits) {
  const out = {}
  for (const v of visits || []) {
    if (v.status !== 'completed') continue
    for (const li of v.lineItems || []) {
      out[li.category] = (out[li.category] || 0) + (li.priceCents || 0)
    }
    for (const a of v.addOns || []) {
      out.addOn = (out.addOn || 0) + (a.priceCents || 0)
    }
  }
  return out
}

/**
 * Revenue grouped by serviceId across many visits (for the per-service
 * breakdown History shows). Returns { [serviceId]: {name, cents, count} }.
 */
export function revenueByService(visits) {
  const out = {}
  for (const v of visits || []) {
    if (v.status !== 'completed') continue
    for (const li of v.lineItems || []) {
      const row = (out[li.serviceId] ||= { name: li.name, cents: 0, count: 0 })
      row.cents += li.priceCents || 0
      row.count += 1
    }
  }
  return out
}

/** Total completed revenue across visits (cents). */
export function totalRevenueCents(visits) {
  let total = 0
  for (const v of visits || []) {
    if (v.status === 'completed') total += visitRevenueCents(v)
  }
  return total
}

/**
 * Mower-hours attribution (SPEC §6/fuel): a visit contributes its full
 * duration to mower hours iff it has any mowing-category line item. Returns
 * seconds; caller converts to hours for display.
 */
export function mowerSecondsForVisit(visit) {
  if (!visit || visit.status !== 'completed') return 0
  return isMowingVisit(visit) ? visit.durationSecs || 0 : 0
}
