// GeofenceEngine — ports v1's debounce state machine (SPEC §4/§5) with the
// ownership + robustness changes the spec mandates.
//
// Design rules baked in:
//  - THE engine is the single owner of tracking state. UI renders getState()
//    via subscribe(); it never writes engine fields (SPEC §4.1).
//  - Deterministic: every fix carries its own timestamp `t` (ms). The engine
//    reads NO wall clock, so a recorded gpsTraces day replays identically
//    (SPEC §11 trace-replay). Live callers pass Date.now() as t.
//  - Checkpoint on every transition via onCheckpoint (SPEC §4.2).
//  - Completed jobs surface via onVisit; the adapter persists them.
//  - Closed-app / big-gap time is reconciled, never silently counted
//    (SPEC §4.3/§4.4) — see rehydrate() and the gap branch in processFix().
//
// Phases: 'idle' (no route) → 'driving' → 'arriving' → 'onsite' → back to
// 'driving'. Pause freezes accrual and suppresses auto-exit.

import {
  ENTER_DEBOUNCE_MS,
  EXIT_DEBOUNCE_MS,
  DRIVEBY_MS,
  MAX_ACCURACY_M,
  GPS_GAP_MS,
  NEAR_ZONE_M,
} from './constants.js'
import { zoneContaining, distanceToNearestZone } from './geo.js'

function freshState() {
  return {
    phase: 'idle',
    zones: [],
    // drive accrual
    driveAccumulatedSecs: 0,
    driveRunning: false,
    lastDriveAccrualAt: null,
    // arriving debounce
    arrivingCustomerId: null,
    arrivingSince: null,
    // onsite job
    activeCustomerId: null,
    jobStartTime: null,
    accumulatedPauseMs: 0,
    lastInsideFixAt: null,
    // exit debounce
    exitingSince: null,
    // pause
    paused: false,
    pauseStartedAt: null,
    // fix bookkeeping (also checkpoint fields, SPEC engineState)
    lastFixAt: null,
    lastFixInsideZone: false,
    // sampling hint for the caller
    sampling: 'coarse',
    updatedAt: null,
  }
}

export class GeofenceEngine {
  constructor({ onCheckpoint, onVisit } = {}) {
    this._s = freshState()
    this._subs = new Set()
    this._onCheckpoint = onCheckpoint || (() => {})
    this._onVisit = onVisit || (() => {})
  }

  // ---- public read API (UI subscribes, never mutates) ----
  getState() {
    return this._s
  }

  subscribe(fn) {
    this._subs.add(fn)
    return () => this._subs.delete(fn)
  }

  _emit() {
    this._s = { ...this._s }
    for (const fn of this._subs) fn(this._s)
  }

  _checkpoint() {
    this._onCheckpoint(this._snapshotForCheckpoint())
  }

  _snapshotForCheckpoint() {
    const s = this._s
    return {
      id: 'singleton',
      phase: s.phase,
      activeCustomerId: s.activeCustomerId,
      jobStartTime: s.jobStartTime,
      accumulatedPauseMs: s.accumulatedPauseMs,
      driveAccumulatedSecs: s.driveAccumulatedSecs,
      driveRunning: s.driveRunning,
      lastFixAt: s.lastFixAt,
      lastFixInsideZone: s.lastFixInsideZone,
      lastInsideFixAt: s.lastInsideFixAt,
      arrivingCustomerId: s.arrivingCustomerId,
      arrivingSince: s.arrivingSince,
      exitingSince: s.exitingSince,
      paused: s.paused,
      pauseStartedAt: s.pauseStartedAt,
      updatedAt: s.updatedAt,
    }
  }

  // ---- lifecycle ----
  startRoute(zones, at) {
    this._s = freshState()
    this._s.zones = zones || []
    this._s.phase = 'driving'
    this._s.driveRunning = true
    this._s.lastDriveAccrualAt = at
    this._s.updatedAt = at
    this._checkpoint()
    this._emit()
  }

  endRoute(at) {
    // finalize any active job as a forced exit before ending
    if (this._s.phase === 'onsite') this._finalizeExit(this._s.lastInsideFixAt ?? at, at, true)
    this._s.phase = 'idle'
    this._s.driveRunning = false
    this._s.updatedAt = at
    this._checkpoint()
    this._emit()
  }

  /** Manually finish the current job (slide-to-finish), finalizing now. */
  finishJob(at) {
    if (this._s.phase !== 'onsite') return
    if (!this._s.paused) this._accrueDrive(at)
    this._finalizeExit(at, at, true)
    this._s.updatedAt = at
    this._checkpoint()
    this._emit()
  }

  pause(at) {
    const s = this._s
    if (s.paused) return
    this._accrueDrive(at)
    s.paused = true
    s.pauseStartedAt = at
    s.driveRunning = false
    s.updatedAt = at
    this._checkpoint()
    this._emit()
  }

  resume(at) {
    const s = this._s
    if (!s.paused) return
    if (s.phase === 'onsite' && s.pauseStartedAt != null) {
      s.accumulatedPauseMs += at - s.pauseStartedAt
    }
    s.paused = false
    s.pauseStartedAt = null
    // drive timer resumes only when not on site
    if (s.phase === 'driving' || s.phase === 'arriving') {
      s.driveRunning = true
      s.lastDriveAccrualAt = at
    }
    s.updatedAt = at
    this._checkpoint()
    this._emit()
  }

  // ---- core: process one GPS fix ----
  processFix(fix) {
    const s = this._s
    if (s.phase === 'idle') return
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return // ignore junk fix

    const t = fix.t
    const point = { lat: fix.lat, lng: fix.lng }
    const gap = s.lastFixAt == null ? 0 : t - s.lastFixAt

    // drive accrual up to this fix (before any state change)
    if (!s.paused) this._accrueDrive(t)

    const zone = zoneContaining(point, s.zones)
    const insideActive = s.phase === 'onsite' && zone && zone.customerId === s.activeCustomerId

    // --- GPS-gap reconciliation (SPEC §4.3) ---
    if (gap > GPS_GAP_MS && s.phase === 'onsite' && !insideActive && !s.paused) {
      // We were in a job and are no longer inside → backdate exit to the last
      // inside-zone fix rather than letting the timer run through the gap.
      this._finalizeExit(s.lastInsideFixAt ?? s.lastFixAt ?? t, t)
      s.lastFixAt = t
      s.lastFixInsideZone = false
      s.updatedAt = t
      this._afterFixSampling(point)
      this._checkpoint()
      this._emit()
      return
    }

    switch (s.phase) {
      case 'driving':
        if (zone) {
          s.phase = 'arriving'
          s.arrivingCustomerId = zone.customerId
          s.arrivingSince = t
        }
        break

      case 'arriving':
        if (!zone) {
          // left before debounce elapsed → cancel, back to driving
          s.phase = 'driving'
          s.arrivingCustomerId = null
          s.arrivingSince = null
        } else if (zone.customerId !== s.arrivingCustomerId) {
          // moved into a different zone → restart debounce there
          s.arrivingCustomerId = zone.customerId
          s.arrivingSince = t
        } else if (t - s.arrivingSince >= ENTER_DEBOUNCE_MS) {
          this._enterOnsite(zone.customerId, s.arrivingSince, t)
        }
        break

      case 'onsite':
        if (insideActive) {
          s.lastInsideFixAt = t
          s.exitingSince = null // any re-entry cancels a pending exit
        } else if (!s.paused) {
          // outside the active zone → run exit debounce
          if (s.exitingSince == null) s.exitingSince = t
          else if (t - s.exitingSince >= EXIT_DEBOUNCE_MS) {
            this._finalizeExit(s.exitingSince, t)
          }
        }
        break

      default:
        break
    }

    s.lastFixAt = t
    s.lastFixInsideZone = !!zone
    s.updatedAt = t
    this._afterFixSampling(point)
    this._checkpoint()
    this._emit()
  }

  // ---- transitions ----
  _accrueDrive(t) {
    const s = this._s
    if (s.driveRunning && s.lastDriveAccrualAt != null && t > s.lastDriveAccrualAt) {
      s.driveAccumulatedSecs += (t - s.lastDriveAccrualAt) / 1000
    }
    if (s.driveRunning) s.lastDriveAccrualAt = t
  }

  _enterOnsite(customerId, entryTime, t) {
    const s = this._s
    // capture drive-to-this-customer, then reset the drive accumulator
    s._pendingDriveSecs = s.driveAccumulatedSecs
    s.driveAccumulatedSecs = 0
    s.driveRunning = false
    s.lastDriveAccrualAt = null
    s.phase = 'onsite'
    s.activeCustomerId = customerId
    s.jobStartTime = entryTime
    s.accumulatedPauseMs = 0
    s.lastInsideFixAt = t
    s.exitingSince = null
    s.arrivingCustomerId = null
    s.arrivingSince = null
  }

  _finalizeExit(exitTime, t, forced = false) {
    const s = this._s
    const durationSecs = Math.max(
      0,
      (exitTime - s.jobStartTime - s.accumulatedPauseMs) / 1000,
    )
    const visit = {
      customerId: s.activeCustomerId,
      entryTime: s.jobStartTime,
      exitTime,
      durationSecs,
      driveTimeSecs: Math.round(s._pendingDriveSecs || 0),
      source: 'gps',
      driveby: durationSecs * 1000 < DRIVEBY_MS,
      forced,
    }
    this._onVisit(visit)

    // back to driving; drive timer restarts from the exit moment
    s.phase = 'driving'
    s.activeCustomerId = null
    s.jobStartTime = null
    s.accumulatedPauseMs = 0
    s.lastInsideFixAt = null
    s.exitingSince = null
    s._pendingDriveSecs = 0
    s.driveRunning = !s.paused
    s.lastDriveAccrualAt = t
  }

  _afterFixSampling(point) {
    const d = distanceToNearestZone(point, this._s.zones)
    this._s.sampling = d > NEAR_ZONE_M ? 'coarse' : 'fine'
  }

  /**
   * Restore engine state from a checkpoint after a reload (SPEC §4.2). Zones
   * are supplied separately (they live on the active route, not the checkpoint).
   * Closed-app time is NOT counted: drive accrual restarts from the next fix
   * (lastDriveAccrualAt=null) and the gap to the next fix won't be added
   * (lastFixAt=null), so nothing is attributed until fresh fixes arrive
   * (SPEC §4.4). The caller shows a resume prompt first (see describeResume).
   */
  hydrate(checkpoint, zones) {
    if (!checkpoint) return
    const s = freshState()
    s.zones = zones || []
    s.phase = checkpoint.phase || 'idle'
    s.activeCustomerId = checkpoint.activeCustomerId ?? null
    s.jobStartTime = checkpoint.jobStartTime ?? null
    s.accumulatedPauseMs = checkpoint.accumulatedPauseMs ?? 0
    s.driveAccumulatedSecs = checkpoint.driveAccumulatedSecs ?? 0
    s.lastInsideFixAt = checkpoint.lastInsideFixAt ?? null
    s.arrivingCustomerId = checkpoint.arrivingCustomerId ?? null
    s.arrivingSince = checkpoint.arrivingSince ?? null
    s.exitingSince = checkpoint.exitingSince ?? null
    s.paused = !!checkpoint.paused
    s.pauseStartedAt = checkpoint.pauseStartedAt ?? null
    // deliberately NOT restored: lastFixAt, lastDriveAccrualAt → no closed-app
    // time is counted (SPEC §4.4). Drive resumes on the next fix if applicable.
    s.driveRunning = checkpoint.phase === 'driving' || checkpoint.phase === 'arriving'
    s.lastDriveAccrualAt = null
    s.lastFixAt = null
    s.updatedAt = checkpoint.updatedAt ?? null
    this._s = s
    this._emit()
  }

  // ---- crash recovery (SPEC §4.2/§4.4) ----
  /**
   * Rehydrate from a checkpoint after a reload/crash. Does NOT auto-count the
   * time the app was closed: it returns a resume prompt describing what was
   * active; the caller confirms before any of that gap becomes drive time or
   * the job is resumed/finished.
   * @returns {null | { kind:'onsite'|'driving', customerId?, jobStartTime?, sinceMs }}
   */
  static describeResume(checkpoint, nowMs) {
    if (!checkpoint || checkpoint.phase === 'idle' || checkpoint.phase == null) return null
    const sinceMs = checkpoint.lastFixAt != null ? nowMs - checkpoint.lastFixAt : null
    if (checkpoint.phase === 'onsite') {
      return {
        kind: 'onsite',
        customerId: checkpoint.activeCustomerId,
        jobStartTime: checkpoint.jobStartTime,
        sinceMs,
      }
    }
    return { kind: 'driving', sinceMs }
  }
}

/**
 * Live-timer selector (SPEC §5). Timers are derived, not stored — the engine
 * holds start/accrual state; the UI computes elapsed at render time.
 */
export function computeTimers(state, nowMs) {
  const jobPause =
    state.paused && state.pauseStartedAt != null ? nowMs - state.pauseStartedAt : 0
  const jobElapsedSecs =
    state.phase === 'onsite' && state.jobStartTime != null
      ? Math.max(0, (nowMs - state.jobStartTime - state.accumulatedPauseMs - jobPause) / 1000)
      : 0
  let driveSecs = state.driveAccumulatedSecs
  if (state.driveRunning && !state.paused && state.lastDriveAccrualAt != null) {
    driveSecs += Math.max(0, (nowMs - state.lastDriveAccrualAt) / 1000)
  }
  return { jobElapsedSecs, driveSecs }
}
