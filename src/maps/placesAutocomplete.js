// Address autocomplete via Google Places (SPEC §2). Predictions only — the
// chosen text flows into the existing geocode path for lat/lng, so this adds no
// Place-details cost. Prefers the new Places API (AutocompleteSuggestion) and
// falls back to the legacy AutocompleteService; if neither is available (Places
// not enabled on the key), callers degrade to a plain text field — never fatal.

import { loadGoogleMaps } from './loadGoogleMaps.js'
import { recordApiCall } from './apiTracker.js'

let libPromise = null
async function placesLib() {
  if (libPromise) return libPromise
  libPromise = loadGoogleMaps().then((maps) => {
    if (maps.importLibrary) return maps.importLibrary('places')
    return maps.places
  })
  return libPromise
}

/** A session token groups keystrokes into one billable session. Optional. */
export async function newSessionToken() {
  const lib = await placesLib()
  const T = lib?.AutocompleteSessionToken
  return T ? new T() : undefined
}

/**
 * Address predictions for `input`.
 * @returns {Promise<Array<{description: string, placeId: string}>>}
 * Empty array when input is too short or Places is unavailable.
 */
export async function fetchAddressSuggestions(input, sessionToken) {
  const q = (input || '').trim()
  if (q.length < 3) return []
  const lib = await placesLib()
  if (!lib) return []
  await recordApiCall('autocomplete')

  // New Places API
  if (lib.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: q,
      sessionToken,
      includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
    })
    return (suggestions || [])
      .map((s) => ({
        description: s.placePrediction?.text?.text || '',
        placeId: s.placePrediction?.placeId || '',
      }))
      .filter((x) => x.description)
  }

  // Legacy AutocompleteService
  if (lib.AutocompleteService) {
    const svc = new lib.AutocompleteService()
    const preds = await new Promise((resolve) => {
      svc.getPlacePredictions({ input: q, sessionToken, types: ['address'] }, (r, status) => {
        resolve(status === 'OK' && r ? r : [])
      })
    })
    return preds.map((p) => ({ description: p.description, placeId: p.place_id }))
  }

  return []
}
