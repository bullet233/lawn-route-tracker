// useRouteSession — the one place the app instantiates and drives the
// GeofenceEngine (SPEC §4.1: engine is the single owner; the UI subscribes).
//
// Responsibilities:
//  - create ONE engine, wire onCheckpoint→Dexie and onVisit→draft visit
//  - re-render on engine emit + tick every second for live timers
//  - track wall-clock fix age for the GPS health chip
//  - on mount, detect a checkpoint and surface a resume prompt (crash recovery)
//
// Fix source is injected via pushFix(fix): real geolocation later, the dev
// simulator now. The engine stays platform-agnostic.

import { useCallback, useEffect, useRef, useState } from 'react'
import { GeofenceEngine, computeTimers } from '../engine/geofenceEngine.js'
import { saveCheckpoint, loadCheckpoint, clearCheckpoint, persistJobAsVisit, saveGpsTrace } from '../db/engineRepo.js'
import { gpsHealthLevel } from '../utils/gpsHealth.js'
import { polygonCentroid } from '../engine/geo.js'
import { getCurrentWeather } from '../maps/weather.js'

export function useRouteSession() {
  const engineRef = useRef(null)
  const routeIdRef = useRef(null)
  const lastFixWallRef = useRef(null)
  const lastAccuracyRef = useRef(null)
  const lastFixRef = useRef(null)
  const weatherRef = useRef(null)
  const traceRef = useRef([])

  const [state, setState] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [resumePrompt, setResumePrompt] = useState(null)
  const [weather, setWeather] = useState(null)

  // create the engine once
  if (engineRef.current === null) {
    engineRef.current = new GeofenceEngine({
      onCheckpoint: (cp) => saveCheckpoint(cp),
      onVisit: (job) => persistJobAsVisit(job, routeIdRef.current, Date.now(), weatherRef.current),
    })
  }

  useEffect(() => {
    const engine = engineRef.current
    setState(engine.getState())
    const unsub = engine.subscribe(setState)
    // crash recovery: surface a prompt if a route was active (SPEC §4.2)
    loadCheckpoint().then((cp) => {
      const resume = GeofenceEngine.describeResume(cp, Date.now())
      if (resume) setResumePrompt({ ...resume, checkpoint: cp })
    })
    return unsub
  }, [])

  // 1s tick only while a route is active (idle screens don't need it)
  const active = state && state.phase !== 'idle'

  // Screen wake lock while a route is active, re-acquired on visibility change
  // (SPEC §2 — the phone is mounted + plugged; the geofence engine needs the
  // page alive). Silently no-ops where the API is unavailable.
  useEffect(() => {
    if (!active) return
    let lock = null
    const request = async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unsupported — the GPS-health chip is the backstop */
      }
    }
    request()
    const onVis = () => {
      if (document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (lock) lock.release().catch(() => {})
    }
  }, [active])
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  // `at` defaults to wall clock; the dev simulator passes its own clock so the
  // engine's timestamps and the displayed timer stay in sync.
  const startRoute = useCallback((zones, routeId = null, at = Date.now()) => {
    routeIdRef.current = routeId
    traceRef.current = []
    setResumePrompt(null)
    engineRef.current.startRoute(zones, at)
    // capture the day's weather for the route area (feeds EPA + wind advisory)
    const firstZone = (zones || []).find((z) => z.polygon)
    const c = firstZone ? polygonCentroid(firstZone.polygon) : null
    if (c) {
      getCurrentWeather(c.lat, c.lng).then((w) => {
        weatherRef.current = w
        setWeather(w)
      })
    }
  }, [])

  const endRoute = useCallback(async (at = Date.now()) => {
    engineRef.current.endRoute(at)
    await clearCheckpoint()
    if (traceRef.current.length) {
      await saveGpsTrace(traceRef.current)
      traceRef.current = []
    }
  }, [])

  const pause = useCallback((at = Date.now()) => engineRef.current.pause(at), [])
  const resume = useCallback((at = Date.now()) => engineRef.current.resume(at), [])
  const finishJob = useCallback((at = Date.now()) => engineRef.current.finishJob(at), [])

  const pushFix = useCallback((fix) => {
    lastFixWallRef.current = Date.now()
    lastAccuracyRef.current = fix.accuracy ?? null
    // new object each fix so the map's position effect sees a fresh reference
    lastFixRef.current = { lat: fix.lat, lng: fix.lng, t: fix.t }
    // record for replay (cheap; a few hundred KB/day) — SPEC §11
    traceRef.current.push({ t: fix.t, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy ?? null })
    engineRef.current.processFix(fix)
  }, [])

  const confirmResume = useCallback((zones) => {
    engineRef.current.hydrate(resumePrompt?.checkpoint, zones)
    setResumePrompt(null)
  }, [resumePrompt])

  const discardResume = useCallback(async () => {
    engineRef.current.endRoute(Date.now())
    await clearCheckpoint()
    setResumePrompt(null)
  }, [])

  const timers = state ? computeTimers(state, now) : { jobElapsedSecs: 0, driveSecs: 0 }
  const fixAgeSecs =
    lastFixWallRef.current == null ? null : Math.floor((now - lastFixWallRef.current) / 1000)
  const gpsLevel = active ? gpsHealthLevel(fixAgeSecs, lastAccuracyRef.current) : 'green'

  return {
    state,
    timers,
    now,
    active,
    gpsLevel,
    fixAgeSecs,
    lastFix: lastFixRef.current,
    resumePrompt,
    weather,
    startRoute,
    endRoute,
    pause,
    resume,
    finishJob,
    pushFix,
    confirmResume,
    discardResume,
  }
}
