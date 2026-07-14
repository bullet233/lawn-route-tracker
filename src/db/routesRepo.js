// Routes (SPEC §3). Planning intent (type) lives on the route, never on visits.
// Stops are always the object shape — no legacy id-only stops in v2.

import { db } from './index.js'
import { newId } from './ids.js'
import { businessDate } from '../utils/dates.js'

export function makeStop(customerId, order, extra = {}) {
  return {
    customerId,
    order,
    plannedServiceIds: extra.plannedServiceIds || [],
    treatmentIds: extra.treatmentIds || [],
    plannedDriveTimeSecs: extra.plannedDriveTimeSecs ?? null,
    plannedDriveDistanceMeters: extra.plannedDriveDistanceMeters ?? null,
  }
}

export function makeRoute(input = {}, now = Date.now()) {
  return {
    id: input.id || newId(),
    businessDate: input.businessDate || businessDate(now),
    type: input.type || 'mixed',
    status: input.status || 'planned',
    isTemplate: !!input.isTemplate,
    name: input.name || '',
    stops: input.stops || [],
    plannedDistanceMiles: input.plannedDistanceMiles ?? null,
  }
}

export async function addRoute(input, now = Date.now()) {
  const record = makeRoute(input, now)
  await db.routes.add(record)
  return record
}

export async function setRouteStatus(id, status) {
  await db.routes.update(id, { status })
  return db.routes.get(id)
}

/** The active route, if any. There should be at most one (SPEC §3 asks before replacing). */
export async function activeRoute() {
  return db.routes.where('status').equals('active').first()
}

export function routeTemplates() {
  return db.routes.filter((r) => r.isTemplate).toArray()
}
