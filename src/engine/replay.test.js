// Trace-replay regression test (SPEC §11). A recorded gpsTraces day, replayed,
// must produce the asserted visit log. This is the template for turning any
// real field bug into a permanent fixture: drop the recorded trace + expected
// visits here.

import { describe, it, expect } from 'vitest'
import { replayTrace } from './replay.js'
import fixture from './fixtures/twoStopDay.json'

describe('trace replay', () => {
  it('reproduces the expected visit log from a recorded day', () => {
    const visits = replayTrace(fixture.points, fixture.zones)
    expect(visits).toHaveLength(fixture.expectedVisits.length)
    fixture.expectedVisits.forEach((exp, i) => {
      expect(visits[i].customerId).toBe(exp.customerId)
      expect(visits[i].durationSecs).toBe(exp.durationSecs)
    })
  })

  it('is deterministic — same trace, same result', () => {
    const a = replayTrace(fixture.points, fixture.zones)
    const b = replayTrace(fixture.points, fixture.zones)
    expect(a.map((v) => v.durationSecs)).toEqual(b.map((v) => v.durationSecs))
  })
})
