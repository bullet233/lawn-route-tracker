import { describe, it, expect } from 'vitest'
import {
  haversineMeters,
  pointInPolygon,
  polygonsOverlap,
  findOverlappingCustomers,
  zoneContaining,
  distanceToNearestZone,
  polygonCentroid,
  squareZoneAround,
} from './geo.js'

const square = (center, half = 0.0005) => [
  { lat: center.lat - half, lng: center.lng - half },
  { lat: center.lat - half, lng: center.lng + half },
  { lat: center.lat + half, lng: center.lng + half },
  { lat: center.lat + half, lng: center.lng - half },
]

const A = { lat: 40, lng: -75 }

describe('geo', () => {
  it('haversine ~111km per degree latitude', () => {
    expect(haversineMeters({ lat: 40, lng: -75 }, { lat: 41, lng: -75 })).toBeGreaterThan(110_000)
  })

  it('pointInPolygon', () => {
    const poly = square(A)
    expect(pointInPolygon(A, poly)).toBe(true)
    expect(pointInPolygon({ lat: 40.02, lng: -75.02 }, poly)).toBe(false)
  })

  it('polygonsOverlap detects overlap and separation', () => {
    expect(polygonsOverlap(square(A), square({ lat: 40.0003, lng: -75 }))).toBe(true)
    expect(polygonsOverlap(square(A), square({ lat: 40.02, lng: -75 }))).toBe(false)
  })

  it('findOverlappingCustomers returns pairs', () => {
    const zones = [
      { customerId: 'a', polygon: square(A) },
      { customerId: 'b', polygon: square({ lat: 40.0003, lng: -75 }) },
      { customerId: 'c', polygon: square({ lat: 41, lng: -75 }) },
    ]
    const pairs = findOverlappingCustomers(zones)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toEqual({ a: 'a', b: 'b' })
  })

  it('zoneContaining resolves overlap by nearest centroid', () => {
    const zones = [
      { customerId: 'a', polygon: square(A, 0.001) },
      { customerId: 'b', polygon: square({ lat: 40.0006, lng: -75 }, 0.001) },
    ]
    // point closer to b's center
    const hit = zoneContaining({ lat: 40.0006, lng: -75 }, zones)
    expect(hit.customerId).toBe('b')
  })

  it('squareZoneAround builds a centered square of ~the given size', () => {
    const poly = squareZoneAround(A, 40)
    expect(poly).toHaveLength(4)
    // centroid back at the center
    const c = polygonCentroid(poly)
    expect(c.lat).toBeCloseTo(A.lat, 6)
    expect(c.lng).toBeCloseTo(A.lng, 6)
    // side length ~40m (bottom edge)
    expect(haversineMeters(poly[0], poly[1])).toBeGreaterThan(35)
    expect(haversineMeters(poly[0], poly[1])).toBeLessThan(45)
    // the center point is inside
    expect(pointInPolygon(A, poly)).toBe(true)
  })

  it('distanceToNearestZone', () => {
    const zones = [{ customerId: 'a', polygon: square(A) }]
    expect(distanceToNearestZone(A, zones)).toBeLessThan(5)
    expect(distanceToNearestZone({ lat: 41, lng: -75 }, zones)).toBeGreaterThan(100_000)
    expect(polygonCentroid(square(A)).lat).toBeCloseTo(40, 6)
  })
})
