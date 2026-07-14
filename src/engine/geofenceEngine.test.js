import { describe, it, expect } from 'vitest'
import { GeofenceEngine, computeTimers } from './geofenceEngine.js'

const CENTER = { lat: 40, lng: -75 }
const square = (c, half = 0.0005) => [
  { lat: c.lat - half, lng: c.lng - half },
  { lat: c.lat - half, lng: c.lng + half },
  { lat: c.lat + half, lng: c.lng + half },
  { lat: c.lat + half, lng: c.lng - half },
]
const ZONES = [{ customerId: 'jane', polygon: square(CENTER) }]
const INSIDE = { ...CENTER }
const OUTSIDE = { lat: 40.05, lng: -75.05 }

function harness() {
  const visits = []
  const checkpoints = []
  const engine = new GeofenceEngine({
    onVisit: (v) => visits.push(v),
    onCheckpoint: (c) => checkpoints.push(c),
  })
  const fix = (point, t, accuracy = 5) => engine.processFix({ ...point, t, accuracy })
  return { engine, visits, checkpoints, fix }
}

describe('GeofenceEngine — core visit lifecycle', () => {
  it('records a normal visit with correct duration', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(OUTSIDE, 1000)
    fix(INSIDE, 2000) // arriving starts at 2000
    fix(INSIDE, 11000) // 9s >= 8s enter debounce → onsite (jobStart=2000)
    fix(INSIDE, 60000)
    fix(OUTSIDE, 65000) // exit debounce starts
    fix(OUTSIDE, 81000) // 16s >= 15s → finalize exit at 65000

    expect(visits).toHaveLength(1)
    expect(visits[0].customerId).toBe('jane')
    expect(visits[0].entryTime).toBe(2000)
    expect(visits[0].exitTime).toBe(65000)
    expect(visits[0].durationSecs).toBe(63)
    expect(visits[0].driveby).toBe(false)
    expect(engine.getState().phase).toBe('driving')
  })

  it('flags a driveby when on-site under 45s', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000)
    fix(INSIDE, 10000) // onsite jobStart=2000
    fix(OUTSIDE, 30000) // exiting at 30000 → duration 28s
    fix(OUTSIDE, 46000) // finalize
    expect(visits).toHaveLength(1)
    expect(visits[0].durationSecs).toBe(28)
    expect(visits[0].driveby).toBe(true)
  })

  it('cancels arrival if you leave before the enter debounce', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000) // arriving
    fix(OUTSIDE, 5000) // left after 3s (< 8s) → cancel
    fix(OUTSIDE, 20000)
    expect(visits).toHaveLength(0)
    expect(engine.getState().phase).toBe('driving')
  })

  it('a brief blip outside during a job does not end it', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000)
    fix(INSIDE, 11000) // onsite
    fix(OUTSIDE, 20000) // exiting starts
    fix(INSIDE, 25000) // back inside within 15s → cancel exit
    fix(INSIDE, 40000)
    expect(visits).toHaveLength(0)
    expect(engine.getState().phase).toBe('onsite')
  })
})

describe('GeofenceEngine — robustness (SPEC §4)', () => {
  it('ignores fixes worse than 30m accuracy', () => {
    const { engine, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000, 50) // junk → ignored, stays driving
    expect(engine.getState().phase).toBe('driving')
    fix(INSIDE, 3000, 5) // good → arriving
    expect(engine.getState().phase).toBe('arriving')
  })

  it('GPS-gap reconciliation backdates the exit to the last inside fix', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000)
    fix(INSIDE, 11000) // onsite jobStart=2000
    fix(INSIDE, 60000) // lastInsideFixAt = 60000
    fix(OUTSIDE, 200000) // gap 140s > 120s and outside → backdate exit to 60000
    expect(visits).toHaveLength(1)
    expect(visits[0].exitTime).toBe(60000) // NOT 200000 — gap not counted
    expect(visits[0].durationSecs).toBe(58)
  })

  it('captures drive time to the customer and resets after', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0) // drive running from t=0
    fix(OUTSIDE, 1000)
    fix(OUTSIDE, 5000)
    fix(INSIDE, 6000) // arriving (drive still accruing)
    fix(INSIDE, 14000) // onsite: drive accrued 0→14s captured
    fix(OUTSIDE, 20000)
    fix(OUTSIDE, 36000) // finalize
    expect(visits[0].driveTimeSecs).toBe(14)
  })

  it('checkpoints on every transition', () => {
    const { engine, checkpoints, fix } = harness()
    engine.startRoute(ZONES, 0)
    const before = checkpoints.length
    fix(INSIDE, 2000)
    fix(INSIDE, 11000)
    expect(checkpoints.length).toBeGreaterThan(before)
    const last = checkpoints[checkpoints.length - 1]
    expect(last.phase).toBe('onsite')
    expect(last.activeCustomerId).toBe('jane')
  })
})

describe('GeofenceEngine — pause & timers', () => {
  it('excludes paused time from job duration and never auto-exits while paused', () => {
    const { engine, visits, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000)
    fix(INSIDE, 10000) // onsite jobStart=2000
    engine.pause(20000)
    fix(OUTSIDE, 30000) // paused → must NOT finalize exit
    expect(engine.getState().phase).toBe('onsite')
    engine.resume(50000) // 30s of pause accrued
    fix(INSIDE, 52000)
    fix(OUTSIDE, 55000)
    fix(OUTSIDE, 71000) // finalize exit at 55000
    expect(visits).toHaveLength(1)
    expect(visits[0].durationSecs).toBe(23) // (55000-2000-30000)/1000
  })

  it('computeTimers derives live elapsed', () => {
    const { engine, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000)
    fix(INSIDE, 11000) // onsite jobStart=2000
    const t = computeTimers(engine.getState(), 41000)
    expect(t.jobElapsedSecs).toBe(39) // (41000-2000)/1000
  })

  it('describeResume reports an active job for the resume prompt', () => {
    const { engine, checkpoints, fix } = harness()
    engine.startRoute(ZONES, 0)
    fix(INSIDE, 2000)
    fix(INSIDE, 11000)
    const cp = checkpoints[checkpoints.length - 1]
    const resume = GeofenceEngine.describeResume(cp, 11000 + 43 * 60000)
    expect(resume.kind).toBe('onsite')
    expect(resume.customerId).toBe('jane')
    expect(resume.sinceMs).toBe(43 * 60000)
  })
})
