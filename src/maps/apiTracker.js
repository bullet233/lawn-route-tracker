// Google Maps cost tracking (SPEC §2). v1 tracked mapLoad/geocode/autocomplete
// but silently dropped `directions` — its most expensive calls never appeared.
// v2: ONE enum of call types with prices; an untracked type throws in dev so a
// new billable call can't be added without wiring it into the dashboard.
//
// Prices are approximate USD per call (Google's published rates), kept here as
// the single source. Counts persist to the settings table so the cost view
// survives reloads and is captured by backups.

import { db } from '../db/index.js'

export const CALL_PRICES = {
  mapLoad: 0.007, // dynamic map load
  geocode: 0.005,
  autocomplete: 0.00283, // per session/call (approx)
  directions: 0.005, // route optimization, day-review mileage
  weather: 0, // Open-Meteo — free, no key; tracked for call-count visibility
}

const USAGE_KEY = 'apiUsage'
let counts = null

async function ensureLoaded() {
  if (counts) return counts
  const row = await db.settings.get(USAGE_KEY)
  counts = row?.value || {}
  return counts
}

/**
 * Record one billable call. Throws on an unknown type (dev guardrail) so every
 * billable path is represented in the cost dashboard.
 */
export async function recordApiCall(type, n = 1) {
  if (!(type in CALL_PRICES)) {
    throw new Error(`Untracked Google Maps call type: "${type}". Add it to CALL_PRICES.`)
  }
  await ensureLoaded()
  counts[type] = (counts[type] || 0) + n
  await db.settings.put({ key: USAGE_KEY, value: { ...counts } })
  return counts[type]
}

/** Current usage snapshot: { counts, totalCost }. Pure over the given counts. */
export function summarizeUsage(countsObj) {
  const c = countsObj || {}
  let totalCost = 0
  for (const [type, n] of Object.entries(c)) {
    totalCost += (CALL_PRICES[type] || 0) * n
  }
  return { counts: c, totalCost }
}

export async function getUsage() {
  return summarizeUsage(await ensureLoaded())
}
