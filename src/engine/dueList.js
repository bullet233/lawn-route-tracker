// Merge the two cadence engines into the one list the route builder consumes
// (SPEC §7). Both engines already emit on the same normalized priority axis, so
// merging is a concat + sort. This module also computes the double-up badge:
// a customer present in BOTH engines can have one stop fulfill both.

import { mowingDueItems } from './mowingCadence.js'
import { treatmentDueItems } from './treatmentCadence.js'
import { today as todayBd } from '../utils/dates.js'

/**
 * @param {Object} args  see mowingDueItems + treatmentDueItems inputs
 * @returns {import('./dueTypes.js').DueItem[]}  sorted, most-urgent first
 */
export function buildDueList({
  customers,
  lastMowByCustomerId,
  treatments,
  customersById,
  today = todayBd(),
}) {
  const mow = mowingDueItems({ customers, lastMowByCustomerId, today })
  const treat = treatmentDueItems({ treatments, customersById, today })
  const merged = [...mow, ...treat]
  merged.sort((a, b) => b.priority - a.priority || a.dueDate.localeCompare(b.dueDate))
  return merged
}

/**
 * Set of customerIds that appear in BOTH engines (double-up candidates).
 * The route builder badges these — one stop fulfills a mow + a treatment,
 * which the line-item model makes safe (SPEC §7).
 */
export function doubleUpCustomerIds(dueItems) {
  const byCustomer = {}
  for (const item of dueItems || []) {
    ;(byCustomer[item.customerId] ||= new Set()).add(item.engine)
  }
  const out = new Set()
  for (const [customerId, engines] of Object.entries(byCustomer)) {
    if (engines.has('mowing') && engines.has('treatment')) out.add(customerId)
  }
  return out
}
