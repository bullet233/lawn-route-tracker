import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, StatTile, TabBar } from './components/ui/index.js'
import { formatCents } from './utils/money.js'
import { formatMinutes } from './utils/format.js'
import { today } from './utils/dates.js'
import { Customers } from './pages/Customers.jsx'
import { LiveRoute } from './pages/LiveRoute.jsx'
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

function Home({ onOpenDayReview, onGoToRoute }) {
  const bd = today()
  const visits = useLiveQuery(() => visitsForDate(bd), [bd], null)
  const { mowingDue, treatmentDue } = useDueList(bd)

  const completed = (visits || []).filter((v) => v.status === 'completed')
  const revenue = totalRevenueCents(visits || [])
  const fieldSecs = dayJobSeconds(visits || []) + dayDriveSeconds(visits || [])
  const unreviewed = (visits || []).filter((v) => (v.lineItems || []).length === 0).length

  return (
    <>
      <h1 className="page-title">Good morning, Dylan</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: -8 }}>{bd}</p>

      <div className="stat-grid" style={{ margin: '12px 0 16px' }}>
        <StatTile label="Today's Revenue" value={formatCents(revenue)} sub={`${completed.length} jobs`} />
        <StatTile label="Field Time" value={formatMinutes(fieldSecs)} sub="job + drive" />
        <StatTile label="To review" value={String(unreviewed)} sub="visits need line items" />
      </div>

      {visits && visits.length > 0 && (
        <Card status={unreviewed > 0 ? 'amber' : 'green'} onClick={onOpenDayReview} style={{ cursor: 'pointer', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Day Review</strong>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 'var(--fs-small)' }}>
                {unreviewed > 0 ? `${unreviewed} visit(s) need line items` : 'All visits reviewed'}
              </p>
            </div>
            <span aria-hidden="true">→</span>
          </div>
        </Card>
      )}

      <Card status="green" onClick={onGoToRoute} style={{ cursor: 'pointer', marginBottom: 12 }}>
        <strong>Mowing due ({mowingDue.length})</strong>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 'var(--fs-small)' }}>
          {mowingDue.length ? 'Tap to build a route.' : 'Nothing mowing-due right now.'}
        </p>
      </Card>

      <Card status="amber" onClick={onGoToRoute} style={{ cursor: 'pointer' }}>
        <strong>Treatments in window ({treatmentDue.length})</strong>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 'var(--fs-small)' }}>
          {treatmentDue.length ? 'Tap to build a round.' : 'No treatment windows open.'}
        </p>
      </Card>
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
          {tab === 'home' && <Home onOpenDayReview={() => setOverlay('dayReview')} onGoToRoute={() => goTab('route')} />}
          {tab === 'route' && <LiveRoute session={session} />}
          {tab === 'clients' && <Customers />}
          {tab === 'treatments' && <Treatments />}
          {tab === 'more' && <More onOpen={setOverlay} />}
        </>
      )}
      <TabBar active={tab} onChange={goTab} routeActive={session.active} />
    </div>
  )
}
