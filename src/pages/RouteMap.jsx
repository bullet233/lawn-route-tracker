// Route overview map (SPEC §5) — numbered pins for each stop in order, the
// route line between them, and the operator's live GPS position. This is the
// "where am I / where's the next house" view during a route; actual turn-by-turn
// is handed off to the phone's native maps app (see directionsUrl in LiveRoute).
//
// Map tiles are an enhancement, not load-bearing: if the Maps JS fails (no key,
// referrer block, offline) the parent still shows the stop list + Navigate
// buttons, so the map error is non-fatal.

import { useEffect, useRef, useState } from 'react'
import { Banner } from '../components/ui/index.js'
import { loadGoogleMaps } from '../maps/loadGoogleMaps.js'

const PIN = { done: '#94a3b8', next: '#10b981', pending: '#2563eb' }

// A colored numbered pin as a data-URI SVG so we don't depend on marker assets.
function pinIcon(maps, color, label) {
  return {
    url:
      'data:image/svg+xml;charset=UTF-8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
          <circle cx="15" cy="15" r="11" fill="#fff"/>
          <text x="15" y="20" font-size="14" font-family="Arial" font-weight="700" fill="${color}" text-anchor="middle">${label}</text>
        </svg>`,
      ),
    scaledSize: new maps.Size(30, 40),
    anchor: new maps.Point(15, 40),
  }
}

export function RouteMap({ stops, currentPos, height = 300 }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const lineRef = useRef(null)
  const posRef = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  // located stops only (skip customers with no geocoded location)
  const located = (stops || []).filter((s) => s.location)
  const stopsKey = located.map((s) => `${s.id}:${s.done ? 1 : 0}:${s.isNext ? 1 : 0}`).join('|')

  // create the map once
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !divRef.current) return
        mapRef.current = new maps.Map(divRef.current, {
          center: located[0]?.location || currentPos || { lat: 39.96, lng: -83 },
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        })
        setReady(true)
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (re)draw stop pins + the route line whenever the stop set/state changes
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const maps = window.google.maps
    const map = mapRef.current

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = located.map((s, i) => {
      const color = s.done ? PIN.done : s.isNext ? PIN.next : PIN.pending
      return new maps.Marker({
        position: s.location,
        map,
        title: s.name,
        icon: pinIcon(maps, color, String(i + 1)),
        zIndex: s.isNext ? 1000 : 100 - i,
      })
    })

    if (lineRef.current) lineRef.current.setMap(null)
    if (located.length >= 2) {
      lineRef.current = new maps.Polyline({
        path: located.map((s) => s.location),
        map,
        strokeColor: '#2563eb',
        strokeOpacity: 0.5,
        strokeWeight: 3,
      })
    }

    fitBounds(maps, map, located, currentPos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stopsKey])

  // move the live-position dot + keep it in view
  useEffect(() => {
    if (!ready || !mapRef.current || !currentPos) return
    const maps = window.google.maps
    if (!posRef.current) {
      posRef.current = new maps.Marker({
        map: mapRef.current,
        title: 'You',
        zIndex: 2000,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#1d4ed8',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
      })
    }
    posRef.current.setPosition(currentPos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, currentPos])

  if (error) {
    return (
      <Banner variant="warn" icon="🗺️">
        Map unavailable ({error}). The stop list and Navigate buttons still work.
      </Banner>
    )
  }

  return (
    <div
      ref={divRef}
      style={{
        width: '100%',
        height,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-inset)',
      }}
    />
  )
}

function fitBounds(maps, map, located, currentPos) {
  const pts = located.map((s) => s.location)
  if (currentPos) pts.push(currentPos)
  if (pts.length === 0) return
  if (pts.length === 1) {
    map.setCenter(pts[0])
    map.setZoom(15)
    return
  }
  const b = new maps.LatLngBounds()
  pts.forEach((p) => b.extend(p))
  map.fitBounds(b, 48)
}
