// EPA compliance log editor (SPEC §3/§9). One log per visit; products[] lists
// everything applied. Repeat-Last copies the previous log wholesale. The
// customer's specialApplications constraints are surfaced here (SPEC §6).

import { useEffect, useState } from 'react'
import { Modal, Banner, UnitField } from '../components/ui/index.js'
import { EpaPrintSheet } from './EpaPrintSheet.jsx'
import {
  logForVisit,
  lastComplianceLog,
  makeComplianceLog,
  makeProduct,
  saveComplianceLog,
  getApplicatorSettings,
} from '../db/complianceRepo.js'

export function ComplianceLogModal({ visit, customer, fertLineItems, onClose, onSaved }) {
  const [log, setLog] = useState(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      const existing = await logForVisit(visit.id)
      if (existing) {
        if (!cancelled) setLog(existing)
        return
      }
      const applicator = await getApplicatorSettings()
      // seed one product row per fertilizer line item
      const products = (fertLineItems.length ? fertLineItems : [{ name: '' }]).map((li) =>
        makeProduct({ productName: '', category: li.category || 'fertilizer' }),
      )
      const seeded = makeComplianceLog(visit.id, customer.id, {
        applicatorName: applicator.applicatorName || '',
        licenseNumber: applicator.licenseNumber || '',
        businessPhone: applicator.businessPhone || '',
        mixSite: applicator.mixSite || '',
        areaTreatedSqFt: customer.lawnSqFt ?? null,
        tempF: visit.weather?.tempF ?? null,
        windMph: visit.weather?.windMph ?? null,
        products,
      })
      if (!cancelled) setLog(seeded)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [visit, customer, fertLineItems])

  if (!log) return null
  if (printing) return <EpaPrintSheet log={log} customer={customer} onClose={() => setPrinting(false)} />

  const set = (patch) => setLog((l) => ({ ...l, ...patch }))
  const setProduct = (i, patch) =>
    setLog((l) => ({ ...l, products: l.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))
  const addProduct = () => setLog((l) => ({ ...l, products: [...l.products, makeProduct()] }))

  async function repeatLast() {
    const prev = await lastComplianceLog()
    if (!prev) return
    set({
      applicatorName: prev.applicatorName,
      licenseNumber: prev.licenseNumber,
      businessPhone: prev.businessPhone,
      mixSite: prev.mixSite,
      products: prev.products.map((p) => makeProduct(p)),
    })
  }

  async function save() {
    await saveComplianceLog(log)
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      title={`EPA log — ${customer.name}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={repeatLast}>
            Repeat last
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setPrinting(true)}>
            Print
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save log
          </button>
        </>
      }
    >
      {customer.specialApplications && (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="warn" icon="⚠️">
            {customer.specialApplications}
          </Banner>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <label>
          <span className="input-label">Applicator</span>
          <input className="input-field" value={log.applicatorName} onChange={(e) => set({ applicatorName: e.target.value })} />
        </label>
        <label>
          <span className="input-label">License #</span>
          <input className="input-field" value={log.licenseNumber} onChange={(e) => set({ licenseNumber: e.target.value })} />
        </label>
      </div>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <UnitField label="Area treated" value={log.areaTreatedSqFt} onChange={(v) => set({ areaTreatedSqFt: v })} unit="sq ft" />
        <UnitField label="Temp" value={log.tempF} onChange={(v) => set({ tempF: v })} unit="°F" />
        <UnitField label="Wind" value={log.windMph} onChange={(v) => set({ windMph: v })} unit="mph" />
      </div>

      <div className="stat-tile__label" style={{ marginBottom: 8 }}>
        Products
      </div>
      {log.products.map((p, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div className="grid-2" style={{ marginBottom: 8 }}>
            <input className="input-field" placeholder="Product name" value={p.productName} onChange={(e) => setProduct(i, { productName: e.target.value })} />
            <input className="input-field" placeholder="EPA reg #" value={p.epaRegNum} onChange={(e) => setProduct(i, { epaRegNum: e.target.value })} />
          </div>
          <input className="input-field" placeholder="Application rate (e.g. 1 lb / 1000 sqft)" value={p.applicationRate} onChange={(e) => setProduct(i, { applicationRate: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addProduct}>
        + Add product
      </button>
    </Modal>
  )
}
