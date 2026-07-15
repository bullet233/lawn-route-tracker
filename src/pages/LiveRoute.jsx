// Live Route (SPEC §5, DESIGN §5) — the engine-state renderer. One dominant
// state card tints with the phase; GPS health chip floats top-right; a
// PrimaryBar carries the contextual action. Map tiles are decoration (SPEC §2)
// so this list-first screen already stands alone offline.
//
// A dev-only fix simulator (import.meta.env.DEV) drives synthetic GPS fixes on
// a controllable clock so the whole loop is exercisable without a Maps key or
// real geolocation. It disappears from production builds.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Banner, PrimaryBar, SlideToConfirm, GpsHealthChip } from '../components/ui/index.js'
import { computeTimers } from '../engine/geofenceEngine.js'
import { formatClock } from '../utils/format.js'
import { allCustomers } from '../db/customersRepo.js'
import { activeRoute } from '../db/routesRepo.js'
import { visitsForDate } from '../db/visitsRepo.js'
import { today } from '../utils/dates.js'
import { RouteBuilder } from './RouteBuilder.jsx'
import { RouteMap } from './RouteMap.jsx'
import { useGeolocation } from '../session/useGeolocation.js'

/** Native turn-by-turn hand-off — opens the phone's maps app to a destination. */
function directionsUrl(location) {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=driving`
}

/** Ordered route stops joined to customers + today's visited set (SPEC §5). */
function buildStops(route, customers, todaysVisits) {
  if (!route) return []
  const byId = {}
  for (const c of customers) byId[c.id] = c
  const visited = new Set((todaysVisits || []).map((v) => v.customerId))
  const ordered = [...(route.stops || [])].sort((a, b) => a.order - b.order)
  let nextAssigned = false
  return ordered.map((stop) => {
    const c = byId[stop.customerId]
    const done = visited.has(stop.customerId)
    const isNext = !done && !nextAssigned
    if (isNext) nextAssigned = true
    return {
      id: stop.customerId,
      name: c?.name || 'Customer',
      address: c?.address || '',
      location: c?.location || null,
      done,
      isNext,
    }
  })
}

const DEMO_CENTER = { lat: 40, lng: -75 }
const DEMO_INSIDE = { ...DEMO_CENTER }
const DEMO_OUTSIDE = { lat: 40.05, lng: -75.05 }
const demoZone = (customerId) => ({
  customerId,
  polygon: [
    { lat: 39.9995, lng: -75.0005 },
    { lat: 39.9995, lng: -74.9995 },
    { lat: 40.0005, lng: -74.9995 },
    { lat: 40.0005, lng: -75.0005 },
  ],
})

export function LiveRoute({ session }) {
  const customers = useLiveQuery(() => allCustomers(), [], [])
  const route = useLiveQuery(() => activeRoute(), [], null)
  const todaysVisits = useLiveQuery(() => visitsForDate(today()), [], [])
  const nameOf = (id) => customers.find((c) => c.id === id)?.name || 'Customer'
  const { state, active, gpsLevel, resumePrompt } = session

  // display clock: sim clock when simulating, else wall clock ticking each second
  const [clock, setClock] = useState(() => Date.now())
  const [simMode, setSimMode] = useState(false)
  const [useGps, setUseGps] = useState(false)
  useEffect(() => {
    if (!active || simMode) return
    const id = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active, simMode])

  const { error: gpsError } = useGeolocation(session, useGps && !simMode)

  const timers = state ? computeTimers(state, clock) : { jobElapsedSecs: 0, driveSecs: 0 }
  const phase = state?.phase || 'idle'

  // Idle (no active route, no resume prompt) → the Route Builder lives here.
  if (!active && !resumePrompt) {
    return (
      <div style={{ position: 'relative' }}>
        <RouteBuilder session={session} onStarted={() => {}} />
        {import.meta.env.DEV && (
          <Simulator
            session={session}
            customers={customers}
            clock={clock}
            setClock={setClock}
            setSimMode={setSimMode}
            active={active}
            phase={phase}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          Route
        </h1>
        {active && <GpsHealthChip level={gpsLevel} />}
      </div>

      {gpsLevel === 'red' && active && session.fixAgeSecs != null && (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="error" icon="📡">
            GPS lost — timing may be wrong.
          </Banner>
        </div>
      )}

      {gpsError && useGps && (
        <div style={{ marginBottom: 12 }}>
          <Banner variant="error" icon="📡">
            {gpsError}
          </Banner>
        </div>
      )}

      {active && session.weather && (
        <div style={{ marginBottom: 12 }}>
          {session.weather.windMph >= 10 ? (
            <Banner variant="warn" icon="💨">
              {session.weather.windMph} mph wind — check drift before spraying.
            </Banner>
          ) : (
            <Banner variant="info" icon="🌤️">
              {session.weather.tempF}°F · {session.weather.windMph} mph wind
            </Banner>
          )}
        </div>
      )}

      {resumePrompt && <ResumeCard session={session} nameOf={nameOf} />}

      {active && <StateCard phase={phase} state={state} timers={timers} nameOf={nameOf} />}

      {active && <RouteNav route={route} customers={customers} todaysVisits={todaysVisits} currentPos={session.lastFix} />}

      {active && !simMode && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
          <span>Use my phone's GPS (live tracking)</span>
        </label>
      )}

      {active && phase !== 'idle' && (
        <PrimaryBar>
          {phase === 'onsite' ? (
            <SlideToConfirm
              label="Slide to finish"
              onConfirm={() => session.finishJob(simMode ? clock : Date.now())}
            />
          ) : (
            <SlideToConfirm
              label="Slide to end route"
              color="var(--red)"
              onConfirm={() => session.endRoute(simMode ? clock : Date.now())}
            />
          )}
        </PrimaryBar>
      )}

      {import.meta.env.DEV && (
        <Simulator
          session={session}
          customers={customers}
          clock={clock}
          setClock={setClock}
          setSimMode={setSimMode}
          active={active}
          phase={phase}
        />
      )}
    </div>
  )
}

function StateCard({ phase, state, timers, nameOf }) {
  if (phase === 'onsite') {
    return (
      <Card status="green">
        <div className="stat-tile__label">On site</div>
        <div style={{ fontSize: 'var(--fs-card)', fontWeight: 700, marginBottom: 8 }}>
          {nameOf(state.activeCustomerId)}
        </div>
        <div className="tabular" style={{ fontSize: 'var(--fs-hero)', fontWeight: 700, lineHeight: 1 }}>
          {formatClock(timers.jobElapsedSecs)}
        </div>
        {state.paused && <p style={{ color: 'var(--amber)', margin: '8px 0 0' }}>Paused</p>}
      </Card>
    )
  }
  if (phase === 'arriving') {
    return (
      <Card status="amber">
        <div className="stat-tile__label">Arriving</div>
        <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700 }}>
          {nameOf(state.arrivingCustomerId)}
        </div>
        <p style={{ color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Confirming arrival… hold position to start the job.
        </p>
      </Card>
    )
  }
  // driving
  return (
    <Card status="slate">
      <div className="stat-tile__label">Driving</div>
      <div className="tabular" style={{ fontSize: 'var(--fs-hero)', fontWeight: 700, lineHeight: 1 }}>
        {formatClock(timers.driveSecs)}
      </div>
      <p style={{ color: 'var(--text-muted)', margin: '8px 0 0' }}>En route to the next stop.</p>
    </Card>
  )
}

function RouteNav({ route, customers, todaysVisits, currentPos }) {
  const stops = buildStops(route, customers, todaysVisits)
  if (stops.length === 0) return null

  const next = stops.find((s) => s.isNext)
  const remaining = stops.filter((s) => !s.done).length
  const noLocation = stops.filter((s) => !s.location).length

  return (
    <div style={{ marginTop: 12 }}>
      {next && (
        <Card status="slate" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div className="stat-tile__label">Next stop · {remaining} left</div>
              <strong style={{ fontSize: 'var(--fs-card)' }}>{next.name}</strong>
              {next.address && (
                <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)' }}>
                  {next.address}
                </p>
              )}
            </div>
            {next.location ? (
              <a
                className="btn btn-primary"
                href={directionsUrl(next.location)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                🧭 Navigate
              </a>
            ) : (
              <span style={{ color: 'var(--red)', fontSize: 'var(--fs-small)' }}>No location</span>
            )}
          </div>
        </Card>
      )}

      <RouteMap stops={stops} currentPos={currentPos} height={260} />

      <Card style={{ marginTop: 10 }}>
        {stops.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              opacity: s.done ? 0.55 : 1,
            }}
          >
            <span
              className="tabular"
              style={{ width: 22, color: s.done ? 'var(--text-muted)' : s.isNext ? 'var(--green-dark)' : 'var(--text)', fontWeight: 700 }}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {s.name}
              {s.isNext && <span style={{ color: 'var(--green-dark)', fontSize: 'var(--fs-small)' }}> · next</span>}
            </span>
            {s.location ? (
              <a
                className="btn btn-secondary"
                href={directionsUrl(s.location)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ minHeight: 40, textDecoration: 'none', padding: '0 12px' }}
              >
                🧭
              </a>
            ) : (
              <span style={{ color: 'var(--red)', fontSize: 'var(--fs-small)' }}>no loc</span>
            )}
          </div>
        ))}
        {noLocation > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
            {noLocation} stop{noLocation > 1 ? 's have' : ' has'} no saved location — geocode them on the
            client’s Location tab to map + navigate.
          </p>
        )}
      </Card>
    </div>
  )
}

function ResumeCard({ session, nameOf }) {
  const { resumePrompt } = session
  const mins = resumePrompt.sinceMs != null ? Math.round(resumePrompt.sinceMs / 60000) : null
  return (
    <Card status="amber">
      <strong style={{ fontSize: 'var(--fs-card)' }}>Resume where you left off?</strong>
      <p style={{ color: 'var(--text-muted)', margin: '6px 0 12px' }}>
        {resumePrompt.kind === 'onsite'
          ? `You were at ${nameOf(resumePrompt.customerId)}${mins != null ? ` — ${mins} min ago` : ''}.`
          : `A route was active${mins != null ? ` — ${mins} min ago` : ''}.`}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => session.confirmResume([])}>
          Resume
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => session.discardResume()}>
          Discard
        </button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dev-only simulator — stripped from production builds by import.meta.env.DEV.
function Simulator({ session, customers, clock, setClock, setSimMode, active, phase }) {
  const [step, setStep] = useState(10)
  const customerId = customers[0]?.id

  const inject = (point, deltaSecs) => {
    setSimMode(true)
    const t = clock + deltaSecs * 1000
    setClock(t)
    session.pushFix({ ...point, accuracy: 5, t })
  }

  return (
    <Card style={{ marginTop: 24, borderStyle: 'dashed' }}>
      <div className="stat-tile__label">🧪 Dev simulator</div>
      {!customerId ? (
        <p style={{ color: 'var(--text-muted)' }}>Add a customer first (Clients tab).</p>
      ) : !active ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          onClick={() => {
            const t = Date.now()
            setSimMode(true)
            setClock(t)
            session.startRoute([demoZone(customerId)], null, t)
          }}
        >
          Start demo route (zone → {customers[0]?.name})
        </button>
      ) : (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 'var(--fs-small)', color: 'var(--text-muted)', margin: '0 0 8px' }}>
            phase: <strong>{phase}</strong> · sim clock +{Math.round((clock - (clock % 1000)) / 1000) % 100000}s.
            Inject INSIDE twice ≥8s apart to start a job; OUTSIDE twice ≥15s apart to finish it.
          </p>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            step
            <input
              type="number"
              value={step}
              min={0}
              onChange={(e) => setStep(Number(e.target.value))}
              style={{ width: 64 }}
              className="input-field"
            />
            s
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => inject(DEMO_INSIDE, step)}>
              Inject INSIDE (+{step}s)
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => inject(DEMO_OUTSIDE, step)}>
              Inject OUTSIDE (+{step}s)
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
