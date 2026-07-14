// Zone editor (SPEC §8): satellite map, tap-to-place square arrival zone,
// size slider, drag to reposition, overlap warning against other customers'
// zones (our own geo.polygonsOverlap, not Google's). Saves the polygon as
// customer.arrivalZone and ensures a first-class location (SPEC §3).

import { useEffect, useRef, useState } from 'react'
import { Modal, Banner } from '../components/ui/index.js'
import { loadGoogleMaps } from '../maps/loadGoogleMaps.js'
import { squareZoneAround, polygonCentroid, polygonsOverlap } from '../engine/geo.js'
import { updateCustomer } from '../db/customersRepo.js'

const toLatLngArray = (path) => path.map((p) => ({ lat: p.lat, lng: p.lng }))

export function ZoneEditor({ customer, otherZones = [], initialCenter, onClose, onSaved }) {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const polyRef = useRef(null)
  const centerRef = useRef(
    initialCenter ||
      (customer.arrivalZone ? polygonCentroid(customer.arrivalZone) : customer.location) || null,
  )

  const [size, setSize] = useState(() => 40)
  const [overlap, setOverlap] = useState(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  // rebuild the polygon paths from the current center + size, then re-check overlap
  const redraw = () => {
    const center = centerRef.current
    if (!center || !polyRef.current) return
    const path = squareZoneAround(center, size)
    polyRef.current.setPaths(path)
    checkOverlap(path)
  }

  const checkOverlap = (path) => {
    const poly = toLatLngArray(path)
    const hit = otherZones.find((z) => z.polygon && polygonsOverlap(poly, z.polygon))
    setOverlap(hit ? hit.name || hit.customerId : null)
  }

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !mapDivRef.current) return
        const center = centerRef.current || { lat: 40, lng: -75 }
        const map = new maps.Map(mapDivRef.current, {
          center,
          zoom: 19,
          mapTypeId: 'satellite',
          tilt: 0,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        })
        mapRef.current = map

        const poly = new maps.Polygon({
          paths: centerRef.current ? squareZoneAround(centerRef.current, 40) : [],
          editable: false,
          draggable: true,
          fillColor: '#10b981',
          fillOpacity: 0.25,
          strokeColor: '#059669',
          strokeWeight: 2,
        })
        poly.setMap(map)
        polyRef.current = poly

        // tap to (re)place the zone center
        map.addListener('click', (e) => {
          centerRef.current = { lat: e.latLng.lat(), lng: e.latLng.lng() }
          redraw()
        })
        // drag to reposition — recompute center from the dragged path
        poly.addListener('dragend', () => {
          const path = poly.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() }))
          centerRef.current = polygonCentroid(path)
          checkOverlap(path)
        })

        setReady(true)
        if (centerRef.current) checkOverlap(squareZoneAround(centerRef.current, 40))
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // re-draw whenever the size slider changes
  useEffect(() => {
    if (ready) redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ready])

  async function save() {
    const center = centerRef.current
    if (!center) {
      setError('Tap the map to place the zone first.')
      return
    }
    const path = squareZoneAround(center, size)
    await updateCustomer(customer.id, {
      arrivalZone: path,
      // ensure a first-class location; keep the geocoded one if present
      location: customer.location || center,
    })
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      title={`Arrival zone — ${customer.name}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!ready || !!error}>
            Save zone
          </button>
        </>
      }
    >
      {error && (
        <Banner variant="error" icon="⚠️">
          {error}
        </Banner>
      )}
      {overlap && (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="warn" icon="⚠️">
            This zone overlaps {overlap}. Overlapping zones make the timer pick the wrong customer.
          </Banner>
        </div>
      )}
      <p style={{ color: 'var(--text-muted)', margin: '0 0 8px', fontSize: 'var(--fs-small)' }}>
        Tap the street in front of the property to place the zone. Drag to nudge it.
      </p>
      <div
        ref={mapDivRef}
        style={{ width: '100%', height: 320, borderRadius: 'var(--radius-sm)', background: 'var(--bg-inset)' }}
      />
      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="input-label">Zone size — {size} m</span>
        <input
          type="range"
          min={15}
          max={70}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </label>
    </Modal>
  )
}
