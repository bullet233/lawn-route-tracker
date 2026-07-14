// Treatment programs (SPEC §6). A program is a plan: named steps with month-day
// windows and a billing service resolution. Seeded with a standard 5-step
// program so enrollment works out of the box.

import { db } from './index.js'
import { newId } from './ids.js'

export const DEFAULT_PROGRAM = {
  name: 'Standard 5-Step',
  active: true,
  steps: [
    { name: 'Pre-Emergent', category: 'Pre-Emergent', windowStartMMDD: '03-01', windowEndMMDD: '04-15' },
    { name: 'Spring Weed & Feed', category: 'Weed Control', windowStartMMDD: '04-16', windowEndMMDD: '05-31' },
    { name: 'Summer Fertilizer', category: 'Fertilizer', windowStartMMDD: '06-01', windowEndMMDD: '07-31' },
    { name: 'Early Fall Weed Control', category: 'Weed Control', windowStartMMDD: '08-15', windowEndMMDD: '09-30' },
    { name: 'Winterizer', category: 'Fertilizer', windowStartMMDD: '10-01', windowEndMMDD: '11-15' },
  ],
}

export function makeProgram(input) {
  return {
    id: input.id || newId(),
    name: input.name || 'Program',
    active: input.active !== false,
    steps: (input.steps || []).map((s, i) => ({
      id: s.id || newId(),
      name: s.name,
      category: s.category || 'Fertilizer',
      order: s.order ?? i,
      windowStartMMDD: s.windowStartMMDD,
      windowEndMMDD: s.windowEndMMDD,
      billingServiceId: s.billingServiceId || null,
    })),
  }
}

export async function seedDefaultProgramIfEmpty() {
  const count = await db.treatmentPrograms.count()
  if (count > 0) return false
  await db.treatmentPrograms.add(makeProgram(DEFAULT_PROGRAM))
  return true
}

export function allPrograms() {
  return db.treatmentPrograms.toArray()
}

export function getProgram(id) {
  return db.treatmentPrograms.get(id)
}

/** Save edited program steps (normalized to keep ids + ordering). */
export async function updateProgram(id, patch) {
  const current = await db.treatmentPrograms.get(id)
  const merged = makeProgram({ ...current, ...patch, id })
  await db.treatmentPrograms.put(merged)
  return merged
}
