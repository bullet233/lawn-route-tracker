// GPS health level for the always-visible chip (SPEC §2/§4, DESIGN §5).
// green = fresh accurate fix; amber = degraded accuracy or fix 15–60s old;
// red = no fix for 60s (caller also raises a Banner + vibration).

import { MAX_ACCURACY_M } from '../engine/constants.js'

export function gpsHealthLevel(ageSecs, accuracy) {
  if (ageSecs == null || ageSecs > 60) return 'red'
  if (ageSecs > 15) return 'amber'
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return 'amber'
  return 'green'
}
