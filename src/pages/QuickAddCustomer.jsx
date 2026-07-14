// Quick-add customer (SPEC §9 — name + minimal is enough from the truck; the
// rest gets filled at home). Zone placement is Phase-2 zone-editor work; here
// we capture the office-desk fields.

import { useState } from 'react'
import { Modal, UnitField } from '../components/ui/index.js'
import { addCustomer } from '../db/customersRepo.js'

export function QuickAddCustomer({ onClose, onAdded }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [lawnSqFt, setLawnSqFt] = useState(null)
  const [mowingIntervalDays, setInterval] = useState(null)
  const [saving, setSaving] = useState(false)

  const canSave = name.trim().length > 0 && !saving

  async function save() {
    setSaving(true)
    const record = await addCustomer({ name, address, phone, lawnSqFt, mowingIntervalDays })
    onAdded?.(record)
    onClose()
  }

  return (
    <Modal
      title="New customer"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            Add customer
          </button>
        </>
      }
    >
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="input-label">Name *</span>
        <input
          className="input-field"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer name"
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="input-label">Address</span>
        <input
          className="input-field"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address"
        />
      </label>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="input-label">Phone</span>
        <input
          className="input-field"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
        />
      </label>
      <div className="grid-2">
        <UnitField
          label="Lawn size"
          value={lawnSqFt}
          onChange={setLawnSqFt}
          unit="sq ft"
          min={0}
          placeholder="e.g. 8000"
        />
        <UnitField
          label="Mow interval"
          value={mowingIntervalDays}
          onChange={setInterval}
          unit="days"
          min={1}
          placeholder="e.g. 7"
        />
      </div>
    </Modal>
  )
}
