// Adapter between the platform-agnostic GeofenceEngine and Dexie (SPEC §4/§5).
// The engine knows nothing about storage; this wires its onCheckpoint/onVisit
// callbacks to the engineState + visits tables and provides rehydration.

import { db } from './index.js'
import { newId } from './ids.js'
import { businessDate } from '../utils/dates.js'

/** Persist the engine's checkpoint (singleton row) on every transition. */
export function saveCheckpoint(checkpoint) {
  return db.engineState.put({ ...checkpoint, id: 'singleton' })
}

export function loadCheckpoint() {
  return db.engineState.get('singleton')
}

export function clearCheckpoint() {
  return db.engineState.delete('singleton')
}

/**
 * Turn a completed job from the engine into a draft visit (SPEC §3/§6). Line
 * items are added at Day Review — a GPS job records timing + provenance now;
 * revenue is attached later. Every completion goes through a visit.
 */
export function visitFromJob(job, routeId = null, now = Date.now(), weather = null) {
  const exit = job.exitTime ?? now
  return {
    id: newId(),
    routeId,
    customerId: job.customerId,
    businessDate: businessDate(exit),
    status: 'completed',
    entryTime: job.entryTime ?? null,
    exitTime: exit,
    durationSecs: job.durationSecs ?? null,
    driveTimeSecs: job.driveTimeSecs ?? null,
    source: 'gps',
    lineItems: [], // filled at Day Review
    addOns: [],
    attribution: 'exact',
    weather, // captured at route start (temp/wind) — feeds EPA log auto-fill
    conditions: job.driveby ? ['driveby'] : [],
    note: '',
  }
}

/** Persist a completed job as a draft visit. */
export async function persistJobAsVisit(job, routeId = null, now = Date.now(), weather = null) {
  const record = visitFromJob(job, routeId, now, weather)
  await db.visits.add(record)
  return record
}

/**
 * Save a recorded GPS trace (SPEC §3/§11 — opt-in debug recording; ~few hundred
 * KB/day). Any field bug then replays as a regression test via engine/replay.
 */
export async function saveGpsTrace(points, now = Date.now()) {
  if (!points || points.length === 0) return null
  const record = { id: newId(), businessDate: businessDate(now), points }
  await db.gpsTraces.add(record)
  return record
}
