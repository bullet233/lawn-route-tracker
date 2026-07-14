// Per-customer Stats tab computation (SPEC §8/§11). Pure & tested: takes one
// customer's visits (plus the shared mow model + target rate) and returns the
// derived performance facts the Stats tab renders — the tab does no math.

import { effectiveHourlyCents, predictMowMinutes } from './matrix.js'
import { isMowingVisit, visitRevenueCents, totalRevenueCents, revenueByCategory } from './revenue.js'
import { compareBusinessDate, daysBetween, addDays, yearOf } from './dates.js'

/** Average of a numeric list, rounded, or null when empty. */
function avg(nums) {
  if (!nums.length) return null
  let s = 0
  for (const n of nums) s += n
  return Math.round(s / nums.length)
}

/**
 * @param {Object} a
 * @param {Array} a.visits            this customer's visits
 * @param {Object} a.customer         for size/difficulty + target interval
 * @param {Object|null} a.model       fitted mow-duration model (or null)
 * @param {number} a.targetHourlyRateCents
 * @param {number|null} a.mowPriceCents  this customer's effective Mow price
 * @param {string} a.today            businessDate
 */
export function customerStats({
  visits = [],
  customer = {},
  model = null,
  targetHourlyRateCents = 0,
  mowPriceCents = null,
  today,
}) {
  const completed = visits.filter((v) => v.status === 'completed')
  const timed = completed.filter((v) => v.durationSecs > 0)
  const mows = completed.filter(isMowingVisit)
  const timedMows = mows.filter((v) => v.durationSecs > 0)

  // Profitability — pooled $/hr actually earned across timed visits here.
  let poolRev = 0
  let poolSecs = 0
  for (const v of timed) {
    poolRev += visitRevenueCents(v)
    poolSecs += v.durationSecs
  }
  const effHourlyCents = poolSecs > 0 ? effectiveHourlyCents(poolRev, poolSecs) : null

  const revenueLifetimeCents = totalRevenueCents(visits)
  const avgRevenuePerVisitCents = completed.length
    ? Math.round(revenueLifetimeCents / completed.length)
    : null
  const avgMowSecs = avg(timedMows.map((v) => v.durationSecs))

  // Predicted (size + difficulty) vs actual mow time; matrix-implied price.
  const predictedMowMinutes = predictMowMinutes(model, customer)
  const avgMowMinutes = avgMowSecs != null ? Math.round(avgMowSecs / 60) : null
  const suggestedMowPriceCents =
    predictedMowMinutes != null
      ? Math.round((predictedMowMinutes / 60) * targetHourlyRateCents)
      : null

  // Cadence — target interval vs the average gap actually run.
  const targetIntervalDays = customer.mowingIntervalDays || null
  const mowDates = [...new Set(mows.map((v) => v.businessDate))].sort(compareBusinessDate)
  let actualAvgIntervalDays = null
  if (mowDates.length >= 2) {
    const gaps = []
    for (let i = 1; i < mowDates.length; i++) gaps.push(daysBetween(mowDates[i - 1], mowDates[i]))
    actualAvgIntervalDays = avg(gaps)
  }
  const lastMowDate = mowDates.length ? mowDates[mowDates.length - 1] : null
  const daysSinceLastMow = lastMowDate ? daysBetween(lastMowDate, today) : null
  const nextDueDate = lastMowDate && targetIntervalDays ? addDays(lastMowDate, targetIntervalDays) : null
  const overdueDays = nextDueDate ? daysBetween(nextDueDate, today) : null // >=0 once due

  // Season vs lifetime.
  const season = yearOf(today)
  const seasonVisits = completed.filter((v) => yearOf(v.businessDate) === season)
  const mowsThisSeason = seasonVisits.filter(isMowingVisit).length
  const revenueThisSeasonCents = totalRevenueCents(seasonVisits)

  return {
    completedCount: completed.length,
    hasTimed: timed.length > 0,
    effHourlyCents,
    targetHourlyRateCents,
    avgRevenuePerVisitCents,
    avgMowSecs,
    avgMowMinutes,
    hasModel: !!model,
    predictedMowMinutes: predictedMowMinutes != null ? Math.round(predictedMowMinutes) : null,
    suggestedMowPriceCents,
    currentMowPriceCents: mowPriceCents,
    targetIntervalDays,
    actualAvgIntervalDays,
    lastMowDate,
    daysSinceLastMow,
    nextDueDate,
    overdueDays,
    mowsThisSeason,
    revenueThisSeasonCents,
    revenueLifetimeCents,
    byCategory: revenueByCategory(visits),
  }
}
