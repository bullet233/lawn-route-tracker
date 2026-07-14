import { describe, it, expect } from 'vitest'
import {
  generateTreatments,
  programProgress,
  needsAttention,
  upcoming,
  currentStepName,
  openTreatmentInWindow,
} from './treatments.js'

const program = {
  id: 'p1',
  name: 'Standard 5-Step',
  steps: [
    { id: 's1', name: 'Pre-Emergent', category: 'Pre-Emergent', windowStartMMDD: '03-01', windowEndMMDD: '04-15' },
    { id: 's2', name: 'Weed & Feed', category: 'Weed Control', windowStartMMDD: '04-16', windowEndMMDD: '05-31' },
    { id: 's3', name: 'Summer Fert', category: 'Fertilizer', windowStartMMDD: '06-01', windowEndMMDD: '07-31' },
  ],
}

describe('treatments', () => {
  it('generateTreatments materializes concrete windows', () => {
    const ts = generateTreatments(program, 'c1', 2026)
    expect(ts).toHaveLength(3)
    expect(ts[0]).toMatchObject({
      customerId: 'c1',
      programId: 'p1',
      year: 2026,
      stepName: 'Pre-Emergent',
      status: 'scheduled',
      windowStart: '2026-03-01',
      windowEnd: '2026-04-15',
    })
    expect(ts.every((t) => t.id)).toBe(true)
  })

  it('programProgress counts completed', () => {
    const ts = generateTreatments(program, 'c1', 2026)
    ts[0].status = 'completed'
    expect(programProgress(ts)).toEqual({ done: 1, total: 3 })
  })

  it('needsAttention returns in-window + overdue only', () => {
    const ts = generateTreatments(program, 'c1', 2026)
    // On 2026-07-14: s3 window (06-01..07-31) is in-window; s1/s2 overdue
    const na = needsAttention(ts, '2026-07-14')
    expect(na.map((t) => t.stepName).sort()).toEqual(['Pre-Emergent', 'Summer Fert', 'Weed & Feed'])
    // completed/skipped drop out
    ts[0].status = 'completed'
    expect(needsAttention(ts, '2026-07-14').map((t) => t.stepName)).not.toContain('Pre-Emergent')
  })

  it('upcoming finds windows opening within N days', () => {
    const ts = generateTreatments(program, 'c1', 2026)
    // On 2026-05-20, s3 opens 06-01 (within 45d); s1/s2 already open (excluded)
    const up = upcoming(ts, '2026-05-20', 45)
    expect(up.map((t) => t.stepName)).toEqual(['Summer Fert'])
  })

  it('currentStepName finds the window containing today', () => {
    expect(currentStepName(program, '2026-07-14')).toBe('Summer Fert')
    expect(currentStepName(program, '2026-12-25')).toBeNull()
  })

  it('openTreatmentInWindow matches customer + date within window', () => {
    const ts = generateTreatments(program, 'c1', 2026)
    const hit = openTreatmentInWindow(ts, 'c1', '2026-07-14')
    expect(hit.stepName).toBe('Summer Fert')
    expect(openTreatmentInWindow(ts, 'c2', '2026-07-14')).toBeUndefined() // wrong customer
    expect(openTreatmentInWindow(ts, 'c1', '2026-12-01')).toBeUndefined() // no window
  })
})
