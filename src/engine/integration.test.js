// End-to-end pipeline test: a synthetic two-stop GPS trace → the engine →
// completed visits → line items → the Day Review revenue total. Guards the
// whole field-loop the way trace replay does (SPEC §11), without Dexie.

import { describe, it, expect } from 'vitest'
import { GeofenceEngine } from './geofenceEngine.js'
import { dayRevenueCents, dayJobSeconds } from '../utils/dayReview.js'

const sq = (c, half = 0.0005) => [
  { lat: c.lat - half, lng: c.lng - half },
  { lat: c.lat - half, lng: c.lng + half },
  { lat: c.lat + half, lng: c.lng + half },
  { lat: c.lat + half, lng: c.lng - half },
]
const A = { lat: 40, lng: -75 }
const B = { lat: 40.01, lng: -75.01 }
const OUT = { lat: 40.05, lng: -75.05 }
const ZONES = [
  { customerId: 'A', polygon: sq(A) },
  { customerId: 'B', polygon: sq(B) },
]

describe('field loop integration', () => {
  it('two-stop route produces two visits that total the day', () => {
    const visits = []
    const engine = new GeofenceEngine({ onVisit: (v) => visits.push(v) })
    const fix = (p, t) => engine.processFix({ ...p, t, accuracy: 5 })

    engine.startRoute(ZONES, 0)
    fix(OUT, 1000) // driving
    // stop A
    fix(A, 2000) // arriving A
    fix(A, 11000) // onsite A (entry 2000)
    fix(A, 60000)
    fix(OUT, 65000) // exiting A
    fix(OUT, 81000) // finalize A → exit 65000, 63s
    // drive to B
    fix(B, 90000) // arriving B
    fix(B, 99000) // onsite B (entry 90000)
    fix(B, 140000)
    fix(OUT, 145000) // exiting B
    fix(OUT, 161000) // finalize B → exit 145000, 55s

    expect(visits).toHaveLength(2)
    expect(visits[0]).toMatchObject({ customerId: 'A', durationSecs: 63, source: 'gps' })
    expect(visits[1]).toMatchObject({ customerId: 'B', durationSecs: 55 })

    // attach line items as Day Review would, then check the day's rollups
    const priced = visits.map((v, i) => ({
      ...v,
      status: 'completed',
      lineItems: [{ serviceId: 'm', name: 'Mow', category: 'mowing', priceCents: i === 0 ? 4000 : 5000 }],
    }))
    expect(dayRevenueCents(priced)).toBe(9000)
    expect(dayJobSeconds(priced)).toBe(63 + 55)
  })
})
