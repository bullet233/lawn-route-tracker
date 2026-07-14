// Treatment/program logic (SPEC §6/§7). Programs define steps with month-day
// windows; enrolling a customer for a year materializes one treatment per step
// with concrete dates. Pure + tested; the cadence engine (treatmentCadence)
// consumes the results.

import { newId } from '../db/ids.js'
import { classifyTreatment } from '../engine/treatmentCadence.js'
import { addDays, compareBusinessDate } from './dates.js'

/** Concrete window date for a step's 'MM-DD' within a year. */
function windowDate(year, mmdd) {
  return `${year}-${mmdd}`
}

/**
 * Materialize treatments for one customer enrolling in a program for a year.
 * One treatment per step, status 'scheduled', with concrete windows.
 */
export function generateTreatments(program, customerId, year) {
  return (program.steps || []).map((step) => ({
    id: newId(),
    customerId,
    programId: program.id,
    year,
    stepId: step.id,
    stepName: step.name,
    category: step.category,
    status: 'scheduled',
    windowStart: windowDate(year, step.windowStartMMDD),
    windowEnd: windowDate(year, step.windowEndMMDD),
    dueDate: windowDate(year, step.windowEndMMDD),
    billingServiceId: step.billingServiceId || null,
    completedByVisitId: null,
  }))
}

/** Progress for a customer's year: {done, total}. One number (SPEC §6). */
export function programProgress(treatments) {
  const total = treatments.length
  const done = treatments.filter((t) => t.status === 'completed').length
  return { done, total }
}

/** Treatments in-window or overdue right now (the "Needs Attention" set). */
export function needsAttention(treatments, today) {
  return (treatments || []).filter((t) => {
    const state = classifyTreatment(t, today)
    return state === 'in-window' || state === 'overdue'
  })
}

/** Not-yet-open treatments whose window opens within `days` (Upcoming). */
export function upcoming(treatments, today, days = 45) {
  const horizon = addDays(today, days)
  return (treatments || []).filter((t) => {
    if (t.status === 'completed' || t.status === 'skipped') return false
    if (!t.windowStart) return false
    return compareBusinessDate(t.windowStart, today) > 0 && compareBusinessDate(t.windowStart, horizon) <= 0
  })
}

/**
 * The "Now" step label for a program: the step whose window contains today, or
 * the next upcoming one. Returns a stepName or null.
 */
export function currentStepName(program, today) {
  const y = today.slice(0, 4)
  for (const step of program.steps || []) {
    const ws = windowDate(y, step.windowStartMMDD)
    const we = windowDate(y, step.windowEndMMDD)
    if (compareBusinessDate(today, ws) >= 0 && compareBusinessDate(today, we) <= 0) return step.name
  }
  return null
}

/**
 * Find a customer's open treatment whose window contains `date` — the
 * complete-and-link candidate when a fertilizer line item is added (SPEC §6).
 */
export function openTreatmentInWindow(treatments, customerId, date) {
  return (treatments || []).find(
    (t) =>
      t.customerId === customerId &&
      t.status !== 'completed' &&
      t.status !== 'skipped' &&
      t.windowStart &&
      t.windowEnd &&
      compareBusinessDate(date, t.windowStart) >= 0 &&
      compareBusinessDate(date, t.windowEnd) <= 0,
  )
}
