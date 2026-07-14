// Geofence engine tuning — v1's field-proven constants kept as spec'd defaults
// (SPEC §4.5). One place so tests and the engine reference identical values.

export const ENTER_DEBOUNCE_MS = 8_000 // must be inside a zone this long to start a job
export const EXIT_DEBOUNCE_MS = 15_000 // must be outside this long to finalize an exit
export const DRIVEBY_MS = 45_000 // on-site shorter than this = a driveby, not a real visit
export const MAX_ACCURACY_M = 30 // fixes worse than this are ignored
export const GPS_GAP_MS = 120_000 // a position gap longer than this is a reconciliation event
export const NEAR_ZONE_M = 1_000 // within this, poll GPS high-accuracy; beyond, coarse/slow
