// Split-visit modal (SPEC §9): divide one clustered visit's time across several
// customers. Defaults are proportional to lawn size (the model's own predictor);
// results are stamped source:'split' and excluded from pricing-model training.

import { useMemo, useState } from 'react'
import { Modal } from '../components/ui/index.js'
import { newId } from '../db/ids.js'
import { resolvePriceCents } from '../db/servicesRepo.js'
import { applyVisitSplit } from '../db/visitsRepo.js'
import { computeSplitWeights, splitVisit } from '../utils/splitVisit.js'
import { formatClock } from '../utils/format.js'

export function SplitVisitModal({ visit, customers, mowService, onClose, onDone }) {
  const customersById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers])
  const totalSecs = visit.durationSecs || 0

  // start with the visit's own customer; default minutes by lawn-size weight
  const [ids, setIds] = useState([visit.customerId])
  const [minutes, setMinutes] = useState(() => ({ [visit.customerId]: Math.round(totalSecs / 60) }))

  const rebalance = (nextIds) => {
    const cs = nextIds.map((id) => customersById[id])
    const weights = computeSplitWeights(cs, null)
    const next = {}
    nextIds.forEach((id, i) => (next[id] = Math.round((totalSecs / 60) * weights[i])))
    setMinutes(next)
  }

  const addCustomer = (id) => {
    if (!id || ids.includes(id)) return
    const nextIds = [...ids, id]
    setIds(nextIds)
    rebalance(nextIds)
  }
  const removeCustomer = (id) => {
    const nextIds = ids.filter((x) => x !== id)
    setIds(nextIds)
    rebalance(nextIds)
  }

  const totalMinutes = ids.reduce((s, id) => s + (minutes[id] || 0), 0)
  const available = customers.filter((c) => !ids.includes(c.id))

  async function confirm() {
    const sum = ids.reduce((s, id) => s + (minutes[id] || 0), 0) || 1
    const allocations = ids.map((id) => ({ customerId: id, weight: (minutes[id] || 0) / sum }))
    const lineItemsFor = (id) => {
      const c = customersById[id]
      return mowService ? [{ serviceId: mowService.id, name: mowService.name, category: 'mowing', priceCents: resolvePriceCents(mowService, c) }] : []
    }
    const splits = splitVisit(visit, allocations, lineItemsFor, newId)
    await applyVisitSplit(visit.id, splits)
    onDone?.()
    onClose()
  }

  return (
    <Modal
      title="Split this visit"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={ids.length < 2} onClick={confirm}>
            Split into {ids.length}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', marginTop: 0, fontSize: 'var(--fs-small)' }}>
        Total time {formatClock(totalSecs)} — divide it across the properties this stop actually
        covered. Defaults are by lawn size; adjust the minutes as needed.
      </p>

      {ids.map((id) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ flex: 1 }}>{customersById[id]?.name || 'Customer'}</span>
          <span className="unit-field" style={{ width: 110 }}>
            <input
              type="number"
              min={0}
              value={minutes[id] ?? 0}
              onChange={(e) => setMinutes((m) => ({ ...m, [id]: Number(e.target.value) }))}
            />
            <span className="unit-field__suffix">min</span>
          </span>
          {ids.length > 1 && (
            <button type="button" className="btn btn-secondary" style={{ color: 'var(--red)' }} onClick={() => removeCustomer(id)}>
              ✕
            </button>
          )}
        </div>
      ))}

      <p style={{ fontSize: 'var(--fs-small)', color: totalMinutes === Math.round(totalSecs / 60) ? 'var(--text-muted)' : 'var(--amber)' }}>
        Allocated {totalMinutes} of {Math.round(totalSecs / 60)} min
        {totalMinutes !== Math.round(totalSecs / 60) && ' (will be normalized on save)'}
      </p>

      {available.length > 0 && (
        <label style={{ display: 'block', marginTop: 8 }}>
          <span className="input-label">Add a property</span>
          <select className="input-field" value="" onChange={(e) => addCustomer(e.target.value)}>
            <option value="">Choose customer…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  )
}
