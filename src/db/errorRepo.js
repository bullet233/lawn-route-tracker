// Error log (SPEC §3/§8) — a solo operator has no telemetry; this is the
// substitute. Caught exceptions + context, capped, viewable in Settings.

import { db } from './index.js'

const CAP = 200

/** Record an error. Never throws — logging must not cascade. */
export async function logError(message, extra = {}) {
  try {
    await db.errorLog.add({
      at: extra.at ?? Date.now(),
      message: String(message),
      stack: extra.stack || null,
      context: extra.context || null,
    })
    const count = await db.errorLog.count()
    if (count > CAP) {
      const oldest = await db.errorLog.orderBy('seq').limit(count - CAP).primaryKeys()
      await db.errorLog.bulkDelete(oldest)
    }
  } catch {
    /* swallow — logging failures are non-fatal */
  }
}

/** Most-recent-first. */
export function recentErrors(n = 50) {
  return db.errorLog.orderBy('seq').reverse().limit(n).toArray()
}

export function clearErrorLog() {
  return db.errorLog.clear()
}
