// Mowing cadence engine (SPEC §7). Pure: takes plain data, returns DueItems.
//
// A customer is "a mowing customer" iff they have an active mowing-category
// service AND mowingIntervalDays set (SPEC §6). The caller resolves that and
// passes only eligible customers, plus each one's last mowing-category visit
// date. Fertilizer-only clients are never nagged about mowing.
//
// Due when today - lastMowingCategoryVisit >= mowingIntervalDays. A customer
// who has never been mowed is due immediately. Customers with an active
// holdUntil (vacation hold) are excluded — the caller filters, and we defend
// again here.

import { daysBetween, today as todayBd, compareBusinessDate, addDays } from '../utils/dates.js'
import { makeDueItem } from './dueTypes.js'

/** Is a vacation hold currently active for this customer on `today`? */
export function onHold(customer, today) {
  if (!customer?.holdUntil) return false
  // hidden from due lists UNTIL the date → active while today < holdUntil
  return compareBusinessDate(today, customer.holdUntil) < 0
}

/**
 * @param {Object} args
 * @param {Array} args.customers  mowing-eligible customers (active mow service + interval)
 * @param {Object.<string,string|null>} args.lastMowByCustomerId  businessDate of last mowing-category visit, or null
 * @param {string} [args.today]  businessDate; defaults to local today
 * @returns {import('./dueTypes.js').DueItem[]}
 */
export function mowingDueItems({ customers, lastMowByCustomerId = {}, today = todayBd() }) {
  const out = []
  for (const c of customers || []) {
    if (!c.mowingIntervalDays || c.mowingIntervalDays <= 0) continue
    if (onHold(c, today)) continue

    const last = lastMowByCustomerId[c.id] || null
    let daysOverdue
    let dueDate

    if (!last) {
      // Never mowed → due now. Treat as exactly at the deadline today.
      daysOverdue = 0
      dueDate = today
    } else {
      dueDate = addDays(last, c.mowingIntervalDays)
      daysOverdue = daysBetween(dueDate, today) // >=0 once due, negative if not yet
    }

    if (daysOverdue < 0) continue // not due yet

    out.push(
      makeDueItem({
        customerId: c.id,
        engine: 'mowing',
        reason: last ? `${daysOverdue}d overdue` : 'never mowed',
        dueDate,
        priority: daysOverdue, // sharp deadline: urgency == days overdue
        meta: { daysOverdue, lastMow: last, intervalDays: c.mowingIntervalDays },
      }),
    )
  }
  return out
}
