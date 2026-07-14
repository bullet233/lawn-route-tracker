// Settings (SPEC §8/§10): the one rate config, applicator info, Google Maps
// cost, backup/restore. Everything persists in Dexie so a backup captures it.

import { useEffect, useState } from 'react'
import { Card, SectionTitle, UnitField, Banner } from '../components/ui/index.js'
import { db } from '../db/index.js'
import { getSetting, setSetting, DEFAULTS } from '../db/settingsRepo.js'
import { getUsage } from '../maps/apiTracker.js'
import { downloadBackup } from '../data/download.js'
import { importSnapshot, validateSnapshot } from '../data/exportImport.js'
import { parsePriceToCents } from '../utils/money.js'
import { generateSampleData, wipeAll } from '../dev/sampleData.js'
import { recentErrors, clearErrorLog } from '../db/errorRepo.js'

export function Settings({ onClose }) {
  const [rateCents, setRateCents] = useState(null)
  const [wind, setWind] = useState(null)
  const [applicator, setApplicator] = useState({})
  const [usage, setUsage] = useState(null)
  const [msg, setMsg] = useState(null)
  const [errors, setErrors] = useState([])

  useEffect(() => {
    Promise.all([
      getSetting('targetHourlyRateCents'),
      getSetting('windDriftThresholdMph'),
      getSetting('applicator', {}),
      getUsage(),
    ]).then(([r, w, a, u]) => {
      setRateCents(r)
      setWind(w)
      setApplicator(a || {})
      setUsage(u)
    })
    recentErrors(25).then(setErrors)
  }, [])

  if (rateCents == null) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const saveApplicator = (patch) => {
    const next = { ...applicator, ...patch }
    setApplicator(next)
    setSetting('applicator', next)
  }

  async function restore(file) {
    const text = await file.text()
    let snapshot
    try {
      snapshot = JSON.parse(text)
    } catch {
      setMsg('That file is not valid JSON.')
      return
    }
    const { ok, errors } = validateSnapshot(snapshot)
    if (!ok) {
      setMsg('Invalid backup: ' + errors.join(', '))
      return
    }
    if (!confirm('Restore will REPLACE all current data with this backup. Continue?')) return
    await importSnapshot(db, snapshot)
    setMsg('Restored. Reload to see everything.')
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginBottom: 12 }}>
        ← Back
      </button>
      <h1 className="page-title" style={{ marginBottom: 8 }}>
        Settings
      </h1>

      {msg && (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="info" icon="ℹ️">
            {msg}
          </Banner>
        </div>
      )}

      <SectionTitle icon="💵">Rates</SectionTitle>
      <Card style={{ marginBottom: 12 }}>
        <div className="grid-2">
          <label>
            <span className="input-label">Target hourly rate</span>
            <span className="unit-field">
              <span className="unit-field__suffix">$</span>
              <input
                type="number"
                value={(rateCents / 100).toString()}
                onChange={(e) => {
                  const cents = parsePriceToCents(e.target.value)
                  setRateCents(cents)
                  setSetting('targetHourlyRateCents', cents)
                }}
              />
              <span className="unit-field__suffix">/hr</span>
            </span>
          </label>
          <UnitField
            label="Wind drift threshold"
            value={wind}
            onChange={(v) => {
              setWind(v ?? DEFAULTS.windDriftThresholdMph)
              setSetting('windDriftThresholdMph', v ?? DEFAULTS.windDriftThresholdMph)
            }}
            unit="mph"
          />
        </div>
      </Card>

      <SectionTitle icon="🧪">Applicator (EPA records)</SectionTitle>
      <Card style={{ marginBottom: 12 }}>
        <div className="grid-2">
          <label>
            <span className="input-label">Applicator name</span>
            <input className="input-field" value={applicator.applicatorName || ''} onChange={(e) => saveApplicator({ applicatorName: e.target.value })} />
          </label>
          <label>
            <span className="input-label">License #</span>
            <input className="input-field" value={applicator.licenseNumber || ''} onChange={(e) => saveApplicator({ licenseNumber: e.target.value })} />
          </label>
          <label>
            <span className="input-label">Business phone</span>
            <input className="input-field" value={applicator.businessPhone || ''} onChange={(e) => saveApplicator({ businessPhone: e.target.value })} />
          </label>
          <label>
            <span className="input-label">Mix site</span>
            <input className="input-field" value={applicator.mixSite || ''} onChange={(e) => saveApplicator({ mixSite: e.target.value })} />
          </label>
        </div>
      </Card>

      <SectionTitle icon="🗺️">Google Maps cost</SectionTitle>
      <Card style={{ marginBottom: 12 }}>
        {usage && Object.keys(usage.counts).length > 0 ? (
          <>
            {Object.entries(usage.counts).map(([type, n]) => (
              <div key={type} className="data-row">
                <span className="data-row__label">{type}</span>
                <span className="data-row__value tabular">{n}</span>
              </div>
            ))}
            <div className="data-row">
              <span className="data-row__label">Estimated cost</span>
              <span className="data-row__value tabular">${usage.totalCost.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No API calls tracked yet.</p>
        )}
      </Card>

      <SectionTitle icon="💾">Backup & restore</SectionTitle>
      <Card>
        <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: 'var(--fs-small)' }}>
          A backup also downloads automatically at every Day Review save. Restore replaces all data.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => downloadBackup(Date.now())}>
            Download backup
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Restore from file…
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && restore(e.target.files[0])} />
          </label>
        </div>
      </Card>

      <SectionTitle icon="🐛" count={errors.length}>
        Error log
      </SectionTitle>
      <Card style={{ marginBottom: 12 }}>
        {errors.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No errors logged — all clear.</p>
        ) : (
          <>
            {errors.map((e) => (
              <div key={e.seq} className="data-row">
                <span className="data-row__label" style={{ fontSize: 'var(--fs-small)' }}>
                  {new Date(e.at).toLocaleString()}
                </span>
                <span className="data-row__value" style={{ fontWeight: 400, color: 'var(--red)', fontSize: 'var(--fs-small)' }}>
                  {e.message}
                </span>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 8 }}
              onClick={async () => {
                await clearErrorLog()
                setErrors([])
              }}
            >
              Clear log
            </button>
          </>
        )}
      </Card>

      {import.meta.env.DEV && (
        <>
          <SectionTitle icon="🧪">Developer / testing</SectionTitle>
          <Card style={{ borderStyle: 'dashed' }}>
            <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: 'var(--fs-small)' }}>
              Sample data replaces everything with a generated season (customers, zones, a mowing
              history, treatment enrollments). Wipe clears all data.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  if (!confirm('Replace ALL data with generated sample data?')) return
                  const r = await generateSampleData()
                  setMsg(`Loaded ${r.customers} customers, ${r.visits} visits, ${r.treatments} treatments. Reload to see it.`)
                }}
              >
                Load sample data
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ color: 'var(--red)' }}
                onClick={async () => {
                  if (!confirm('Wipe ALL data?')) return
                  await wipeAll()
                  setMsg('All data wiped. Reload.')
                }}
              >
                Wipe all data
              </button>
            </div>
          </Card>
        </>
      )}
    </>
  )
}
