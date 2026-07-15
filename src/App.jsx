import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, StatTile, TabBar } from './components/ui/index.js'
import { formatCents } from './utils/money.js'
import { formatMinutes } from './utils/format.js'
import { today } from './utils/dates.js'
import { Customers } from './pages/Customers.jsx'
import { LiveRoute } from './pages/LiveRoute.jsx'
import { RouteBuilder } from './pages/RouteBuilder.jsx'
import { DayReview } from './pages/DayReview.jsx'
import { Treatments } from './pages/Treatments.jsx'
import { More } from './pages/More.jsx'
import { History } from './pages/History.jsx'
import { Analytics } from './pages/Analytics.jsx'
import { HealthCheck } from './pages/HealthCheck.jsx'
import { Settings } from './pages/Settings.jsx'
import { useRouteSession } from './session/useRouteSession.js'
import { useDueList } from './hooks/useDueList.js'
import { seedServicesIfEmpty } from './db/servicesRepo.js'
import { seedDefaultProgramIfEmpty } from './db/programsRepo.js'
import { visitsForDate } from './db/visitsRepo.js'
import { totalRevenueCents } from './utils/revenue.js'
import { dayJobSeconds, dayDriveSeconds } from './utils/dayReview.js'

// App shell — bottom tab navigation (DESIGN §4). Home is the dashboard; a
// full-screen overlay hosts task screens like Day Review.

function greeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Home({ routeActive, onOpenDayReview, onGoToRoute, onGoToLive }) {
  const bd = today()
  const visits = useLiveQuery(() => visitsForDate(bd), [bd], null)
  const { mowingDue, treatmentDue } = useDueList(bd)

  const completed = (visits || []).filter((v) => v.status === 'completed')
  const revenue = totalRevenueCents(visits || [])
  const fieldSecs = dayJobSeconds(visits || []) + dayDriveSeconds(visits || [])
  const unreviewed = (visits || []).filter((v) => v.status !== 'skipped' && (v.lineItems || []).length === 0).length

  const dueCount = mowingDue.length + treatmentDue.length
  const dueParts = []
  if (mowingDue.length) dueParts.push(`${mowingDue.length} mowing`)
  if (treatmentDue.length) dueParts.push(`${treatmentDue.length} treatment${treatmentDue.length > 1 ? 's' : ''}`)

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // adaptive hero: resume a running route, build the due work, or "caught up"
  let hero
  if (routeActive) {
    hero = { icon: '🚚', title: 'Route in progress', sub: 'Back to live tracking + the map', cta: 'Resume route', onClick: onGoToLive }
  } else if (dueCount > 0) {
    hero = { icon: '🌿', title: `${dueCount} stop${dueCount > 1 ? 's' : ''} ready`, sub: `${dueParts.join(' · ')} due today`, cta: 'Build today’s route', onClick: onGoToRoute }
  } else {
    hero = { icon: '✅', title: 'All caught up', sub: 'Nothing mowing-due or in a treatment window today', cta: null }
  }

  return (
    <>
      <h1 className="dash-greeting">{greeting(now.getHours())}, Dylan</h1>
      <p className="dash-date">{dateStr}</p>

      <Card className={'dash-hero' + (hero.cta ? '' : ' dash-hero--idle')}>
        <div className="dash-hero__top">
          <span className="dash-hero__icon" aria-hidden="true">{hero.icon}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className="dash-hero__title">{hero.title}</h2>
            <p className="dash-hero__sub">{hero.sub}</p>
          </div>
        </div>
        {hero.cta && (
          <button type="button" className="dash-cta" onClick={hero.onClick}>
            {hero.cta} <span aria-hidden="true">→</span>
          </button>
        )}
      </Card>

      <div className="stat-grid" style={{ margin: '12px 0 0' }}>
        <StatTile label="Today's revenue" value={formatCents(revenue)} sub={`${completed.length} job${completed.length === 1 ? '' : 's'}`} />
        <StatTile label="Field time" value={formatMinutes(fieldSecs)} sub="job + drive" />
        <StatTile label="To review" value={String(unreviewed)} sub="need line items" />
      </div>

      {visits && visits.length > 0 && (
        <Card
          status={unreviewed > 0 ? 'amber' : 'green'}
          onClick={onOpenDayReview}
          style={{ cursor: 'pointer', marginTop: 12 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Day Review</strong>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 'var(--fs-small)' }}>
                {unreviewed > 0
                  ? `${unreviewed} visit${unreviewed > 1 ? 's' : ''} need line items`
                  : `${completed.length} visit${completed.length === 1 ? '' : 's'} reviewed · ${formatCents(revenue)}`}
              </p>
            </div>
            <span aria-hidden="true">→</span>
          </div>
        </Card>
      )}
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('home')
  const [overlay, setOverlay] = useState(null) // e.g. 'dayReview'
  const session = useRouteSession()

  useEffect(() => {
    seedServicesIfEmpty()
    seedDefaultProgramIfEmpty()
  }, [])

  const goTab = (t) => {
    setOverlay(null)
    setTab(t)
  }

  // The Live tab only exists while a route is running (or awaiting resume) — in
  // dev it stays reachable so the fix simulator can start a demo. If it's the
  // current tab when it disappears, fall back to the builder.
  const showLive = session.active || !!session.resumePrompt || import.meta.env.DEV
  useEffect(() => {
    if (tab === 'live' && !showLive) setTab('route')
  }, [tab, showLive])

  const closeOverlay = () => setOverlay(null)

  const OVERLAYS = {
    dayReview: <DayReview businessDate={today()} onClose={closeOverlay} />,
    history: <History onClose={closeOverlay} />,
    analytics: <Analytics onClose={closeOverlay} />,
    healthCheck: <HealthCheck onClose={closeOverlay} />,
    settings: <Settings onClose={closeOverlay} />,
  }

  return (
    <div className="app-shell">
      {overlay ? (
        OVERLAYS[overlay]
      ) : (
        <>
          {tab === 'home' && (
            <Home
              routeActive={session.active}
              onOpenDayReview={() => setOverlay('dayReview')}
              onGoToRoute={() => goTab('route')}
              onGoToLive={() => goTab('live')}
            />
          )}
          {tab === 'route' && <RouteBuilder session={session} onStarted={() => goTab('live')} />}
          {tab === 'live' && <LiveRoute session={session} />}
          {tab === 'clients' && <Customers />}
          {tab === 'treatments' && <Treatments />}
          {tab === 'more' && <More onOpen={setOverlay} />}
        </>
      )}
      <TabBar active={tab} onChange={goTab} routeActive={session.active} showLive={showLive} />
    </div>
  )
}
