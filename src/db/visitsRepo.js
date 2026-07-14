// Visit reads/writes for Day Review + history (SPEC §3/§8). Queries by the
// businessDate index — never a full table scan.

import { db } from './index.js'
import { newId } from './ids.js'
import { businessDate } from '../utils/dates.js'

/** All visits stamped for a businessDate (the only day-grouping key). */
export function visitsForDate(bd) {
  return db.visits.where('businessDate').equals(bd).toArray()
}

export function updateVisit(id, patch) {
  return db.visits.update(id, patch)
}

/** Replace one visit with its split results, transactionally (SPEC §9). */
export async function applyVisitSplit(originalId, newVisits) {
  await db.transaction('rw', db.visits, async () => {
    await db.visits.delete(originalId)
    await db.visits.bulkAdd(newVisits)
  })
  return newVisits.length
}

export function getVisit(id) {
  return db.visits.get(id)
}

/** Persist a manual visit and return the record. */
export async function addManualVisit(customerId, lineItems = [], now = Date.now()) {
  const record = makeManualVisit(customerId, lineItems, now)
  await db.visits.add(record)
  return record
}

/**
 * Manual visit (SPEC §6 — every completion goes through a visit; logging an
 * application off-route still creates one, source 'manual', estimated times).
 */
export function makeManualVisit(customerId, lineItems = [], now = Date.now()) {
  return {
    id: newId(),
    routeId: null,
    customerId,
    businessDate: businessDate(now),
    status: 'completed',
    entryTime: null,
    exitTime: now,
    durationSecs: null,
    driveTimeSecs: null,
    source: 'manual',
    lineItems,
    addOns: [],
    attribution: 'estimated',
    weather: null,
    conditions: [],
    note: '',
  }
}
