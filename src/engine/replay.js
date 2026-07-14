// Trace replay (SPEC §11). Run a recorded gpsTraces day back through a fresh
// engine and return the resulting visit log. Because the engine reads no wall
// clock (every fix carries its own t), replay is deterministic — any field bug
// captured as a trace becomes a regression fixture.

import { GeofenceEngine } from './geofenceEngine.js'

/**
 * @param {{t:number,lat:number,lng:number,accuracy?:number}[]} points
 * @param {{customerId:string,polygon:{lat,lng}[]}[]} zones
 * @returns {Array} completed visits the engine emitted, in order
 */
export function replayTrace(points, zones) {
  const visits = []
  const engine = new GeofenceEngine({ onVisit: (v) => visits.push(v) })
  const first = points[0]?.t ?? 0
  engine.startRoute(zones, first)
  for (const p of points) engine.processFix({ accuracy: 5, ...p })
  return visits
}
