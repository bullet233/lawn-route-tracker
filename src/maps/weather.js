// Weather capture (SPEC §3/§6). Open-Meteo — free, no API key, CORS-enabled —
// fits the local-first, no-backend design. Current temp + wind for a point;
// the visit stores it and the EPA log auto-fills tempF/windMph (drift-dispute
// evidence). Tracked via apiTracker for call-count visibility.

import { recordApiCall } from './apiTracker.js'

/**
 * Current weather at {lat,lng}: { tempF, windMph }. Returns null on failure —
 * the caller flags the visit for manual entry rather than storing a fake zero
 * (SPEC §3 "no silent fallbacks").
 */
export async function getCurrentWeather(lat, lng) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    recordApiCall('weather').catch(() => {})
    const cur = data.current
    if (!cur) return null
    return {
      tempF: Math.round(cur.temperature_2m),
      windMph: Math.round(cur.wind_speed_10m),
      capturedAt: cur.time || null,
    }
  } catch {
    return null
  }
}
