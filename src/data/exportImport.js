// Full-fidelity export / import (SPEC §10). One snapshot captures the WHOLE
// business — every Dexie store, including settings — because in v2 nothing
// lives in localStorage. Backup runs at every Day Review save; this is also
// the manual export/import in Settings and the restore path.
//
// Restore = import into a FRESH db, never merge (SPEC §10). Single-writer rule:
// the phone is the only writer; desktop is read-only via imported snapshots.

import { STORE_NAMES, SCHEMA_VERSION, DB_NAME } from '../db/schema.js'

/** Versioned header so future schema changes can migrate an old snapshot. */
export function snapshotHeader(now) {
  return {
    app: 'lawn-route-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now, // ms epoch; caller supplies (Date.now() unavailable in some ctx)
    dbName: DB_NAME,
  }
}

/**
 * Read every store into a plain JSON-serializable snapshot object.
 * @param {import('dexie').Dexie} db
 * @param {number} now  ms epoch for the header
 */
export async function exportSnapshot(db, now) {
  const stores = {}
  for (const name of STORE_NAMES) {
    const table = db.table(name)
    stores[name] = await table.toArray()
  }
  return { ...snapshotHeader(now), stores }
}

/** Serialize a snapshot to a JSON string (pretty for human-inspectable backups). */
export function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2)
}

/**
 * Validate a parsed snapshot before restore. Returns {ok, errors, migrated}.
 * We accept same-or-older schemaVersion; newer than us is rejected (a newer
 * app wrote it). Older versions get run through migrateSnapshot.
 */
export function validateSnapshot(snapshot) {
  const errors = []
  if (!snapshot || typeof snapshot !== 'object') errors.push('not an object')
  else {
    if (snapshot.app !== 'lawn-route-tracker') errors.push('wrong app tag')
    if (typeof snapshot.schemaVersion !== 'number') errors.push('missing schemaVersion')
    else if (snapshot.schemaVersion > SCHEMA_VERSION)
      errors.push(`snapshot schemaVersion ${snapshot.schemaVersion} newer than app ${SCHEMA_VERSION}`)
    if (!snapshot.stores || typeof snapshot.stores !== 'object') errors.push('missing stores')
  }
  if (errors.length) return { ok: false, errors, migrated: null }
  return { ok: true, errors: [], migrated: migrateSnapshot(snapshot) }
}

/**
 * Bring an older snapshot up to the current schema. v1==current for now, so
 * this is a pass-through; the seam exists so future versions add cases here
 * instead of scattering back-compat branches (SPEC's "no back-compat branches").
 */
export function migrateSnapshot(snapshot) {
  switch (snapshot.schemaVersion) {
    case SCHEMA_VERSION:
    default:
      return snapshot
  }
}

/**
 * Restore a snapshot into a db by CLEARING every store then bulk-loading.
 * Caller is responsible for using a fresh/confirmed db (SPEC §10: never merge).
 * @param {import('dexie').Dexie} db
 * @param {object} snapshot  already validated + migrated
 */
export async function importSnapshot(db, snapshot) {
  const { migrated } = validateSnapshot(snapshot)
  const use = migrated || snapshot
  await db.transaction('rw', STORE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of STORE_NAMES) {
      const table = db.table(name)
      await table.clear()
      const rows = use.stores[name] || []
      if (rows.length) await table.bulkPut(rows)
    }
  })
  return { restored: STORE_NAMES.map((n) => ({ store: n, count: (use.stores[n] || []).length })) }
}
