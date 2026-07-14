// Dexie schema — the single source of truth for persisted shape (SPEC §3).
//
// Conventions enforced by the rest of the app (not by Dexie itself):
//  - Money is integer cents everywhere.
//  - businessDate: 'YYYY-MM-DD' (local) is the only day-grouping key.
//  - Timestamps are ms epoch. Formatting happens only in components.
//  - EVERYTHING lives here, including settings (v1 leaked settings/catalog/
//    license/inventory to localStorage, invisible to backups). One export
//    captures the whole business.
//
// Index strings below only declare *indexed* fields; every other property in
// the JSDoc shapes still persists, it just isn't queryable by index. Pages
// query by index and never table.toArray() (SPEC §3).

import Dexie from 'dexie'

export const DB_NAME = 'lawn-route-tracker'

/** Bump when the store/index layout changes; add a new .version() block below. */
export const SCHEMA_VERSION = 1

/**
 * @typedef {Object} Service   single catalog entry (SPEC §3)
 * @property {string} id
 * @property {string} name
 * @property {'mowing'|'fertilizer'|'cleanup'|'other'} category
 * @property {number} defaultPriceCents
 * @property {boolean} requiresComplianceLog  replaces v1's name-regex EPA trigger
 * @property {boolean} active
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} Customer  (SPEC §3)
 * @property {string} id
 * @property {string} name
 * @property {string} address
 * @property {string} [phone]
 * @property {string} [email]
 * @property {{lat:number,lng:number}|null} location  geocoded once at creation
 * @property {{lat:number,lng:number}[]|null} arrivalZone  street trigger zone
 * @property {Object.<string,{priceCents?:number,active?:boolean}>} serviceOverrides
 * @property {number|null} lawnSqFt
 * @property {'measured'|'manual'} lawnSizeSource  structured — no free-text parsing
 * @property {number} [perimeterFt]
 * @property {number} [obstacleCount]
 * @property {'flat'|'moderate'|'hilly'} [terrain]
 * @property {boolean} [fencedBackyard]
 * @property {string} [propertyNotes]
 * @property {number|null} [mowingIntervalDays]
 * @property {string|null} [holdUntil]  'YYYY-MM-DD' vacation hold — hidden from due lists until date
 * @property {boolean} [excludeFromAnalytics]
 * @property {string} [specialApplications]  chemical constraints, surfaced in EPA modal
 * @property {string|null} [treatmentProgramId]
 * @property {number|null} [treatmentProgramYear]
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Visit  the only execution record (SPEC §3)
 * @property {string} id
 * @property {string|null} routeId
 * @property {string} customerId
 * @property {string} businessDate
 * @property {'completed'|'skipped'} status
 * @property {number} [entryTime]
 * @property {number} [exitTime]
 * @property {number} [durationSecs]
 * @property {number} [driveTimeSecs]
 * @property {'gps'|'manual'|'split'} source
 * @property {{serviceId:string,name:string,category:string,priceCents:number}[]} lineItems
 * @property {{name:string,priceCents:number}[]} [addOns]
 * @property {'exact'|'estimated'} attribution
 * @property {*} [weather]
 * @property {string[]} [conditions]
 * @property {string} [note]
 */

/**
 * Apply all versioned schema definitions to a Dexie instance.
 * Extracted so tests can point it at fake-indexeddb.
 * @param {Dexie} db
 */
export function defineSchema(db) {
  db.version(1).stores({
    // '&id' = unique primary key we assign (uuid). Compound & multi indexes
    // chosen for the range queries pages actually run.
    services: '&id, category, active, sortOrder',
    customers: '&id, name, treatmentProgramId, holdUntil, createdAt',
    routes: '&id, businessDate, status, isTemplate, type',
    // visits indexed by the two keys the whole app groups on.
    visits: '&id, businessDate, customerId, routeId, status, [customerId+businessDate]',
    complianceLogs: '&id, visitId, customerId, businessDate',
    treatmentPrograms: '&id, active',
    treatments:
      '&id, customerId, programId, year, status, dueDate, completedByVisitId, [customerId+year]',
    fuelLogs: '&businessDate, pendingSync',
    // singletons / small tables
    settings: '&key',
    engineState: '&id',
    gpsTraces: '&id, businessDate',
    errorLog: '++seq, at',
  })
  return db
}

/** All persisted store names, in export order. Used by export/import + tests. */
export const STORE_NAMES = [
  'settings',
  'services',
  'customers',
  'treatmentPrograms',
  'treatments',
  'routes',
  'visits',
  'complianceLogs',
  'fuelLogs',
  'engineState',
  'gpsTraces',
  'errorLog',
]

/** Construct the real app database. */
export function createDb(name = DB_NAME) {
  return defineSchema(new Dexie(name))
}
