// v1 -> v2 importer (SPEC §12). Built in Phase 1 because it is the proof the
// schema works. Pure transforms over a v1 JSON dump; the caller writes the
// result into a fresh Dexie via data/importSnapshot.
//
// Transform rules (SPEC §12):
//   - visits -> line items (reconstruct once); anything guessed is stamped
//     attribution:'estimated'.
//   - single-product complianceLogs -> products[] shape.
//   - `division` dropped; categories re-derived from service definitions.
//   - free-text lawn sizes parsed once (utils/lawnSize, "ac" bug fixed),
//     stored structured; unparseable flagged for manual review.
//   - dates -> businessDate strings; money -> cents.
//   - v1 legacy id-only route stops normalized to the object shape ONCE, here.
//
// No back-compat branches survive into the app — every legacy quirk is
// resolved in this file and nowhere else (SPEC §3/§6).

import { dollarsToCents } from '../utils/money.js'
import { businessDate } from '../utils/dates.js'
import { parseLawnSize } from '../utils/lawnSize.js'

/** Reuse the v1 id when present (keeps cross-table links stable), else mint. */
function idOf(v1row, fallbackPrefix, index) {
  if (v1row && v1row.id != null) return String(v1row.id)
  return `${fallbackPrefix}_${index}`
}

/**
 * Re-derive a coarse v2 service category from a v1 service name. This is the
 * ONE place name-matching is allowed (SPEC §6 kills name regexes at runtime;
 * import is the exception where legacy data has only names to go on).
 */
export function categoryForServiceName(name) {
  const n = String(name || '').toLowerCase()
  if (/mow|cut|grass|lawn\b/.test(n)) return 'mowing'
  if (/fertil|weed|spray|chem|pre-?emergent|fungicide|insecticide|treatment|round/.test(n))
    return 'fertilizer'
  if (/clean|leaf|leaves|mulch|bed|trim|edge|blow|gutter/.test(n)) return 'cleanup'
  return 'other'
}

/** v1 date (UTC ISO, ms epoch, or 'YYYY-MM-DD') -> v2 businessDate string. */
export function toBusinessDate(v1date) {
  if (v1date == null) return null
  if (typeof v1date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v1date)) return v1date
  if (typeof v1date === 'number') return businessDate(v1date)
  const parsed = Date.parse(v1date)
  return Number.isNaN(parsed) ? null : businessDate(parsed)
}

/** v1 money (dollars float, or already-cents int flagged by convention) -> cents. */
function toCents(v1value) {
  if (v1value == null) return 0
  return dollarsToCents(v1value) // v1 stored dollars; if a field was cents the caller pre-normalizes
}

// ---- per-table transforms -------------------------------------------------

export function transformServices(v1services = []) {
  return v1services.map((s, i) => {
    const category = s.category || categoryForServiceName(s.name)
    return {
      id: idOf(s, 'svc', i),
      name: s.name || 'Service',
      category,
      defaultPriceCents: toCents(s.price ?? s.defaultPrice ?? s.priceCents / 100),
      requiresComplianceLog: category === 'fertilizer',
      active: s.active !== false,
      sortOrder: s.sortOrder ?? i,
    }
  })
}

export function transformCustomers(v1customers = [], review = []) {
  return v1customers.map((c, i) => {
    const id = idOf(c, 'cust', i)
    const size = parseLawnSize(c.lawnSize ?? c.lawnSqFt ?? c.size ?? null)
    if (size.needsReview) {
      review.push({ table: 'customers', id, field: 'lawnSqFt', raw: size.raw })
    }
    return {
      id,
      name: c.name || 'Customer',
      address: c.address || '',
      phone: c.phone || '',
      email: c.email || '',
      // v1 discarded geocoded lat/lng and used the zone centroid. If v1 has a
      // real location keep it; else null and flag (route mapping needs it).
      location: c.location || (c.lat != null ? { lat: c.lat, lng: c.lng } : null),
      arrivalZone: c.arrivalZone || c.zone || null,
      serviceOverrides: c.serviceOverrides || {},
      lawnSqFt: size.sqFt,
      lawnSizeSource: c.lawnSizeSource || 'manual',
      perimeterFt: c.perimeterFt ?? null,
      obstacleCount: c.obstacleCount ?? 0,
      terrain: c.terrain || 'flat',
      fencedBackyard: !!c.fencedBackyard,
      propertyNotes: c.propertyNotes || c.notes || '',
      mowingIntervalDays: c.mowingIntervalDays ?? c.mowInterval ?? null,
      holdUntil: c.holdUntil || null,
      excludeFromAnalytics: !!c.excludeFromAnalytics,
      specialApplications: c.specialApplications || '',
      treatmentProgramId: c.treatmentProgramId || null,
      treatmentProgramYear: c.treatmentProgramYear ?? null,
      createdAt: c.createdAt ?? 0,
    }
  })
}

/**
 * Reconstruct a visit's line items. If v1 already has structured services,
 * map them exactly (attribution 'exact'). If we only have a total/price, we
 * synthesize a single line item and stamp attribution 'estimated'.
 */
export function reconstructLineItems(v1visit, servicesById) {
  const explicit = v1visit.services || v1visit.lineItems
  if (Array.isArray(explicit) && explicit.length) {
    const items = explicit.map((it) => {
      const svc = servicesById[it.serviceId] || servicesById[it.id]
      const category = it.category || svc?.category || categoryForServiceName(it.name || svc?.name)
      return {
        serviceId: it.serviceId || svc?.id || null,
        name: it.name || svc?.name || 'Service',
        category,
        priceCents: it.priceCents ?? toCents(it.price),
      }
    })
    return { items, attribution: 'exact' }
  }
  // Only a total survived → one estimated line item.
  const total = v1visit.total ?? v1visit.revenue ?? v1visit.price ?? 0
  return {
    items: [
      {
        serviceId: null,
        name: v1visit.serviceName || 'Service (reconstructed)',
        category: categoryForServiceName(v1visit.serviceName),
        priceCents: toCents(total),
      },
    ],
    attribution: 'estimated',
  }
}

export function transformVisits(v1visits = [], servicesById = {}, review = []) {
  return v1visits.map((v, i) => {
    const id = idOf(v, 'visit', i)
    const bd = toBusinessDate(v.businessDate ?? v.date)
    if (!bd) review.push({ table: 'visits', id, field: 'businessDate', raw: v.date })
    const { items, attribution } = reconstructLineItems(v, servicesById)
    return {
      id,
      routeId: v.routeId || null,
      customerId: String(v.customerId),
      businessDate: bd,
      status: v.status === 'skipped' ? 'skipped' : 'completed',
      entryTime: v.entryTime ?? null,
      exitTime: v.exitTime ?? null,
      durationSecs: v.durationSecs ?? v.duration ?? null,
      driveTimeSecs: v.driveTimeSecs ?? null,
      source: v.source || (attribution === 'estimated' ? 'manual' : 'gps'),
      lineItems: items,
      addOns: (v.addOns || []).map((a) => ({ name: a.name, priceCents: toCents(a.price ?? a.priceCents / 100) })),
      attribution,
      weather: v.weather ?? null,
      conditions: v.conditions || [],
      note: v.note || '',
    }
  })
}

/** Single-product legacy compliance log -> products[] shape (SPEC §3). */
export function transformComplianceLogs(v1logs = []) {
  return v1logs.map((l, i) => {
    const products = Array.isArray(l.products)
      ? l.products
      : [
          {
            productName: l.productName || '',
            epaRegNum: l.epaRegNum || '',
            category: l.category || categoryForServiceName(l.productName),
            targetSite: l.targetSite || '',
            applicationRate: l.applicationRate || '',
            isSpotTreatment: !!l.isSpotTreatment,
            spotAreaSqFt: l.spotAreaSqFt ?? null,
            spotLocation: l.spotLocation || '',
            customerNotices: l.customerNotices || [],
          },
        ]
    return {
      id: idOf(l, 'clog', i),
      visitId: l.visitId != null ? String(l.visitId) : null,
      customerId: l.customerId != null ? String(l.customerId) : null,
      businessDate: toBusinessDate(l.businessDate ?? l.date),
      applicatorName: l.applicatorName || '',
      licenseNumber: l.licenseNumber || '',
      businessPhone: l.businessPhone || '',
      mixSite: l.mixSite || '',
      areaTreatedSqFt: l.areaTreatedSqFt ?? null,
      startTime: l.startTime ?? null,
      endTime: l.endTime ?? null,
      tempF: l.tempF ?? null,
      windMph: l.windMph ?? null,
      products,
    }
  })
}

/** Normalize v1's id-only-or-object route stops to the single object shape. */
export function normalizeStops(v1stops = []) {
  return v1stops.map((s, order) => {
    if (typeof s === 'object' && s !== null) {
      return {
        customerId: String(s.customerId),
        order: s.order ?? order,
        plannedServiceIds: s.plannedServiceIds || [],
        treatmentIds: s.treatmentIds || [],
        plannedDriveTimeSecs: s.plannedDriveTimeSecs ?? null,
        plannedDriveDistanceMeters: s.plannedDriveDistanceMeters ?? null,
      }
    }
    // legacy id-only stop
    return {
      customerId: String(s),
      order,
      plannedServiceIds: [],
      treatmentIds: [],
      plannedDriveTimeSecs: null,
      plannedDriveDistanceMeters: null,
    }
  })
}

export function transformRoutes(v1routes = []) {
  return v1routes.map((r, i) => ({
    id: idOf(r, 'route', i),
    businessDate: toBusinessDate(r.businessDate ?? r.date),
    type: r.type || 'mixed',
    status: r.status || 'archived',
    isTemplate: !!r.isTemplate,
    name: r.name || '',
    stops: normalizeStops(r.stops),
    plannedDistanceMiles: r.plannedDistanceMiles ?? null,
  }))
}

export function transformTreatmentPrograms(v1programs = []) {
  return v1programs.map((p, i) => ({
    id: idOf(p, 'prog', i),
    name: p.name || 'Program',
    active: p.active !== false,
    steps: (p.steps || []).map((st, si) => ({
      ...st,
      billingServiceId: st.billingServiceId || null, // new: which service a completed step bills as
      order: st.order ?? si,
    })),
  }))
}

export function transformTreatments(v1treatments = []) {
  return v1treatments.map((t, i) => ({
    id: idOf(t, 'treat', i),
    customerId: String(t.customerId),
    programId: t.programId || null,
    year: t.year ?? (t.dueDate ? Number(String(t.dueDate).slice(0, 4)) : null),
    stepName: t.stepName || t.name || '',
    status: t.status || 'scheduled',
    windowStart: t.windowStart || null,
    windowEnd: t.windowEnd || t.dueWindowEnd || null,
    dueDate: t.dueDate || null,
    completedByVisitId: t.completedByVisitId || null, // new link
  }))
}

export function transformFuelLogs(v1fuel = []) {
  return v1fuel.map((f) => ({
    businessDate: toBusinessDate(f.businessDate ?? f.date),
    milesDriven: f.milesDriven ?? 0,
    mowerHours: f.mowerHours ?? 0,
    costOfGasCents: toCents(f.costOfGas ?? f.costOfGasCents / 100),
    truckMpg: f.truckMpg ?? null,
    mowerGph: f.mowerGph ?? null,
    pendingSync: !!f.pendingSync,
  }))
}

/**
 * Full v1 dump -> v2 snapshot.stores shape + a review list of flagged rows.
 * @param {object} v1  { services, customers, visits, complianceLogs, routes,
 *                       treatmentPrograms, treatments, fuelLogs, settings }
 */
export function importV1(v1 = {}) {
  const review = []
  const services = transformServices(v1.services || v1.defaultServices)
  const servicesById = Object.fromEntries(services.map((s) => [s.id, s]))

  const stores = {
    settings: normalizeSettings(v1),
    services,
    customers: transformCustomers(v1.customers, review),
    treatmentPrograms: transformTreatmentPrograms(v1.treatmentPrograms || v1.programs),
    treatments: transformTreatments(v1.treatments),
    routes: transformRoutes(v1.routes),
    visits: transformVisits(v1.visits, servicesById, review),
    complianceLogs: transformComplianceLogs(v1.complianceLogs || v1.epaLogs),
    fuelLogs: transformFuelLogs(v1.fuelLogs),
    engineState: [],
    gpsTraces: [],
    errorLog: [],
  }
  return { stores, review }
}

/**
 * v1 kept settings, catalog, license and inventory in localStorage. Pull the
 * loose pieces the dump carries into the one settings table (key/value rows).
 */
function normalizeSettings(v1) {
  const s = v1.settings || {}
  const rows = []
  const put = (key, value) => rows.push({ key, value })
  put('targetHourlyRateCents', dollarsToCents(s.targetHourlyRate ?? 60))
  put('rateUnderpaidThreshold', s.rateUnderpaidThreshold ?? 0.85)
  put('applicator', v1.applicator || s.applicator || {})
  put('chemicalInventory', v1.chemicalInventory || s.chemicalInventory || [])
  put('windDriftThresholdMph', s.windDriftThresholdMph ?? 10)
  return rows
}
