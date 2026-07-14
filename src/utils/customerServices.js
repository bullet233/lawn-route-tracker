// Customer "Services" tab shaping (SPEC §8/§11). Pure grouping/summary over one
// customer's visits + treatments; the tab renders the output — no reduce in JSX.

import { compareBusinessDate, daysBetween, parseBusinessDate } from './dates.js'
import { classifyTreatment } from '../engine/treatmentCadence.js'
import { groupByDate, summarize } from './history.js'

/** Human label + sort weight for a treatment's current state. */
const STATE_META = {
  overdue: { label: 'Overdue', tone: 'red', order: 0 },
  'in-window': { label: 'Due now', tone: 'green', order: 1 },
  'not-open': { label: 'Scheduled', tone: 'slate', order: 2 },
  completed: { label: 'Done', tone: 'green', order: 3 },
  skipped: { label: 'Skipped', tone: 'slate', order: 4 },
}

/** Friendly date label for a businessDate, e.g. "Jul 14, 2026". */
export function formatServiceDate(bd) {
  if (!bd) return ''
  return parseBusinessDate(bd).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "today" / "3 days ago" / "in 5 days" relative to today's businessDate. */
export function relativeDay(bd, today) {
  if (!bd) return ''
  const n = daysBetween(today, bd) // bd - today
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n < 0 ? `${-n} days ago` : `in ${n} days`
}

/**
 * Shape one customer's service record for display.
 * @returns {{
 *   completedCount:number, revenueCents:number, lastVisitDate:string|null,
 *   history:{date:string,visits:Object[]}[],
 *   treatments:{...treatment, state:string, label:string, tone:string}[],
 *   hasTreatments:boolean
 * }}
 */
export function shapeCustomerServices(visits, treatments, today) {
  const list = visits || []
  const summary = summarize(list)
  const history = groupByDate(list) // newest day first

  const shapedTreatments = (treatments || [])
    .map((t) => {
      const state = classifyTreatment(t, today)
      const meta = STATE_META[state] || { label: state, tone: 'slate', order: 9 }
      return { ...t, state, label: meta.label, tone: meta.tone, _order: meta.order }
    })
    .sort((a, b) => {
      if (a._order !== b._order) return a._order - b._order
      // within a state, earliest window first
      return compareBusinessDate(a.windowStart || a.dueDate || '', b.windowStart || b.dueDate || '')
    })

  return {
    completedCount: summary.visitCount,
    revenueCents: summary.revenueCents,
    jobSecs: summary.jobSecs,
    lastVisitDate: history.length ? history[0].date : null,
    history,
    treatments: shapedTreatments,
    hasTreatments: shapedTreatments.length > 0,
  }
}
