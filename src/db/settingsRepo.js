// Settings live in Dexie (SPEC §3 — one export captures the whole business).
// key/value rows; helpers wrap the ones the app reads often.

import { db } from './index.js'

export const DEFAULTS = {
  targetHourlyRateCents: 6000, // $60/hr — the ONE rate config (SPEC §8)
  rateUnderpaidThreshold: 0.85,
  windDriftThresholdMph: 10,
}

export async function getSetting(key, fallback) {
  const row = await db.settings.get(key)
  return row ? row.value : (fallback ?? DEFAULTS[key])
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value })
  return value
}

export function getTargetHourlyRateCents() {
  return getSetting('targetHourlyRateCents', DEFAULTS.targetHourlyRateCents)
}
