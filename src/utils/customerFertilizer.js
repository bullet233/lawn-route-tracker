// Customer "Fertilizer" tab shaping (SPEC §3/§6/§11). Pure: joins a customer's
// fertilizer applications (visits with a fertilizer line item) to their EPA
// compliance logs, flags applications missing a legally-required log, and rolls
// up the distinct products ever applied to this property. The tab renders it.

import { isFertilizerVisit } from './revenue.js'
import { compareBusinessDate } from './dates.js'

/**
 * @param {Array} visits  the customer's visits
 * @param {Array} logs    the customer's compliance logs
 * @returns {{
 *   applications:{visit:Object, log:Object|null, items:Object[]}[],
 *   count:number, withLog:number, missing:number,
 *   products:{productName:string, epaRegNum:string, count:number}[]
 * }}
 */
export function shapeCustomerFertilizer(visits, logs) {
  const logByVisit = {}
  for (const l of logs || []) logByVisit[l.visitId] = l

  const applications = (visits || [])
    .filter((v) => v.status === 'completed' && isFertilizerVisit(v))
    .sort((a, b) => compareBusinessDate(b.businessDate, a.businessDate)) // newest first
    .map((v) => ({
      visit: v,
      log: logByVisit[v.id] || null,
      items: (v.lineItems || []).filter((li) => li.category === 'fertilizer'),
    }))

  const withLog = applications.filter((a) => a.log).length

  // Distinct products across all logs (by name + EPA reg #), with usage counts.
  const byKey = {}
  for (const l of logs || []) {
    for (const p of l.products || []) {
      if (!p.productName) continue
      const key = `${p.productName}|${p.epaRegNum || ''}`
      const row = (byKey[key] ||= { productName: p.productName, epaRegNum: p.epaRegNum || '', count: 0 })
      row.count += 1
    }
  }

  return {
    applications,
    count: applications.length,
    withLog,
    missing: applications.length - withLog,
    products: Object.values(byKey).sort((a, b) => b.count - a.count),
  }
}
