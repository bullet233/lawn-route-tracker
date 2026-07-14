// Proportional time-split for clustered lawns (SPEC §9). When GPS logs one
// visit that actually covered several adjacent properties, split its time
// across them. Defaults come from the model's own predictions (so training on
// split results would be circular — hence they're stamped source:'split' and
// excluded from the pricing model, see revenue.isModelEligibleMowingVisit).
//
// Pure + tested; the modal supplies allocations and a line-item builder.

import { predictMowMinutes } from './matrix.js'

/**
 * Default split weights (summing to 1) across customers: predicted mow minutes
 * if a model exists, else lawn size, else equal. Never returns zeros-only.
 */
export function computeSplitWeights(customers, model) {
  const raw = (customers || []).map((c) => {
    const mins = model ? predictMowMinutes(model, c) : null
    if (mins && mins > 0) return mins
    if (c.lawnSqFt > 0) return c.lawnSqFt
    return 1
  })
  const sum = raw.reduce((a, b) => a + b, 0)
  if (sum <= 0) return raw.map(() => 1 / (customers.length || 1))
  return raw.map((r) => r / sum)
}

/**
 * Split one visit into N visits by weight. Each result is source:'split',
 * attribution:'estimated', with duration/drive apportioned by weight.
 * @param {object} visit the original GPS visit
 * @param {{customerId:string, weight:number}[]} allocations weights ~sum to 1
 * @param {(customerId:string)=>Array} lineItemsFor builds line items per customer
 * @param {()=>string} newIdFn id minter (injected for deterministic tests)
 */
export function splitVisit(visit, allocations, lineItemsFor, newIdFn) {
  const total = visit.durationSecs || 0
  const drive = visit.driveTimeSecs || 0
  return (allocations || []).map((a) => ({
    id: newIdFn(),
    routeId: visit.routeId ?? null,
    customerId: a.customerId,
    businessDate: visit.businessDate,
    status: 'completed',
    entryTime: visit.entryTime ?? null,
    exitTime: visit.exitTime ?? null,
    durationSecs: Math.round(total * a.weight),
    driveTimeSecs: Math.round(drive * a.weight),
    source: 'split',
    lineItems: lineItemsFor(a.customerId),
    addOns: [],
    attribution: 'estimated',
    weather: visit.weather ?? null,
    conditions: [],
    note: `split from visit ${visit.id}`,
  }))
}
