// Geocoding (SPEC §2/§3). Customer location is geocoded ONCE at creation and
// stored first-class; the arrival zone is separate. Every call is tracked.

import { loadGoogleMaps } from './loadGoogleMaps.js'
import { recordApiCall } from './apiTracker.js'

/**
 * Geocode a free-text address to {lat, lng, formatted}. Throws on no result —
 * SPEC §3 "no silent fallbacks": the caller surfaces the failure, never zeroes.
 */
export async function geocodeAddress(address) {
  const maps = await loadGoogleMaps()
  await recordApiCall('geocode')
  const geocoder = new maps.Geocoder()
  const { results } = await geocoder.geocode({ address })
  if (!results || results.length === 0) {
    throw new Error(`No geocode result for "${address}"`)
  }
  const loc = results[0].geometry.location
  return { lat: loc.lat(), lng: loc.lng(), formatted: results[0].formatted_address }
}
