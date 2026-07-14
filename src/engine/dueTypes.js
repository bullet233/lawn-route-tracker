// Shared shape the two independent cadence engines both emit (SPEC §7).
// The route builder consumes the merged list and does not know which engine
// produced an item.
//
// DueItem = {
//   customerId,
//   engine: 'mowing' | 'treatment',
//   reason: string,          // human label ("4 days overdue", "Round 3 window")
//   dueDate: 'YYYY-MM-DD',   // the operative date for this item
//   priority: number,        // normalized urgency, higher = act sooner (see below)
//   meta?: object            // engine-specific extras (treatmentId, daysOverdue…)
// }
//
// Priority normalization (SPEC §7): both engines project onto ONE "urgency
// days" axis so the merged list sorts sensibly. Higher = more urgent.
//  - Mowing is a SHARP deadline: urgency = days overdue. A lawn gets shaggier
//    every day past due, so 0 at exactly due, +N when N days late.
//  - Treatment is a WIDE deadline: any day inside the window is equally fine
//    agronomically, so urgency is about not running out of window.
//    priority = CROSSOVER - daysUntilWindowEnd, so it crosses 0 (== a just-due
//    mow) when CROSSOVER days of window remain and keeps rising as the window
//    closes and then passes. With CROSSOVER = 6 the spec's illustrative
//    equivalence holds: a treatment with 3 days of window left (priority 3)
//    ranks like a mow 3 days overdue (priority 3).
//
// TREATMENT_CROSSOVER_DAYS is the single tuning knob that aligns the two
// scales; it lives here so both the engine and any test reference one value.

export const TREATMENT_CROSSOVER_DAYS = 6

export function makeDueItem({ customerId, engine, reason, dueDate, priority, meta }) {
  return { customerId, engine, reason, dueDate, priority, meta }
}
