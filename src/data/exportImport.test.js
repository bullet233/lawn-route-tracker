import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDb } from '../db/schema.js'
import {
  exportSnapshot,
  importSnapshot,
  validateSnapshot,
  serializeSnapshot,
} from './exportImport.js'

let db
let counter = 0

beforeEach(() => {
  db = createDb(`test-db-${counter++}`)
})
afterEach(async () => {
  await db.delete()
})

describe('export / import round-trip', () => {
  it('exports all stores and restores them exactly', async () => {
    await db.customers.bulkPut([
      { id: 'a', name: 'Alice', createdAt: 1 },
      { id: 'b', name: 'Bob', createdAt: 2 },
    ])
    await db.services.bulkPut([
      { id: 'm', name: 'Mow', category: 'mowing', defaultPriceCents: 4000, active: true, sortOrder: 0 },
    ])
    await db.settings.bulkPut([{ key: 'targetHourlyRateCents', value: 6000 }])

    const snap = await exportSnapshot(db, 1_700_000_000_000)
    expect(snap.app).toBe('lawn-route-tracker')
    expect(snap.schemaVersion).toBe(1)
    expect(snap.stores.customers).toHaveLength(2)

    // survives JSON serialization
    const parsed = JSON.parse(serializeSnapshot(snap))

    // wipe and restore into a fresh db
    const db2 = createDb(`test-db-${counter++}`)
    await importSnapshot(db2, parsed)
    const customers = await db2.customers.orderBy('createdAt').toArray()
    expect(customers.map((c) => c.name)).toEqual(['Alice', 'Bob'])
    expect(await db2.settings.get('targetHourlyRateCents')).toEqual({
      key: 'targetHourlyRateCents',
      value: 6000,
    })
    await db2.delete()
  })

  it('import CLEARS existing rows (restore never merges)', async () => {
    await db.customers.put({ id: 'stale', name: 'Stale', createdAt: 0 })
    const snap = {
      app: 'lawn-route-tracker',
      schemaVersion: 1,
      stores: { customers: [{ id: 'fresh', name: 'Fresh', createdAt: 1 }] },
    }
    await importSnapshot(db, snap)
    const all = await db.customers.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('fresh')
  })

  it('validateSnapshot rejects wrong app + newer schema', () => {
    expect(validateSnapshot(null).ok).toBe(false)
    expect(validateSnapshot({ app: 'other', schemaVersion: 1, stores: {} }).ok).toBe(false)
    expect(validateSnapshot({ app: 'lawn-route-tracker', schemaVersion: 999, stores: {} }).ok).toBe(
      false,
    )
    expect(validateSnapshot({ app: 'lawn-route-tracker', schemaVersion: 1, stores: {} }).ok).toBe(
      true,
    )
  })
})
