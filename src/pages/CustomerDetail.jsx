// Customer detail (SPEC §8, DESIGN §6). Keeps v1's tab structure
// (Details / Services / Stats / Location / Fertilizer) rebuilt from shared
// components. Phase 2 wires the Details tab (editable) + Location placeholder
// for the zone editor; Services/Stats/Fertilizer fill in as those systems land.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Pill, DataRow, UnitField, Banner } from '../components/ui/index.js'
import { updateCustomer, deleteCustomer, allCustomers } from '../db/customersRepo.js'
import { customerSubtitle } from '../utils/customerView.js'
import { geocodeAddress } from '../maps/geocode.js'
import { ZoneEditor } from './ZoneEditor.jsx'

const TABS = ['Details', 'Services', 'Stats', 'Location', 'Fertilizer']

export function CustomerDetail({ customer, onBack, onDeleted }) {
  const [tab, setTab] = useState('Details')

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 12 }}>
        ← All clients
      </button>
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        {customer.name}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>{customerSubtitle(customer)}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <Pill key={t} selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>

      {tab === 'Details' && <DetailsTab customer={customer} onDeleted={onDeleted} />}
      {tab === 'Location' && <LocationTab customer={customer} />}
      {tab !== 'Details' && tab !== 'Location' && (
        <Card>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            {tab} tab arrives with its system (Phase 2–4). Data model is ready.
          </p>
        </Card>
      )}
    </>
  )
}

function DetailsTab({ customer, onDeleted }) {
  const [form, setForm] = useState(customer)
  const [savedAt, setSavedAt] = useState(null)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    await updateCustomer(customer.id, {
      name: form.name,
      address: form.address,
      phone: form.phone,
      email: form.email,
      lawnSqFt: form.lawnSqFt,
      mowingIntervalDays: form.mowingIntervalDays,
      terrain: form.terrain,
      obstacleCount: form.obstacleCount,
      fencedBackyard: form.fencedBackyard,
      propertyNotes: form.propertyNotes,
      specialApplications: form.specialApplications,
    })
    setSavedAt(Date.now())
  }

  async function remove() {
    if (!confirm(`Delete ${customer.name}? This cannot be undone.`)) return
    await deleteCustomer(customer.id)
    onDeleted?.()
  }

  return (
    <>
      <Card>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="input-label">Name</span>
          <input className="input-field" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="input-label">Address</span>
          <input
            className="input-field"
            value={form.address || ''}
            onChange={(e) => set({ address: e.target.value })}
          />
        </label>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <label style={{ display: 'block' }}>
            <span className="input-label">Phone</span>
            <input className="input-field" value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} />
          </label>
          <label style={{ display: 'block' }}>
            <span className="input-label">Email</span>
            <input className="input-field" value={form.email || ''} onChange={(e) => set({ email: e.target.value })} />
          </label>
        </div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <UnitField label="Lawn size" value={form.lawnSqFt} onChange={(v) => set({ lawnSqFt: v })} unit="sq ft" min={0} />
          <UnitField
            label="Mow interval"
            value={form.mowingIntervalDays}
            onChange={(v) => set({ mowingIntervalDays: v })}
            unit="days"
            min={1}
          />
        </div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <label style={{ display: 'block' }}>
            <span className="input-label">Terrain</span>
            <select
              className="input-field"
              value={form.terrain || 'flat'}
              onChange={(e) => set({ terrain: e.target.value })}
            >
              <option value="flat">Flat</option>
              <option value="moderate">Moderate</option>
              <option value="hilly">Hilly</option>
            </select>
          </label>
          <UnitField
            label="Obstacles"
            value={form.obstacleCount}
            onChange={(v) => set({ obstacleCount: v ?? 0 })}
            unit="count"
            min={0}
          />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={!!form.fencedBackyard}
            onChange={(e) => set({ fencedBackyard: e.target.checked })}
          />
          <span>Fenced backyard</span>
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span className="input-label">Property notes</span>
          <textarea
            className="input-field"
            rows={2}
            value={form.propertyNotes || ''}
            onChange={(e) => set({ propertyNotes: e.target.value })}
            placeholder="Gate code, dog, access notes…"
          />
        </label>
        <label style={{ display: 'block' }}>
          <span className="input-label">Special applications</span>
          <textarea
            className="input-field"
            rows={2}
            value={form.specialApplications || ''}
            onChange={(e) => set({ specialApplications: e.target.value })}
            placeholder="Chemical constraints — shown in the EPA log + treatment stops"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save changes
          </button>
          <button type="button" className="btn btn-secondary" onClick={remove} style={{ color: 'var(--red)' }}>
            Delete
          </button>
          {savedAt && <span style={{ color: 'var(--green-dark)', fontSize: 'var(--fs-small)' }}>Saved ✓</span>}
        </div>
      </Card>
    </>
  )
}

function LocationTab({ customer }) {
  const all = useLiveQuery(() => allCustomers(), [], [])
  const [editing, setEditing] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState(null)

  // other customers' zones, for the overlap check (exclude this customer)
  const otherZones = all
    .filter((c) => c.id !== customer.id && c.arrivalZone)
    .map((c) => ({ customerId: c.id, name: c.name, polygon: c.arrivalZone }))

  async function geocode() {
    if (!customer.address) {
      setError('Add an address on the Details tab first.')
      return
    }
    setGeocoding(true)
    setError(null)
    try {
      const { lat, lng } = await geocodeAddress(customer.address)
      await updateCustomer(customer.id, { location: { lat, lng } })
    } catch (e) {
      setError(e.message)
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <>
      <Card>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Banner variant="error" icon="⚠️">
              {error}
            </Banner>
          </div>
        )}
        {customer.location ? (
          <DataRow
            label="📍 Location"
            value={`${customer.location.lat.toFixed(5)}, ${customer.location.lng.toFixed(5)}`}
          />
        ) : (
          <Banner variant="warn" icon="📍">
            No location yet — geocode the address, then place the arrival zone.
          </Banner>
        )}
        <DataRow label="Arrival zone" value={customer.arrivalZone ? `${customer.arrivalZone.length} points` : 'Not set'} />

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={geocode} disabled={geocoding}>
            {geocoding ? 'Geocoding…' : 'Geocode from address'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditing(true)}
            disabled={!customer.location && !customer.arrivalZone}
          >
            {customer.arrivalZone ? 'Edit arrival zone' : 'Place arrival zone'}
          </button>
        </div>
        {!customer.location && !customer.arrivalZone && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)', margin: '8px 0 0' }}>
            Geocode first so the map opens on the property.
          </p>
        )}
      </Card>

      {editing && (
        <ZoneEditor
          customer={customer}
          otherZones={otherZones}
          initialCenter={customer.location}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </>
  )
}
