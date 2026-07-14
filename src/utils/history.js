// History shaping (SPEC §8/§11). Pure grouping/filtering/summary over visits;
// the screen renders the output, no reduce in JSX.

import { compareBusinessDate } from './dates.js'
import { visitHasCategory, visitRevenueCents } from './revenue.js'
import { totalRevenueCents, revenueByService } from './revenue.js'
import { dayJobSeconds, dayDriveSeconds } from './dayReview.js'

/** Filter visits to a category ('all' | 'mowing' | 'fertilizer' | 'cleanup'). */
export function filterByCategory(visits, category) {
  if (!category || category === 'all') return visits || []
  return (visits || []).filter((v) => visitHasCategory(v, category))
}

/** Group visits by businessDate, newest day first. Returns [{date, visits}]. */
export function groupByDate(visits) {
  const map = new Map()
  for (const v of visits || []) {
    if (!map.has(v.businessDate)) map.set(v.businessDate, [])
    map.get(v.businessDate).push(v)
  }
  return [...map.entries()]
    .sort((a, b) => compareBusinessDate(b[0], a[0]))
    .map(([date, dayVisits]) => ({ date, visits: dayVisits }))
}

/** Per-day totals for the calendar: { [businessDate]: {count, cents} }. */
export function dayTotals(visits) {
  const map = {}
  for (const v of visits || []) {
    if (v.status !== 'completed') continue
    const d = (map[v.businessDate] ||= { count: 0, cents: 0 })
    d.count += 1
    d.cents += visitRevenueCents(v)
  }
  return map
}

/**
 * Calendar cells for a month as weeks of 7 (businessDate strings or null pads).
 * @param {number} year @param {number} month 1-12
 */
export function monthGrid(year, month) {
  const startDow = new Date(year, month - 1, 1).getDay()
  const daysIn = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Summary tiles for a set of visits. */
export function summarize(visits) {
  const completed = (visits || []).filter((v) => v.status === 'completed')
  return {
    visitCount: completed.length,
    revenueCents: totalRevenueCents(visits),
    byService: revenueByService(visits),
    jobSecs: dayJobSeconds(visits),
    jobPlusDriveSecs: dayJobSeconds(visits) + dayDriveSeconds(visits),
  }
}
