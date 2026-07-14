// Singleton loader for the Google Maps JS API (SPEC §2). Loads once, tracks the
// map load via apiTracker. The geometry library ships for our overlap math; we
// keep our own geo.js as the source of truth but geometry is handy for map work.

import { recordApiCall } from './apiTracker.js'

let promise = null

export function googleMapsKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY
}

export function loadGoogleMaps() {
  if (promise) return promise
  promise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Google Maps requires a browser'))
      return
    }
    if (window.google?.maps) {
      resolve(window.google.maps)
      return
    }
    const key = googleMapsKey()
    if (!key) {
      reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not set'))
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`
    script.async = true
    script.defer = true
    script.onload = () => {
      recordApiCall('mapLoad').catch(() => {})
      resolve(window.google.maps)
    }
    script.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
    document.head.appendChild(script)
  })
  return promise
}
