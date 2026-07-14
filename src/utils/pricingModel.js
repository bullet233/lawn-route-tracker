// Shared training-input builder for the mow-duration power model (SPEC §6/§11).
// Both Analytics (pricing matrix) and the per-customer Stats tab fit the SAME
// model from the SAME eligible-visit filter — this is the one place that logic
// lives, so the two screens can never drift.

import { fitPowerModel } from './matrix.js'
import { isModelEligibleMowingVisit } from './revenue.js'

/**
 * Fit y = a·x^b for mow DURATION (secs) vs lawn size (sqft), trained only on
 * model-eligible mowing visits with a known lawn size. Returns {a,b,n,r2} or
 * null when there isn't enough data to fit.
 * @param {Array} visits  all visits
 * @param {Object.<string,Object>} customersById  for each visit's lawn size
 */
export function fitMowDurationModel(visits, customersById = {}) {
  const samples = (visits || [])
    .filter(isModelEligibleMowingVisit)
    .map((v) => ({ x: customersById[v.customerId]?.lawnSqFt, y: v.durationSecs }))
    .filter((s) => s.x > 0 && s.y > 0)
  return fitPowerModel(samples)
}
