// Display formatting helpers (components only — SPEC §3).

/** Seconds → "M:SS" or "H:MM:SS". Used for the hero live timer (tabular-nums). */
export function formatClock(totalSecs) {
  const s = Math.max(0, Math.floor(totalSecs || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Seconds → compact "Nm" / "Nh Mm" for summaries. */
export function formatMinutes(totalSecs) {
  const m = Math.round((totalSecs || 0) / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
