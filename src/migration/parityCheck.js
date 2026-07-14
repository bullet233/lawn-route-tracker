// Parity check — the Phase 1 acceptance test (SPEC §12/§13). Total revenue,
// visit counts, and per-customer totals in v2 MUST equal v1's History page
// numbers for all-time. Any difference is an importer bug, not rounding to
// accept.
//
// This computes v2 aggregates from the transformed visits using the SAME
// derivation the app uses (utils/revenue), then diffs them against a v1
// summary the operator captures from the old app's History page.

import { totalRevenueCents, visitRevenueCents } from '../utils/revenue.js'

/**
 * @param {Array} v2visits  transformed visits (stores.visits)
 * @returns {{ totalRevenueCents:number, completedVisits:number,
 *             perCustomerCents: Object.<string,number> }}
 */
export function summarizeV2(v2visits) {
  const perCustomerCents = {}
  let completedVisits = 0
  for (const v of v2visits) {
    if (v.status !== 'completed') continue
    completedVisits += 1
    perCustomerCents[v.customerId] =
      (perCustomerCents[v.customerId] || 0) + visitRevenueCents(v)
  }
  return {
    totalRevenueCents: totalRevenueCents(v2visits),
    completedVisits,
    perCustomerCents,
  }
}

/**
 * Diff a v2 summary against the v1 expected summary.
 * @param {object} v2summary  from summarizeV2
 * @param {object} v1expected { totalRevenueCents, completedVisits, perCustomerCents }
 * @returns {{ ok:boolean, diffs:Array }}
 */
export function parityCheck(v2summary, v1expected) {
  const diffs = []

  if (v2summary.totalRevenueCents !== v1expected.totalRevenueCents) {
    diffs.push({
      metric: 'totalRevenueCents',
      v1: v1expected.totalRevenueCents,
      v2: v2summary.totalRevenueCents,
      delta: v2summary.totalRevenueCents - v1expected.totalRevenueCents,
    })
  }

  if (v2summary.completedVisits !== v1expected.completedVisits) {
    diffs.push({
      metric: 'completedVisits',
      v1: v1expected.completedVisits,
      v2: v2summary.completedVisits,
      delta: v2summary.completedVisits - v1expected.completedVisits,
    })
  }

  const custIds = new Set([
    ...Object.keys(v1expected.perCustomerCents || {}),
    ...Object.keys(v2summary.perCustomerCents || {}),
  ])
  for (const id of custIds) {
    const a = v1expected.perCustomerCents?.[id] || 0
    const b = v2summary.perCustomerCents?.[id] || 0
    if (a !== b) {
      diffs.push({ metric: 'perCustomer', customerId: id, v1: a, v2: b, delta: b - a })
    }
  }

  return { ok: diffs.length === 0, diffs }
}
