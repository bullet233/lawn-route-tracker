// Backup download (SPEC §10 — a full snapshot auto-downloads at every Day
// Review save; EPA records are legal documents, max acceptable loss is one
// day). Browser download via a Blob + object URL.

import { db } from '../db/index.js'
import { exportSnapshot, serializeSnapshot } from './exportImport.js'

/** Trigger a browser download of a text file. */
export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Export the whole DB and download it. Returns the filename used. */
export async function downloadBackup(now = Date.now()) {
  const snapshot = await exportSnapshot(db, now)
  const stamp = snapshot.exportedAt
  const filename = `lawn-route-tracker-backup-${stamp}.json`
  downloadText(filename, serializeSnapshot(snapshot))
  return filename
}
