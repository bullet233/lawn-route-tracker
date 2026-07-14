// Geometry for zones (SPEC §4). Pure, deterministic, tested. Zones are small
// (a strip of street), so treating lat as y and lng as x on a local plane is
// accurate enough for point-in-polygon and overlap; distances use haversine.

const R = 6_371_000 // earth radius, meters

const toRad = (d) => (d * Math.PI) / 180

/** Great-circle distance in meters between {lat,lng} points. */
export function haversineMeters(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Centroid (average) of a polygon's vertices. */
export function polygonCentroid(poly) {
  if (!poly || poly.length === 0) return null
  let lat = 0
  let lng = 0
  for (const p of poly) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / poly.length, lng: lng / poly.length }
}

/** Ray-casting point-in-polygon. lng=x, lat=y. Edges treated as inside-safe. */
export function pointInPolygon(point, poly) {
  if (!poly || poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng
    const yi = poly[i].lat
    const xj = poly[j].lng
    const yj = poly[j].lat
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Do two 2D segments (p1-p2, p3-p4) intersect? Used for robust overlap. */
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
    return true
  return false
}

/** True if two polygons overlap: a vertex inside the other, or edges cross. */
export function polygonsOverlap(a, b) {
  if (!a || !b || a.length < 3 || b.length < 3) return false
  if (a.some((p) => pointInPolygon(p, b))) return true
  if (b.some((p) => pointInPolygon(p, a))) return true
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]
      const b2 = b[(j + 1) % b.length]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

/**
 * All overlapping zone pairs among customers with zones.
 * @param {{customerId:string, polygon:{lat,lng}[]}[]} zones
 * @returns {{a:string,b:string}[]}
 */
export function findOverlappingCustomers(zones) {
  const withZones = (zones || []).filter((z) => z.polygon && z.polygon.length >= 3)
  const pairs = []
  for (let i = 0; i < withZones.length; i++) {
    for (let j = i + 1; j < withZones.length; j++) {
      if (polygonsOverlap(withZones[i].polygon, withZones[j].polygon)) {
        pairs.push({ a: withZones[i].customerId, b: withZones[j].customerId })
      }
    }
  }
  return pairs
}

/**
 * Which zone currently contains the point. On overlap, resolve to the zone
 * whose centroid is nearest (SPEC §4 tuned default).
 * @returns {{customerId, polygon} | null}
 */
export function zoneContaining(point, zones) {
  const hits = (zones || []).filter((z) => pointInPolygon(point, z.polygon))
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0]
  let best = null
  let bestD = Infinity
  for (const z of hits) {
    const d = haversineMeters(point, polygonCentroid(z.polygon))
    if (d < bestD) {
      bestD = d
      best = z
    }
  }
  return best
}

const METERS_PER_MILE = 1609.344

export function metersToMiles(m) {
  return (m || 0) / METERS_PER_MILE
}

/**
 * Total path distance (meters) over an ordered list of {lat,lng} points, via
 * haversine. The offline fallback for Day Review mileage when the Directions
 * API isn't used (SPEC §8) — a straight-line lower bound, clearly not driving
 * distance, but never silently zero.
 */
export function routeDistanceMeters(points) {
  const pts = (points || []).filter((p) => p && p.lat != null && p.lng != null)
  let total = 0
  for (let i = 1; i < pts.length; i++) total += haversineMeters(pts[i - 1], pts[i])
  return total
}

/**
 * A square zone polygon of `sizeMeters` per side centered on a point. Used by
 * the zone editor's tap-to-place default (SPEC §8, v1 semantics).
 */
export function squareZoneAround(center, sizeMeters) {
  const half = sizeMeters / 2
  const dLat = half / 111_320
  const dLng = half / (111_320 * Math.cos((center.lat * Math.PI) / 180))
  return [
    { lat: center.lat - dLat, lng: center.lng - dLng },
    { lat: center.lat - dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng - dLng },
  ]
}

/** Meters to the nearest zone centroid (for adaptive sampling). Infinity if none. */
export function distanceToNearestZone(point, zones) {
  let best = Infinity
  for (const z of zones || []) {
    const c = polygonCentroid(z.polygon)
    if (!c) continue
    best = Math.min(best, haversineMeters(point, c))
  }
  return best
}
