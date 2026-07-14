// Real GPS fix source (SPEC §4). Feeds navigator.geolocation into the engine
// via session.pushFix. Enabled only while a route is active and the user opts
// in (the browser prompts for permission). Adaptive accuracy follows the
// engine's sampling hint (SPEC §4.7) — high accuracy near a zone, coarse far.

import { useEffect, useState } from 'react'

export function useGeolocation(session, enabled) {
  const [error, setError] = useState(null)
  const active = session?.active
  const highAccuracy = session?.state?.sampling !== 'coarse'

  useEffect(() => {
    if (!enabled || !active) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not available in this browser.')
      return
    }
    setError(null)
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        session.pushFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          t: Date.now(),
        })
      },
      (err) => setError(err.message || 'GPS error'),
      { enableHighAccuracy: highAccuracy, maximumAge: 0, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled, active, highAccuracy, session])

  return { error }
}
