// Live Route (SPEC §5, DESIGN §5) — the engine-state renderer, compact field
// layout: one status strip (weather + GPS chips), ONE hero card that merges the
// phase state with the next stop (while driving the hero IS the next-stop card
// with the Navigate hand-off), the map, then a tappable progress strip that
// expands into the full stop list. Map tiles are decoration (SPEC §2) so the
// screen still stands alone offline.
//
// A dev-only fix simulator (import.meta.env.DEV) drives synthetic GPS fixes on
// a controllable clock so the whole loop is exercisable without a Maps key or
// real geolocation. It disappears from production builds.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, Banner, EmptyState, PrimaryBar, SlideToConfirm, GpsHealthChip } from '../components/ui/index.js'
import { computeTimers } from '../engine/geofenceEngine.js'
import { formatClock, formatMinutes } from '../utils/format.js'
import { db } from '../db/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { activeRoute } from '../db/routesRepo.js'
import { visitsForDate } from '../db/visitsRepo.js'
import { today } from '../utils/dates.js'
import { indexById } from '../utils/dueSelectors.js'
import { fitMowDurationModel } from '../utils/pricingModel.js'
import { estimateRouteRemaining, averageVisitSecs } from '../utils/routeEta.js'
import { RouteMap } from './RouteMap.jsx'
import { useGeolocation } from '../session/useGeolocation.js'
import { haversineMeters, metersToMiles } from '../engine/geo.js'

/** "0.8 mi" straight-line distance from the current fix to a stop, or null. */
function milesAway(from, to) {
  if (!from || !to) return null
  const mi = metersToMiles(haversineMeters(from, to))
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi.toFixed(1)} mi`
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
  const [showStops, setShowStops] = useState(false)

  const timers = state ? computeTimers(state, clock) : { jobElapsedSecs: 0, driveSecs: 0 }
  const phase = state?.phase || 'idle'

  const stops = buildStops(route, customers, todaysVisits)
  const next = stops.find((s) => s.isNext)
  const doneCount = stops.filter((s) => s.done).length

  // remaining-time estimate: model-predicted job time per stop + drive legs
  const allVisits = useLiveQuery(() => db.visits.toArray(), [], [])
  const customersById = indexById(customers)
  const eta = estimateRouteRemaining({
    stops,
    customersById,
    model: fitMowDurationModel(allVisits, customersById),
    fallbackJobSecs: averageVisitSecs(allVisits),
    currentPos: session.lastFix,
    activeCustomerId: state?.activeCustomerId || null,
    activeElapsedSecs: timers.jobElapsedSecs,
  })

  // No active route (and nothing to resume) → nothing to track. The builder
  // lives on the Route tab now; this is just a placeholder + the dev simulator.
  if (!active && !resumePrompt) {
    return (
      <div style={{ position: 'relative' }}>
        <h1 className="page-title">Live route</h1>
        <EmptyState>
          No active route. Build one on the Route tab — tracking, the map, and turn-by-turn appear
          here once it starts.
        </EmptyState>
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
      {/* status strip: title + weather chip + GPS health, one glanceable line */}
      <div className="live-strip">
        <h1 className="page-title" style={{ margin: 0 }}>
          Live
        </h1>
        <span style={{ flex: 1 }} />
        {active && session.weather && (
          <span
            className={'live-chip' + (session.weather.windMph >= 10 ? ' live-chip--warn' : '')}
            title={session.weather.windMph >= 10 ? 'High wind — check drift before spraying' : 'Current conditions'}
          >
            {session.weather.windMph >= 10 ? '💨' : '🌤️'} {session.weather.tempF}° · {session.weather.windMph} mph
          </span>
        )}
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

      {resumePrompt && <ResumeCard session={session} nameOf={nameOf} />}

      {active && (
        <HeroCard
          phase={phase}
          state={state}
          timers={timers}
          nameOf={nameOf}
          next={next}
          remaining={stops.length - doneCount}
          currentPos={session.lastFix}
        />
      )}

      {active && stops.length > 0 && (
        <>
          <div style={{ marginTop: 10 }}>
            <RouteMap stops={stops} currentPos={session.lastFix} height={260} />
          </div>

          <RouteCard
            stops={stops}
            doneCount={doneCount}
            eta={eta}
            now={clock}
            expanded={showStops}
            onToggle={() => setShowStops((v) => !v)}
            currentPos={session.lastFix}
          />
        </>
      )}

      {active && !simMode && (
        <label className="live-gps-row">
          <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
          <span>Use phone GPS</span>
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

/**
 * The ONE dominant card (DESIGN §5). On site → big job timer + a muted "next
 * up" hint. Arriving → hold countdown. Driving → destination big, with the
 * straight-line distance from the live fix and the drive timer in the corner.
 */
function HeroCard({ phase, state, timers, nameOf, next, remaining, currentPos }) {
  if (phase === 'onsite') {
    return (
      <Card status="green">
        <div className="live-hero__row">
          <div className="stat-tile__label">On site · {nameOf(state.activeCustomerId)}</div>
          {state.paused && <span style={{ color: 'var(--amber)', fontWeight: 600, fontSize: 'var(--fs-small)' }}>⏸ Paused</span>}
        </div>
        <div className="tabular" style={{ fontSize: 'var(--fs-hero)', fontWeight: 700, lineHeight: 1.05, marginTop: 4 }}>
          {formatClock(timers.jobElapsedSecs)}
        </div>
        {next && (
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 0', fontSize: 'var(--fs-small)' }}>
            Next up: {next.name}
          </p>
        )}
      </Card>
    )
  }
  if (phase === 'arriving') {
    return (
      <Card status="amber">
        <div className="stat-tile__label">Arriving</div>
        <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700 }}>{nameOf(state.arrivingCustomerId)}</div>
        <p style={{ color: 'var(--text-muted)', margin: '6px 0 0', fontSize: 'var(--fs-small)' }}>
          Hold position — confirming arrival…
        </p>
      </Card>
    )
  }
  // driving
  const away = next ? milesAway(currentPos, next.location) : null
  return (
    <Card status="slate">
      <div className="live-hero__row">
        <div className="stat-tile__label">Driving{remaining > 0 ? ` · ${remaining} stop${remaining > 1 ? 's' : ''} left` : ''}</div>
        <span className="tabular" style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
          {formatClock(timers.driveSecs)}
        </span>
      </div>
      {next ? (
        <div style={{ marginTop: 6, minWidth: 0 }}>
          <div className="live-hero__row" style={{ alignItems: 'baseline' }}>
            <div style={{ fontSize: 'var(--fs-title)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {next.name}
            </div>
            {away && (
              <span className="tabular" style={{ color: 'var(--green-dark)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {away}
              </span>
            )}
          </div>
          {next.address && (
            <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: 'var(--fs-small)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {next.address}
            </p>
          )}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', margin: '6px 0 0', fontSize: 'var(--fs-small)' }}>
          En route to the next stop.
        </p>
      )}
    </Card>
  )
}

/**
 * Collapsible route card, styled like a compact bottom sheet: grabber handle +
 * a chip label are the expand affordance (no arrows). Collapsed is three tight
 * rows that keep every stat — "~1h 18m left · done ~9:16 PM", the progress
 * bar, and a micro meta line ("2/5 done · ~58m jobs · ~20m driving").
 * Expanded adds the full stop list with addresses and per-stop estimates.
 */
function RouteCard({ stops, doneCount, eta, now, expanded, onToggle, currentPos }) {
  const noLocation = stops.filter((s) => !s.location).length
  const meta = [`${doneCount}/${stops.length} done`]
  if (eta.jobSecs > 0) meta.push(`~${formatMinutes(eta.jobSecs)} jobs`)
  if (eta.driveSecs > 0) meta.push(`~${formatMinutes(eta.driveSecs)} driving`)
  const pct = stops.length ? Math.round((doneCount / stops.length) * 100) : 0
  const doneBy = new Date(now + eta.totalSecs * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <Card style={{ marginTop: 10 }}>
      <button type="button" className="route-card__head" onClick={onToggle} aria-expanded={expanded}>
        <div className="route-card__top">
          <span />
          <span className="route-card__grab" aria-hidden="true" />
          <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span className="live-chip">{expanded ? 'Hide' : `${stops.length} stops`}</span>
          </span>
        </div>

        {eta.remainingStops > 0 ? (
          <div className="route-card__line">
            <strong className="tabular">~{formatMinutes(eta.totalSecs)}</strong>
            <span style={{ color: 'var(--text-muted)' }}>left</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-muted)' }}>done</span>
            <strong className="tabular">~{doneBy}</strong>
          </div>
        ) : (
          <div className="route-card__line">
            <strong>All stops done 🎉</strong>
          </div>
        )}

        <span className="progress-track">
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </span>
        <p className="route-card__meta">{meta.join(' · ')}</p>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {stops.map((s, i) => {
            const away = !s.done && s.isNext ? milesAway(currentPos, s.location) : null
            const est = !s.done ? eta.perStopJobSecs[s.id] : null
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 0',
                  borderTop: '1px solid var(--border)',
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
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: s.isNext ? 700 : 400 }}>
                    {s.name}
                    {s.isNext && <span style={{ color: 'var(--green-dark)', fontSize: 'var(--fs-small)', fontWeight: 600 }}> · next{away ? ` · ${away}` : ''}</span>}
                  </span>
                  {s.address && (
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 'var(--fs-small)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.address}
                    </span>
                  )}
                </span>
                {!s.location ? (
                  <span style={{ color: 'var(--red)', fontSize: 'var(--fs-small)' }}>no location</span>
                ) : est != null ? (
                  <span className="tabular" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-small)', whiteSpace: 'nowrap' }}>
                    ~{formatMinutes(est)}
                  </span>
                ) : null}
              </div>
            )
          })}
          {noLocation > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-small)', color: 'var(--text-muted)' }}>
              {noLocation} stop{noLocation > 1 ? 's have' : ' has'} no saved location — geocode them on the
              client’s Location tab to show them on the map.
            </p>
          )}
        </div>
      )}
    </Card>
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
