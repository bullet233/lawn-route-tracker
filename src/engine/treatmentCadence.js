// Treatment cadence engine (SPEC §7). Ports v1's classifyTreatment window
// logic. Pure: takes treatments + their customers, returns DueItems.
//
// A treatment carries a window [windowStart, windowEnd] (businessDate strings)
// and a status. Only open/overdue treatments whose customer is not on hold and
// whose window has opened emit a DueItem. Completed and skipped never emit.
//
// Priority (wide deadline, SPEC §7): rises as the window closes. It crosses 0
// — equal urgency to a just-due mow — when TREATMENT_CROSSOVER_DAYS of window
// remain, and keeps climbing as the window runs out and passes.

import { daysBetween, today as todayBd, compareBusinessDate } from '../utils/dates.js'
import { makeDueItem, TREATMENT_CROSSOVER_DAYS } from './dueTypes.js'
import { onHold } from './mowingCadence.js'

/**
 * Classify a treatment relative to `today`.
 * @returns {'not-open'|'in-window'|'overdue'|'completed'|'skipped'}
 */
export function classifyTreatment(t, today) {
  if (t.status === 'completed') return 'completed'
  if (t.status === 'skipped') return 'skipped'
  if (t.windowStart && compareBusinessDate(today, t.windowStart) < 0) return 'not-open'
  if (t.windowEnd && compareBusinessDate(today, t.windowEnd) > 0) return 'overdue'
  return 'in-window'
}

/**
 * @param {Object} args
 * @param {Array} args.treatments  all treatments for the active year(s)
 * @param {Object.<string,Object>} args.customersById  for hold + labeling
 * @param {string} [args.today]
 * @param {number} [args.crossoverDays]
 * @returns {import('./dueTypes.js').DueItem[]}
 */
export function treatmentDueItems({
  treatments,
  customersById = {},
  today = todayBd(),
  crossoverDays = TREATMENT_CROSSOVER_DAYS,
}) {
  const out = []
  for (const t of treatments || []) {
    const state = classifyTreatment(t, today)
    if (state !== 'in-window' && state !== 'overdue') continue

    const customer = customersById[t.customerId]
    if (customer && onHold(customer, today)) continue

    // Days remaining until the window's hard end. Negative once past it.
    const daysUntilEnd = t.windowEnd ? daysBetween(today, t.windowEnd) : crossoverDays
    // Cross 0 when `crossoverDays` remain; climb as the window closes/passes.
    const priority = crossoverDays - daysUntilEnd

    out.push(
      makeDueItem({
        customerId: t.customerId,
        engine: 'treatment',
        reason:
          state === 'overdue'
            ? `${t.stepName || 'treatment'} window closed`
            : `${t.stepName || 'treatment'} · ${Math.max(daysUntilEnd, 0)}d of window left`,
        dueDate: t.windowEnd || t.dueDate || today,
        priority,
        meta: {
          treatmentId: t.id,
          programId: t.programId,
          state,
          daysUntilEnd,
          stepName: t.stepName,
        },
      }),
    )
  }
  return out
}
