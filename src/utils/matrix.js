// Pricing matrix + power model — the SINGLE implementation of this math
// (SPEC §11: any formula used twice lives in one exported function; v1's
// Analytics re-implemented difficulty normalization and fit its own inline
// regression separately from matrix.js and the two drifted).
//
// NOTE (reconciliation flag): v1's matrix.js is not present in this repo. This
// is a clean, principled re-derivation to be checked against v1's numbers when
// the real v1 export lands (SPEC §12 parity work). The MODEL SHAPE is a power
// law fit in log-log space, which matches "pricing matrix + curve" in DESIGN §6.
//
// Training input is restricted to model-eligible mowing visits by the caller
// (SPEC §6 — see revenue.isModelEligibleMowingVisit). This module is pure math
// and takes already-filtered samples.

/**
 * Difficulty multiplier for a property from its structured attributes. This is
 * the ONE normalization used by both the matrix display and the model. Neutral
 * property (flat, no obstacles) = 1.0.
 * @param {{terrain?:string, obstacleCount?:number, fencedBackyard?:boolean}} c
 */
export function difficultyMultiplier(c = {}) {
  const terrainFactor = { flat: 1.0, moderate: 1.12, hilly: 1.28 }[c.terrain || 'flat'] || 1.0
  const obstaclePenalty = 1 + 0.02 * Math.min(c.obstacleCount || 0, 12) // cap the tail
  const fenceFactor = c.fencedBackyard ? 1.06 : 1.0
  return terrainFactor * obstaclePenalty * fenceFactor
}

/**
 * Fit a power law y = a * x^b via ordinary least squares on log(x), log(y).
 * Returns {a, b, n, r2} or null when there is not enough spread to fit.
 * x = lawnSqFt, y = observed value (duration secs or price cents).
 * @param {{x:number,y:number}[]} samples
 */
export function fitPowerModel(samples) {
  const pts = (samples || []).filter((s) => s.x > 0 && s.y > 0)
  if (pts.length < 3) return null

  const lx = pts.map((p) => Math.log(p.x))
  const ly = pts.map((p) => Math.log(p.y))
  const n = pts.length
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length
  const mx = mean(lx)
  const my = mean(ly)

  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = lx[i] - mx
    sxx += dx * dx
    sxy += dx * (ly[i] - my)
  }
  if (sxx === 0) return null // all same x — no slope determinable

  const b = sxy / sxx
  const lnA = my - b * mx
  const a = Math.exp(lnA)

  // R² in log space.
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const pred = lnA + b * lx[i]
    ssRes += (ly[i] - pred) ** 2
    ssTot += (ly[i] - my) ** 2
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot

  return { a, b, n, r2 }
}

/** Evaluate a fitted power model at x. */
export function predict(model, x) {
  if (!model || x <= 0) return null
  return model.a * Math.pow(x, model.b)
}

/**
 * Predicted minutes to mow, adjusting the size-only curve by the property's
 * difficulty multiplier. Model is fit on duration-seconds vs sqft.
 * @returns {number|null} minutes
 */
export function predictMowMinutes(model, customer) {
  const base = predict(model, customer?.lawnSqFt || 0)
  if (base == null) return null
  return (base * difficultyMultiplier(customer)) / 60
}

/**
 * Build the pricing matrix: for a set of sqft buckets, the model's predicted
 * time and the price implied by the target hourly rate. This is the table the
 * Analytics screen renders (no reduce in JSX — it consumes this).
 * @param {object} model
 * @param {number[]} buckets  sqft break points
 * @param {number} targetHourlyRateCents
 */
export function pricingMatrix(model, buckets, targetHourlyRateCents) {
  return (buckets || []).map((sqft) => {
    const secs = predict(model, sqft)
    const minutes = secs == null ? null : secs / 60
    const priceCents =
      minutes == null ? null : Math.round((minutes / 60) * targetHourlyRateCents)
    return { sqft, minutes, priceCents }
  })
}

/** Effective $/hr (cents) a visit actually earned given its duration. */
export function effectiveHourlyCents(revenueCents, durationSecs) {
  if (!durationSecs || durationSecs <= 0) return null
  return Math.round((revenueCents / durationSecs) * 3600)
}
