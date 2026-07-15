// Remaining-route ETA (SPEC §5/§11). Pure: given the route's stops, the fitted
// mow-duration model, and the current fix, estimate the time left on the route.
//
// Job time per remaining stop = the model's predicted mow minutes for that
// property (size + difficulty — the same single implementation Analytics and
// the Stats tab use), falling back to the operator's average completed visit
// when the model can't predict. The stop currently being worked has its elapsed
// time subtracted. Drive time = straight-line legs × a road factor at suburban
// speed — an estimate, clearly labeled "~" in the UI.

import { predictMowMinutes } from './matrix.js'
import { haversineMeters } from '../engine/geo.js'

export const ROAD_FACTOR = 1.3 // straight-line → road distance
export const AVG_DRIVE_SPEED_MPS = 13.4 // ≈30 mph

/**
 * @param {Object} a
 * @param {Array} a.stops  buildStops output: {id, location, done}
 * @param {Object.<string,Object>} a.customersById
 * @param {Object|null} a.model  fitted mow-duration power model (or null)
 * @param {number} [a.fallbackJobSecs]  used when the model can't predict a stop
 * @param {{lat:number,lng:number}|null} [a.currentPos]  live fix, starts the drive legs
 * @param {string|null} [a.activeCustomerId]  stop currently being worked
 * @param {number} [a.activeElapsedSecs]  time already spent on the active stop
 * @returns {{remainingStops:number, jobSecs:number, driveSecs:number, totalSecs:number, perStopJobSecs:Object.<string,number>}}
 */
export function estimateRouteRemaining({
  stops = [],
  customersById = {},
  model = null,
  fallbackJobSecs = 20 * 60,
  currentPos = null,
  activeCustomerId = null,
  activeElapsedSecs = 0,
}) {
  const remaining = stops.filter((s) => !s.done && !s.skipped)

  const perStopJobSecs = {}
  let jobSecs = 0
  for (const s of remaining) {
    const mins = predictMowMinutes(model, customersById[s.id])
    let secs = mins != null ? Math.round(mins * 60) : fallbackJobSecs
    if (s.id === activeCustomerId) secs = Math.max(0, secs - Math.round(activeElapsedSecs || 0))
    perStopJobSecs[s.id] = secs
    jobSecs += secs
  }

  // drive legs: current position → each remaining located stop, in order
  const pts = []
  if (currentPos && currentPos.lat != null) pts.push(currentPos)
  for (const s of remaining) if (s.location) pts.push(s.location)
  let meters = 0
  for (let i = 1; i < pts.length; i++) meters += haversineMeters(pts[i - 1], pts[i])
  const driveSecs = Math.round((meters * ROAD_FACTOR) / AVG_DRIVE_SPEED_MPS)

  return {
    remainingStops: remaining.length,
    jobSecs,
    driveSecs,
    totalSecs: jobSecs + driveSecs,
    perStopJobSecs,
  }
}

/** Average completed-visit duration (secs) — the model fallback. */
export function averageVisitSecs(visits, dflt = 20 * 60) {
  const timed = (visits || []).filter((v) => v.status === 'completed' && v.durationSecs > 0)
  if (!timed.length) return dflt
  let s = 0
  for (const v of timed) s += v.durationSecs
  return Math.round(s / timed.length)
}
