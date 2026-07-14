// Sample-data generator (dev/testing only). Populates a realistic season so
// every screen has data: customers with zones, a mowing history that fits the
// pricing power model, treatment enrollments with some steps completed, and a
// couple of intentional gaps to exercise Health Check.
//
// Uses Math.random / Date.now — fine at app runtime (this never runs in a
// workflow script). Not imported by production UI except behind import.meta.env.DEV.

import { db } from '../db/index.js'
import { STORE_NAMES } from '../db/schema.js'
import { newId } from '../db/ids.js'
import { makeCustomer } from '../db/customersRepo.js'
import { seedServicesIfEmpty, allServices, resolvePriceCents } from '../db/servicesRepo.js'
import { seedDefaultProgramIfEmpty, allPrograms } from '../db/programsRepo.js'
import { squareZoneAround } from '../engine/geo.js'
import { generateTreatments } from '../utils/treatments.js'
import { parseBusinessDate, addDays, today, yearOf, compareBusinessDate } from '../utils/dates.js'

const BASE = { lat: 39.9612, lng: -82.9988 } // Columbus, OH area
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const FIRST = ['Jane', 'Marcus', 'Priya', 'Tom', 'Elena', 'Derek', 'Susan', 'Andre', 'Nina', 'Carl', 'Rosa', 'Wes', 'Kim', 'Otis']
const LAST = ['Maple', 'Alvarez', 'Chen', 'Novak', 'Reilly', 'Boyd', 'Park', 'Frost', 'Ellis', 'Vance', 'Ortega', 'Hale']
const STREETS = ['Oak', 'Elm', 'Maple', 'Cedar', 'Birch', 'Willow', 'Chestnut', 'Pine', 'Walnut', 'Ash']
const TERRAIN = ['flat', 'flat', 'moderate', 'hilly']

/** Duration (secs) to mow a lawn of `sqft` — a power law with noise, so the
 *  analytics model fits with a believable R². */
function mowSeconds(sqft) {
  return Math.round(25 * Math.pow(sqft, 0.42) * rand(0.9, 1.12))
}

/** Wipe every store, then re-seed the catalog + default program. */
export async function wipeAll() {
  await db.transaction('rw', STORE_NAMES.map((n) => db.table(n)), async () => {
    for (const n of STORE_NAMES) await db.table(n).clear()
  })
  await seedServicesIfEmpty()
  await seedDefaultProgramIfEmpty()
}

export async function generateSampleData() {
  await wipeAll()
  const services = await allServices()
  const mowSvc = services.find((s) => s.category === 'mowing')
  const fertSvcs = services.filter((s) => s.category === 'fertilizer')
  const program = (await allPrograms())[0]
  const bd = today()
  const year = yearOf(bd)

  // ---- customers ----
  const customers = []
  const N = 12
  for (let i = 0; i < N; i++) {
    const center = { lat: BASE.lat + rand(-0.04, 0.04), lng: BASE.lng + rand(-0.04, 0.04) }
    const hasZone = i < N - 2 // last two intentionally missing zones (Health Check)
    const sqft = Math.round(rand(3000, 18000) / 100) * 100
    const c = makeCustomer(
      {
        name: `${pick(FIRST)} ${pick(LAST)}`,
        address: `${Math.floor(rand(10, 999))} ${pick(STREETS)} St`,
        phone: `614-555-${String(Math.floor(rand(1000, 9999)))}`,
        location: center,
        arrivalZone: hasZone ? squareZoneAround(center, 40) : null,
        lawnSqFt: sqft,
        lawnSizeSource: 'measured',
        terrain: pick(TERRAIN),
        obstacleCount: Math.floor(rand(0, 6)),
        fencedBackyard: Math.random() < 0.4,
        mowingIntervalDays: Math.random() < 0.8 ? pick([7, 7, 14]) : null,
      },
      Date.now() - i * 86_400_000,
    )
    customers.push(c)
  }
  await db.customers.bulkAdd(customers)

  // ---- mowing history (~8 weeks back) ----
  const visits = []
  for (const c of customers) {
    if (!c.mowingIntervalDays || !c.arrivalZone) continue
    let d = addDays(bd, -56)
    while (compareBusinessDate(d, bd) <= 0) {
      // stop the last mow a random 1–2 intervals before today so some are "due"
      if (compareBusinessDate(addDays(d, c.mowingIntervalDays), bd) > 0 && Math.random() < 0.5) break
      const dur = mowSeconds(c.lawnSqFt)
      const entry = parseBusinessDate(d).getTime() + 9 * 3600_000 + Math.floor(rand(0, 6 * 3600_000))
      visits.push({
        id: newId(),
        routeId: null,
        customerId: c.id,
        businessDate: d,
        status: 'completed',
        entryTime: entry,
        exitTime: entry + dur * 1000,
        durationSecs: dur,
        driveTimeSecs: Math.floor(rand(240, 900)),
        source: 'gps',
        lineItems: [{ serviceId: mowSvc.id, name: mowSvc.name, category: 'mowing', priceCents: resolvePriceCents(mowSvc, c) }],
        addOns: [],
        attribution: 'exact',
        weather: { tempF: Math.round(rand(60, 88)), windMph: Math.round(rand(2, 14)) },
        conditions: [],
        note: '',
      })
      d = addDays(d, c.mowingIntervalDays)
    }
  }

  // ---- treatments: enroll ~8, complete past-window steps via fert visits ----
  const treatments = []
  const enrollees = customers.filter((c) => c.arrivalZone).slice(0, 8)
  for (const c of enrollees) {
    const ts = generateTreatments(program, c.id, year)
    for (const t of ts) {
      const step = program.steps.find((s) => s.id === t.stepId)
      const svc = fertSvcs.find((s) => step?.category?.toLowerCase().includes('weed') ? s.name.includes('Weed') : s.name.includes('Fertilizer')) || fertSvcs[0]
      // if the window already closed, mark it done with a linked fert visit
      if (compareBusinessDate(t.windowEnd, bd) < 0) {
        const appDate = addDays(t.windowEnd, -Math.floor(rand(1, 10)))
        const entry = parseBusinessDate(appDate).getTime() + 10 * 3600_000
        const dur = Math.floor(rand(600, 1500))
        const visitId = newId()
        visits.push({
          id: visitId,
          routeId: null,
          customerId: c.id,
          businessDate: appDate,
          status: 'completed',
          entryTime: entry,
          exitTime: entry + dur * 1000,
          durationSecs: dur,
          driveTimeSecs: Math.floor(rand(240, 900)),
          source: 'gps',
          lineItems: [{ serviceId: svc.id, name: svc.name, category: 'fertilizer', priceCents: resolvePriceCents(svc, c) }],
          addOns: [],
          attribution: 'exact',
          weather: { tempF: Math.round(rand(55, 85)), windMph: Math.round(rand(2, 12)) },
          conditions: [],
          note: '',
        })
        t.status = 'completed'
        t.completedByVisitId = visitId
        t.billingServiceId = svc.id
      }
      treatments.push(t)
    }
    await db.customers.update(c.id, { treatmentProgramId: program.id, treatmentProgramYear: year })
  }

  await db.visits.bulkAdd(visits)
  await db.treatments.bulkAdd(treatments)

  return {
    customers: customers.length,
    visits: visits.length,
    treatments: treatments.length,
    enrolled: enrollees.length,
  }
}
