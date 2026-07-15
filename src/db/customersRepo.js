// Customer data access (SPEC §3). All writes go through here so defaults and
// invariants live in one place — pages never construct raw customer records.
// Queries use indexes (never toArray of the whole table for filtered reads).

import { db } from './index.js'
import { newId } from './ids.js'

/** A fully-defaulted customer record from partial quick-add input. */
export function makeCustomer(input = {}, now = Date.now()) {
  return {
    id: input.id || newId(),
    name: (input.name || '').trim(),
    address: (input.address || '').trim(),
    phone: input.phone || '',
    email: input.email || '',
    location: input.location || null,
    arrivalZone: input.arrivalZone || null,
    serviceOverrides: input.serviceOverrides || {},
    lawnSqFt: input.lawnSqFt ?? null,
    lawnSizeSource: input.lawnSizeSource || 'manual',
    perimeterFt: input.perimeterFt ?? null,
    obstacleCount: input.obstacleCount ?? 0,
    terrain: input.terrain || 'flat',
    fencedBackyard: !!input.fencedBackyard,
    propertyNotes: input.propertyNotes || '',
    mowingIntervalDays: input.mowingIntervalDays ?? null,
    serviceDay: input.serviceDay ?? null,
    holdUntil: input.holdUntil || null,
    excludeFromAnalytics: !!input.excludeFromAnalytics,
    specialApplications: input.specialApplications || '',
    treatmentProgramId: input.treatmentProgramId || null,
    treatmentProgramYear: input.treatmentProgramYear ?? null,
    createdAt: input.createdAt ?? now,
  }
}

export async function addCustomer(input, now = Date.now()) {
  const record = makeCustomer(input, now)
  await db.customers.add(record)
  return record
}

export async function updateCustomer(id, patch) {
  await db.customers.update(id, patch)
  return db.customers.get(id)
}

export async function deleteCustomer(id) {
  await db.customers.delete(id)
}

export function getCustomer(id) {
  return db.customers.get(id)
}

/** All customers, name-sorted. Small table; a full read is acceptable here. */
export function allCustomers() {
  return db.customers.orderBy('name').toArray()
}
