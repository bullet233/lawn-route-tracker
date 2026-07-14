// Treatments (SPEC §6) — the scheduling records. A treatment is a plan; a visit
// is what happened. Completion links to the fulfilling visit, never copies.

import { db } from './index.js'
import { generateTreatments } from '../utils/treatments.js'
import { updateCustomer } from './customersRepo.js'

export function treatmentsForYear(year) {
  return db.treatments.where('year').equals(year).toArray()
}

export function treatmentsForCustomerYear(customerId, year) {
  return db.treatments.where('[customerId+year]').equals([customerId, year]).toArray()
}

export function allTreatments() {
  return db.treatments.toArray()
}

/** Enroll one customer in a program for a year (idempotent per customer+year). */
export async function enrollCustomer(program, customerId, year) {
  const existing = await treatmentsForCustomerYear(customerId, year)
  if (existing.some((t) => t.programId === program.id)) return existing
  const treatments = generateTreatments(program, customerId, year)
  await db.treatments.bulkAdd(treatments)
  await updateCustomer(customerId, { treatmentProgramId: program.id, treatmentProgramYear: year })
  return treatments
}

/** Enroll every given customer (season rollover / Enroll All — SPEC §6). */
export async function enrollAll(program, customerIds, year) {
  let enrolled = 0
  for (const id of customerIds) {
    const before = await treatmentsForCustomerYear(id, year)
    if (before.some((t) => t.programId === program.id)) continue
    await enrollCustomer(program, id, year)
    enrolled += 1
  }
  return enrolled
}

/**
 * Complete a treatment by linking the fulfilling visit + billing service
 * (SPEC §6). Only completed visits fulfill.
 */
export async function completeTreatment(treatmentId, visitId, billingServiceId = null) {
  await db.treatments.update(treatmentId, {
    status: 'completed',
    completedByVisitId: visitId,
    ...(billingServiceId ? { billingServiceId } : {}),
  })
}

/** Revert a treatment to scheduled (visit deleted / line item removed — SPEC §6). */
export async function revertTreatment(treatmentId) {
  await db.treatments.update(treatmentId, { status: 'scheduled', completedByVisitId: null })
}

export function skipTreatment(treatmentId) {
  return db.treatments.update(treatmentId, { status: 'skipped' })
}

export function unskipTreatment(treatmentId) {
  return db.treatments.update(treatmentId, { status: 'scheduled' })
}

/** When a fulfilling visit is deleted/edited, revert any treatments it completed. */
export async function revertTreatmentsForVisit(visitId) {
  const linked = await db.treatments.where('completedByVisitId').equals(visitId).toArray()
  for (const t of linked) await revertTreatment(t.id)
  return linked.length
}

/**
 * Propagate program-step edits to this year's OPEN treatments (SPEC §6): update
 * scheduled/skipped treatments' name/category/window to match the edited step;
 * completed ones are frozen history. A treatment whose step was removed is left
 * as-is. Returns the count updated.
 */
export async function propagateProgramToOpenTreatments(program, year) {
  const ts = await treatmentsForYear(year)
  let updated = 0
  for (const t of ts) {
    if (t.programId !== program.id || t.status === 'completed') continue
    const step = program.steps.find((s) => s.id === t.stepId)
    if (!step) continue
    await db.treatments.update(t.id, {
      stepName: step.name,
      category: step.category,
      windowStart: `${year}-${step.windowStartMMDD}`,
      windowEnd: `${year}-${step.windowEndMMDD}`,
      dueDate: `${year}-${step.windowEndMMDD}`,
      billingServiceId: step.billingServiceId || t.billingServiceId,
    })
    updated += 1
  }
  return updated
}

/**
 * Un-enroll: delete open (scheduled) treatments for the program+year, KEEP
 * completed ones as history (SPEC §6). Clears the customer's program pointer.
 */
export async function unenrollCustomer(customerId, programId, year) {
  const ts = await treatmentsForCustomerYear(customerId, year)
  const toDelete = ts.filter((t) => t.programId === programId && t.status !== 'completed')
  await db.treatments.bulkDelete(toDelete.map((t) => t.id))
  await updateCustomer(customerId, { treatmentProgramId: null, treatmentProgramYear: null })
  return toDelete.length
}
