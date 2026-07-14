// Route Builder (SPEC §7/§8): due-list driven. Select stops, see double-up
// badges (mow due + treatment window) and missing-zone warnings, then start the
// route — which creates the route record and hands its zones to the engine.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Pill, SectionTitle, EmptyState, Banner } from '../components/ui/index.js'
import { useDueList } from '../hooks/useDueList.js'
import { today } from '../utils/dates.js'
import { addRoute, makeStop, routeTemplates } from '../db/routesRepo.js'
import { optimizeRoute } from '../maps/directions.js'

export function RouteBuilder({ session, onStarted }) {
  const { loading, due, doubleUps, customersById } = useDueList(today())
  const templates = useLiveQuery(() => routeTemplates(), [], [])
  const [selected, setSelected] = useState([]) // ordered customerIds
  const [starting, setStarting] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizedMiles, setOptimizedMiles] = useState(null)
  const [optError, setOptError] = useState(null)
  const [msg, setMsg] = useState(null)

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading due list…</p>

  // Load a saved template's stops (in order), dropping any deleted customers.
  const loadTemplate = (tpl) => {
    setSelected(tpl.stops.map((s) => s.customerId).filter((id) => customersById[id]))
    setOptimizedMiles(null)
    setMsg(`Loaded "${tpl.name}"`)
  }

  async function saveTemplate() {
    if (!selected.length) return
    const name = prompt('Name this route template:', `Route ${today()}`)
    if (!name) return
    const stops = selected.map((id, i) => makeStop(id, i))
    await addRoute({ type: 'mixed', status: 'template', isTemplate: true, name, stops })
    setMsg(`Saved template "${name}"`)
  }

  const toggle = (customerId) =>
    setSelected((s) => (s.includes(customerId) ? s.filter((x) => x !== customerId) : [...s, customerId]))

  const move = (i, dir) =>
    setSelected((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  // one row per customer (a customer due in both engines shows once, badged)
  const seen = new Set()
  const rows = []
  for (const item of due) {
    if (seen.has(item.customerId)) continue
    seen.add(item.customerId)
    rows.push(item)
  }

  const selectedWithoutZone = selected.filter((id) => !customersById[id]?.arrivalZone)
  const selectedWithoutLocation = selected.filter((id) => !customersById[id]?.location)

  async function optimize() {
    setOptimizing(true)
    setOptError(null)
    try {
      const points = selected.map((id) => customersById[id].location)
      const { orderIndices, miles } = await optimizeRoute(points)
      setSelected(orderIndices.map((i) => selected[i]))
      setOptimizedMiles(miles)
    } catch (e) {
      setOptError(e.message || 'Could not optimize route')
    } finally {
      setOptimizing(false)
    }
  }

  async function start() {
    setStarting(true)
    const stops = selected.map((customerId, i) => {
      const treatmentIds = due
        .filter((d) => d.customerId === customerId && d.engine === 'treatment')
        .map((d) => d.meta?.treatmentId)
        .filter(Boolean)
      return makeStop(customerId, i, { treatmentIds })
    })
    const zones = selected
      .map((id) => customersById[id])
      .filter((c) => c?.arrivalZone)
      .map((c) => ({ customerId: c.id, polygon: c.arrivalZone }))

    const route = await addRoute({
      type: 'mixed',
      status: 'active',
      name: `Route ${today()}`,
      stops,
      plannedDistanceMiles: optimizedMiles,
    })
    session.startRoute(zones, route.id)
    onStarted?.()
  }

  return (
    <>
      <h1 className="page-title">Build route</h1>

      {msg && (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="info" icon="✓">
            {msg}
          </Banner>
        </div>
      )}

      {templates.length > 0 && (
        <>
          <SectionTitle icon="📁" count={templates.length}>
            Templates
          </SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {templates.map((tpl) => (
              <button key={tpl.id} type="button" className="btn btn-secondary" onClick={() => loadTemplate(tpl)}>
                📁 {tpl.name} ({tpl.stops.length})
              </button>
            ))}
          </div>
        </>
      )}

      {rows.length === 0 ? (
        <EmptyState>Nothing due right now. Mowing intervals and treatment windows will populate this.</EmptyState>
      ) : (
        <>
          <SectionTitle icon="📋" count={rows.length}>
            Due today
          </SectionTitle>
          {rows.map((item) => {
            const c = customersById[item.customerId]
            const isSel = selected.includes(item.customerId)
            const dbl = doubleUps.has(item.customerId)
            return (
              <Card
                key={item.customerId}
                status={item.engine === 'mowing' ? 'green' : 'amber'}
                onClick={() => toggle(item.customerId)}
                style={{ cursor: 'pointer', marginBottom: 8, opacity: isSel ? 1 : 0.9 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{c?.name || 'Customer'}</strong>{' '}
                    {dbl && <span title="Mow + treatment in one stop">🔁</span>}
                    {!c?.arrivalZone && (
                      <span style={{ color: 'var(--red)', fontSize: 'var(--fs-small)' }}> · no zone</span>
                    )}
                    <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                      {item.engine === 'mowing' ? '🌿 ' : '🌱 '}
                      {item.reason}
                    </p>
                  </div>
                  <Pill selected={isSel}>{isSel ? '✓ Added' : 'Add'}</Pill>
                </div>
              </Card>
            )
          })}
        </>
      )}

      {selected.length > 0 && (
        <>
          <SectionTitle icon="🚚" count={selected.length}>
            Route stops
          </SectionTitle>
          {selectedWithoutZone.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <Banner variant="warn" icon="📍">
                {selectedWithoutZone.length} selected stop(s) have no arrival zone — they'll be on the
                route but the GPS timer can't auto-track them.
              </Banner>
            </div>
          )}
          <Card>
            {selected.map((id, i) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: i < selected.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span className="tabular" style={{ color: 'var(--text-muted)', width: 20 }}>{i + 1}.</span>
                <span style={{ flex: 1 }}>{customersById[id]?.name || 'Customer'}</span>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44, padding: 0 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ▲
                </button>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44, padding: 0 }} disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ▼
                </button>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44, padding: 0, color: 'var(--red)' }} onClick={() => toggle(id)} aria-label="Remove">
                  ✕
                </button>
              </div>
            ))}
          </Card>
          {optError && (
            <div style={{ marginTop: 8 }}>
              <Banner variant="error" icon="⚠️">
                {optError}
              </Banner>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={start} disabled={starting}>
              {starting ? 'Starting…' : `Start route (${selected.length} stops)`}
            </button>
            {selected.length >= 2 && selectedWithoutLocation.length === 0 && (
              <button type="button" className="btn btn-secondary" onClick={optimize} disabled={optimizing}>
                {optimizing ? 'Optimizing…' : '🧭 Optimize order'}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={saveTemplate}>
              Save as template
            </button>
            {optimizedMiles != null && (
              <span className="tabular" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                ~{optimizedMiles.toFixed(1)} mi driving
              </span>
            )}
          </div>
        </>
      )}
    </>
  )
}
