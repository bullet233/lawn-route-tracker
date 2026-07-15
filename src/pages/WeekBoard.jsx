// Week board (weekly routing) — assign each client to their mowing day by
// dragging their chip onto a weekday card. Writes serviceDay on drop. Pointer
// Events so it works with mouse and touch; a floating ghost follows the finger
// and drop targets are hit-tested via elementFromPoint on [data-dropzone].

import { useRef, useState } from 'react'
import { updateCustomer } from '../db/customersRepo.js'
import { WEEKDAYS, isWeekday } from '../utils/serviceDays.js'

export function WeekBoard({ customersById, todayWeekday }) {
  const customers = Object.values(customersById)
  const [drag, setDrag] = useState(null) // { id, name, x, y } while dragging
  const [overZone, setOverZone] = useState(null) // 'unassigned' | '0'..'6'
  const stateRef = useRef({ id: null, zone: null })

  const unassigned = customers.filter((c) => !isWeekday(c.serviceDay))
  const days = WEEKDAYS.map((d) => ({
    ...d,
    list: customers.filter((c) => c.serviceDay === d.value),
  }))

  function zoneAt(x, y) {
    const el = document.elementFromPoint(x, y)
    const zone = el && el.closest('[data-dropzone]')
    return zone ? zone.getAttribute('data-dropzone') : null
  }

  function onMove(e) {
    const zone = zoneAt(e.clientX, e.clientY)
    stateRef.current.zone = zone
    setOverZone(zone)
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d))
  }

  async function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    const { id, zone } = stateRef.current
    setDrag(null)
    setOverZone(null)
    if (id != null && zone != null) {
      const serviceDay = zone === 'unassigned' ? null : Number(zone)
      const current = customersById[id]?.serviceDay ?? null
      if (serviceDay !== current) await updateCustomer(id, { serviceDay })
    }
  }

  function startDrag(e, c) {
    if (e.button != null && e.button !== 0) return // left/primary only
    e.preventDefault()
    stateRef.current = { id: c.id, zone: null }
    setDrag({ id: c.id, name: c.name, x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const chip = (c) => (
    <span
      key={c.id}
      className={'day-chip' + (drag?.id === c.id ? ' day-chip--dragging' : '')}
      onPointerDown={(e) => startDrag(e, c)}
    >
      {c.name}
    </span>
  )

  return (
    <>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)', margin: '0 0 12px' }}>
        Drag each client onto their mowing day. Drag back to “Unassigned” to clear it.
      </p>

      <div
        className={'day-pool' + (overZone === 'unassigned' ? ' day-card--over' : '')}
        data-dropzone="unassigned"
      >
        <div className="day-card__head">
          <strong>Unassigned</strong>
          <span className="day-card__count">{unassigned.length}</span>
        </div>
        <div className="day-chips">
          {unassigned.length === 0 ? (
            <span className="day-card__empty">Everyone has a day 🎉</span>
          ) : (
            unassigned.map(chip)
          )}
        </div>
      </div>

      <div className="week-grid">
        {days.map((d) => (
          <div
            key={d.value}
            className={
              'day-card' +
              (d.value === todayWeekday ? ' day-card--today' : '') +
              (overZone === String(d.value) ? ' day-card--over' : '')
            }
            data-dropzone={d.value}
          >
            <div className="day-card__head">
              <strong>{d.label}</strong>
              <span className="day-card__count">{d.list.length}</span>
            </div>
            <div className="day-chips">
              {d.list.length === 0 ? (
                <span className="day-card__empty">Drop clients here</span>
              ) : (
                d.list.map(chip)
              )}
            </div>
          </div>
        ))}
      </div>

      {drag && (
        <span className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.name}
        </span>
      )}
    </>
  )
}
