// Directions-API route optimization (SPEC §7/§8). Optional per build; tracked
// by apiTracker (this is exactly the `directions` call type v1 dropped). Given
// an ordered list of located stops, returns an optimized visiting order and the
// total driving distance. Origin = first stop, destination = last stop, the
// middle waypoints are optimized.

import { loadGoogleMaps } from './loadGoogleMaps.js'
import { recordApiCall } from './apiTracker.js'
import { metersToMiles } from '../engine/geo.js'

/**
 * @param {{lat:number,lng:number}[]} points ordered stop locations (>=2)
 * @returns {Promise<{orderIndices:number[], meters:number, miles:number}>}
 *   orderIndices maps the optimized sequence back to the input indices.
 */
export async function optimizeRoute(points) {
  if (!points || points.length < 2) {
    return { orderIndices: points ? points.map((_, i) => i) : [], meters: 0, miles: 0 }
  }
  const maps = await loadGoogleMaps()
  await recordApiCall('directions')
  const svc = new maps.DirectionsService()

  const origin = points[0]
  const destination = points[points.length - 1]
  const middle = points.slice(1, -1)

  const result = await svc.route({
    origin,
    destination,
    waypoints: middle.map((p) => ({ location: p, stopover: true })),
    optimizeWaypoints: true,
    travelMode: 'DRIVING',
  })

  const route = result.routes[0]
  // waypoint_order indexes into `middle`; rebuild full order over the input.
  const midOrder = route.waypoint_order.map((i) => i + 1)
  const orderIndices = [0, ...midOrder, points.length - 1]
  const meters = route.legs.reduce((s, leg) => s + (leg.distance?.value || 0), 0)

  return { orderIndices, meters, miles: metersToMiles(meters) }
}
