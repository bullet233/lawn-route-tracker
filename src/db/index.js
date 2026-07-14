// The app's single Dexie instance. Import `db` anywhere that needs storage.
// Tests never import this module — they build isolated DBs via createDb() so
// they can run against fake-indexeddb without touching the real database.

import { createDb } from './schema.js'

export const db = createDb()

export { STORE_NAMES, SCHEMA_VERSION, DB_NAME } from './schema.js'
