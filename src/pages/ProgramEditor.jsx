// Program editor (SPEC §6). Edit a program's steps: name, category, window
// (MM-DD), and which service each step bills as. New enrollments use the edited
// program immediately.
//
// NOTE (gap): SPEC §6 also wants edits to propagate to this year's OPEN
// treatments (scheduled/due) while freezing completed ones. Not yet wired — an
// edit here affects future enrollments only. Flagged for a follow-up.

import { useState } from 'react'
import { Modal } from '../components/ui/index.js'
import { updateProgram } from '../db/programsRepo.js'
import { propagateProgramToOpenTreatments } from '../db/treatmentsRepo.js'
import { today, yearOf } from '../utils/dates.js'

const CATEGORIES = ['Pre-Emergent', 'Weed Control', 'Fertilizer', 'Fungicide', 'Insecticide', 'Other']

export function ProgramEditor({ program, fertServices, onClose, onSaved }) {
  const [name, setName] = useState(program.name)
  const [steps, setSteps] = useState(program.steps.map((s) => ({ ...s })))

  const setStep = (i, patch) => setSteps((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const addStep = () =>
    setSteps((ss) => [...ss, { name: 'New step', category: 'Fertilizer', windowStartMMDD: '06-01', windowEndMMDD: '07-31', billingServiceId: null }])
  const removeStep = (i) => setSteps((ss) => ss.filter((_, j) => j !== i))

  async function save() {
    const saved = await updateProgram(program.id, { name, steps })
    // propagate to this year's open treatments; completed ones stay frozen (§6)
    const year = yearOf(today())
    const n = await propagateProgramToOpenTreatments(saved, year)
    if (n > 0) alert(`Updated ${n} open treatment(s) for ${year}. Completed ones were left unchanged.`)
    onSaved?.()
    onClose()
  }

  return (
    <Modal
      title="Edit program"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Save program
          </button>
        </>
      }
    >
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="input-label">Program name</span>
        <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      {steps.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input-field" style={{ flex: 1 }} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
            <button type="button" className="btn btn-secondary" style={{ color: 'var(--red)' }} onClick={() => removeStep(i)}>
              ✕
            </button>
          </div>
          <div className="grid-2" style={{ marginBottom: 8 }}>
            <label>
              <span className="input-label">Category</span>
              <select className="input-field" value={s.category} onChange={(e) => setStep(i, { category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="input-label">Bills as</span>
              <select
                className="input-field"
                value={s.billingServiceId || ''}
                onChange={(e) => setStep(i, { billingServiceId: e.target.value || null })}
              >
                <option value="">Ask / auto</option>
                {fertServices.map((fs) => (
                  <option key={fs.id} value={fs.id}>
                    {fs.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label>
              <span className="input-label">Window start (MM-DD)</span>
              <input className="input-field" value={s.windowStartMMDD} onChange={(e) => setStep(i, { windowStartMMDD: e.target.value })} placeholder="03-01" />
            </label>
            <label>
              <span className="input-label">Window end (MM-DD)</span>
              <input className="input-field" value={s.windowEndMMDD} onChange={(e) => setStep(i, { windowEndMMDD: e.target.value })} placeholder="04-15" />
            </label>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-secondary" onClick={addStep}>
        + Add step
      </button>
    </Modal>
  )
}
