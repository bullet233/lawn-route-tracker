# Lawn Route Tracker v2 — Rebuild Specification (DRAFT)

Status: **approved** — open questions resolved by Dylan 2026-07-14 (Section 14)
Source: reverse-engineered from the field-tested v1 app
(`.gemini/antigravity/scratch/lawn-route-tracker`) plus the weak-point audit
done during the rebuild planning sessions. Everything here is either a rule v1
already proved in the field, or a fix for a defect found in v1's code.

---

## 1. Purpose and design target

A local-first PWA for a solo lawn-care operator. It plans routes, auto-tracks
time on-site via GPS arrival zones, logs visits with revenue, and keeps legally
required EPA application records.

**The design target is the 5-tap day:**

| When | Taps | What happens |
|---|---|---|
| Morning | 2 | Load route template → Start route |
| In the field | 0 | Zones auto start/stop the job timer; visits log themselves |
| End of day | ~3 | Day Review opens pre-filled → scan → Save All |

Every feature is judged against this: if it adds a required tap to a normal
day, it needs a reason. Exception prompts (driveby, opportunity, EPA log) are
allowed because they replace bigger corrections later.

## 2. Stack and platform decisions

- **Vite + React PWA. Dexie (IndexedDB). No backend. No sync service.**
- Google Maps JS API, with v1's `apiTracker` cost-tracking pattern carried
  over — **extended to cover every billable call type.** v1 tracks
  mapLoad/geocode/autocomplete but silently drops `directions` (no branch, no
  price), so its most expensive calls (route optimization, day-review mileage,
  offline fuel sync) never appear in the cost dashboard. v2: one enum of call
  types with prices; an untracked type is a thrown error in dev.
- **Screen-on constraint (decided):** browser PWAs cannot geofence in the
  background. v2 commits to "phone mounted, screen on" during routes:
  - Wake lock acquired while a route is active, re-acquired on visibility
    change (v1 already does this).
  - **GPS health indicator** always visible during a route: green = fresh
    fixes, yellow = degraded accuracy, red banner + vibration when no fix for
    60s. v1 fails silently; v2 must be loud.
  - Big, dark, battery-friendly live screen.
  - If this constraint ever becomes unacceptable, the escape hatch is wrapping
    the same React app in Capacitor for native background geolocation — the
    engine's design (Section 5) must not preclude that.
- **Offline degradation rule:** the live timer and geofence engine must work
  with zero network. Map tiles are decoration; when offline the live screen
  falls back to a list view (next stop, timer, distance). Geocoding is only
  needed at customer-creation time.

## 3. Data model

All tables in Dexie. Conventions that apply everywhere:

- **Money is integer cents.** No floats, no exact-equality bugs.
- **`businessDate: 'YYYY-MM-DD'`** stamped on every visit/route/fuel log at
  write time (computed from *local* time). It is the only day-grouping key in
  the app. Locale date strings and UTC ISO dates never appear as keys — v1
  mixes both (`routes.date` is UTC ISO, day queries are locale strings), so an
  evening-built route can land on the wrong day.
- Timestamps are ms epoch. Display formatting happens only in components.
- **Everything lives in Dexie — including settings.** v1 keeps settings, the
  entire service catalog (`defaultServices`), applicator license info, and the
  EPA chemical inventory in localStorage, invisible to any DB backup. v2 has a
  `settings` table so one export captures the whole business.
- **No silent fallbacks.** When a computation can't run (mileage sync fails,
  geocode fails, import row unparseable), the record is flagged for review —
  never quietly zeroed or marked done. (v1's offline fuel sync marks a log
  synced with 0 miles when it can't compute.)
- **Pages query by index, never `table.toArray()`.** v1 loads every visit ever
  on Dashboard, History, and CustomersList; fine at hundreds of visits,
  degrades over multi-year use. v2 indexes `businessDate` and `customerId`
  and queries ranges.

### services (the single catalog)
```
{ id, name,
  category: 'mowing' | 'fertilizer' | 'cleanup' | 'other',
  defaultPriceCents,
  requiresComplianceLog: bool,   // replaces v1's /fertilizer|weed|spray|chem/ name regex
  active: bool, sortOrder }
```
Service definitions exist once, here. Renaming a service is safe because
nothing matches on names.

### customers
```
{ id, name, address, phone, email,
  location: {lat,lng},                    // geocoded once at creation
  arrivalZone: [{lat,lng}, ...] | null,   // the street trigger zone (v1 semantics)
  serviceOverrides: { [serviceId]: { priceCents?, active? } },  // deltas only
  lawnSqFt: number|null, lawnSizeSource: 'measured'|'manual',   // structured — NO free-text size parsing (v1 bug: "back" parsed as acres)
  perimeterFt, obstacleCount, terrain: 'flat'|'moderate'|'hilly',
  fencedBackyard: bool, propertyNotes,
  mowingIntervalDays, holdUntil: 'YYYY-MM-DD'|null,   // vacation hold — hidden from ALL due lists until the date
  excludeFromAnalytics: bool,
  specialApplications,                    // chemical constraints — surfaced in EPA modal + treatment stops
  treatmentProgramId, treatmentProgramYear,
  createdAt }
```

### routes
```
{ id, businessDate, type: 'mowing' | 'treatment' | 'mixed',   // planning intent lives HERE, never on visits
  status, isTemplate, name,
  stops: [{ customerId, order, plannedServiceIds: [id],
            treatmentIds: [id],          // treatment-round stops carry the step(s) they fulfill
            plannedDriveTimeSecs, plannedDriveDistanceMeters }],
  plannedDistanceMiles }
```
When a visit completes at a stop with `treatmentIds`, those treatments are
auto-completed and linked (`completedByVisitId`), with the EPA log confirmed
at Day Review — the loop closes mechanically, not by inference. The stop's
planned service comes from the step's billing resolution (Section 3), not
name matching — v1's fertilizer route mode picks services by
`name.includes('fertil')` and never touches the treatments table at all, so
v1 fert routes and the treatment schedule silently drift apart. This field is
the fix.

**Fulfillment is transactional with line items.** A treatment's completion is
derived from the visit's *final* line items (finalized at Day Review):
- Only `status: 'completed'` visits fulfill — a skipped stop (including
  route-end force-skips) never completes a treatment.
- Planned mow+fert stop where you only mowed (too windy)? Uncheck the fert
  service at Day Review → line item gone → treatment reverts to open.
- Removing a fulfilling line item later (visit edit) or deleting the visit
  reverts the treatment to `scheduled`, with a confirm. A treatment can never
  point at a dead visit or a visit that no longer bills the work.
Stops are always this object shape — v1 has legacy id-only stops and every
consumer branches on `typeof s === 'object'`; the importer normalizes once.
Saving a new route must **ask** before closing an existing active route (v1
silently force-completes it).

**Customer location is first-class.** v1 discards the geocoded lat/lng and
derives every location from the arrival-zone centroid — so customers without
zones are invisible to route mapping, mileage calc, and outlier detection, and
the "location" is actually a point on the street. v2 stores `location` at
geocode time and uses the zone only for geofencing.

### visits (the only execution record)
```
{ id, routeId|null, customerId, businessDate,
  status: 'completed' | 'skipped',
  entryTime, exitTime, durationSecs, driveTimeSecs,
  source: 'gps' | 'manual' | 'split',    // provenance — split/manual visits carry estimated times
  lineItems: [{ serviceId, name, category, priceCents }],  // snapshot at completion; never reverse-engineered
  addOns: [{ name, priceCents }],
  attribution: 'exact' | 'estimated',     // 'estimated' only on v1-migrated data
  weather, conditions: [], note }
```
Derived facts are computed at read, never stored:
- visit revenue = Σ lineItems + Σ addOns
- "is a fertilizer visit" = any line item with category 'fertilizer'
- revenue-by-service = group line items (v1's `getVisitRevenueBreakdown`
  guessing logic is deleted; it cannot exist in this schema)

### complianceLogs (EPA records — one shape, first-class)
```
{ id, visitId, customerId, businessDate,
  applicatorName, licenseNumber, businessPhone, mixSite,
  areaTreatedSqFt, startTime, endTime,
  tempF, windMph,        // auto-filled from the visit's captured weather, editable
  products: [{ productName, epaRegNum, category, targetSite, applicationRate,
               isSpotTreatment, spotAreaSqFt, spotLocation, customerNotices: [] }] }
```
`tempF`/`windMph` are new vs v1: the visit already captures weather, and wind
speed at application time is exactly what drift-complaint disputes ask for —
recording it costs nothing since the data is already there.

**One log per visit.** A visit with multiple chemical line items (Round 3 +
spot weed spray) gets ONE compliance log whose `products[]` lists everything
applied — that matches how the legal record works (one application event) and
v1's own products[] shape. The log links by `visitId`; line items don't carry
log references. The customer's `specialApplications` notes ("pet-safe only in
backyard") are displayed inside the log modal and on treatment stop cards —
v1 collects them but never surfaces them at application time.
Always the `products[]` array shape. v1's single-product legacy shape is
migrated once at import; no back-compat branches anywhere in v2.

### treatmentPrograms / treatments (scheduling only)
Port v1's model (it's the cleanest code in v1) with these changes:
```
ProgramStep: { ..., billingServiceId: id|null }   // which service a completed step bills as
treatments:  { ..., completedByVisitId: id|null }
```
A completed treatment links to the visit + line item that fulfilled it. The
compliance log lives on the visit's line item — a treatment is a plan, a visit
is what happened. No duplicated price/duration/log on treatment records.

**Category granularity note:** `services.category` is deliberately coarse
(`fertilizer` covers all chemical work — it drives views, EPA prompts, mower
hours). Program-step categories stay fine-grained (Pre-Emergent, Weed Control,
Fungicide, Insecticide…) — they describe the *plan*, not the billing. The two
never need to match; a step bills as whatever `billingServiceId` resolves to.

**Billing resolution when a step completes:** use the step's
`billingServiceId` if set; else, if the customer has exactly one active
fertilizer-category service, use it; else Day Review asks. Price comes from
the resolved service (with the customer's override), same as any line item.

### fuelLogs
```
{ businessDate, milesDriven, mowerHours, costOfGasCents, truckMpg, mowerGph, pendingSync }
```
Mower hours derived from line-item categories: a visit contributes its
duration if it has any mowing-category line item. (Replaces v1's
`isOnlyFertilizer` heuristic loop.)

### engineState (crash recovery — new)
```
{ id: 'singleton', activeCustomerId, jobStartTime, accumulatedPauseMs,
  driveAccumulatedSecs, driveRunning, lastFixAt, lastFixInsideZone, updatedAt }
```
Checkpointed by the geofence engine on every state transition (Section 5).

### gpsTraces (opt-in debug recording — new)
```
{ id, businessDate, points: [{t, lat, lng, accuracy}] }
```
Cheap to record (~few hundred KB/day). Any field bug becomes a replayable
regression test (Section 12).

### errorLog (new)
Caught exceptions + context, viewable in Settings, capped at N entries. A solo
operator has no telemetry; this is the substitute.

## 4. Geofence engine

Port v1's `GeofenceEngine` — the debounce state machine is field-proven — with
these ownership and robustness changes:

1. **The engine is the single owner of tracking state.** The UI renders
   `engine.getState()` via a subscription; it never mirrors state in refs and
   never writes engine fields (v1's LiveMap does both — that pattern is
   banned).
2. **Checkpoint on every transition** to the `engineState` table. On app
   start, rehydrate: if a job was active, show "Looks like you were at
   {name} for {n} min when the app closed — still there?" with resume /
   finish / discard options. (v1 loses the running job on any reload.)
3. **GPS-gap reconciliation.** A position gap > 120s is an event. On the next
   fix: if we were in a job and are no longer inside the zone, backdate the
   exit to the last inside-zone fix rather than letting the timer run. If the
   phone was closed, closed time follows the same rule via the checkpoint's
   `lastFixAt`/`lastFixInsideZone`.
4. **Closed-app time never silently counts as drive time.** v1's drive timer
   adds the whole time-closed gap to drive time on reload. v2: on rehydrate,
   time while closed is attributed only after the user confirms on the resume
   prompt ("count the 43 min since as drive time?").
5. Keep v1's tuned constants as spec'd defaults: 8s enter debounce, 15s exit
   debounce, 45s driveby threshold, >30m accuracy fixes ignored, overlap
   resolution by nearest zone center.
6. **Zone overlap detection is built in** (`polygonsOverlap` /
   `findOverlappingCustomers`, already written + tested in v1's engine —
   ports directly). Editor warns on save; health check reports all pairs.
7. **Adaptive sampling for battery:** when distance to the nearest zone
   exceeds ~1km, drop GPS to coarse/slow polling; go high-accuracy when close.
   The engine computes nearest-zone distance anyway — reuse it.

## 5. Timers

- Job timer and drive timer live inside the engine (they are part of tracking
  state and must checkpoint with it — v1 splits them across two hooks and a
  page).
- Pause semantics identical to v1 (pause for lunch stops drive accrual; a
  paused job never auto-exits).
- Drive-time fallback when the timer wasn't running (manual starts): wall
  clock since the previous visit's exit, same as v1.

## 6. Mowing vs fertilizer — the two sides of the business

The six structural decisions:

1. Category lives on the **service definition**, once.
2. **No `division` field on visits, and no global mode toggle at all**
   (decided: fertilizer lives fully in the treatments workflow). v1's
   ServiceProvider/activeMode concept is not ported. The **Treatments page is
   the fertilizer home**; History and Analytics get category filter chips
   where useful.
3. **Routes carry `type`** because planning intent is real (mow rounds come
   from intervals, treatment rounds from program windows).
4. **Treatments schedule; visits record.** Completion links, never copies.
5. `requiresComplianceLog` on the service triggers the EPA prompt — no name
   regex.
6. Mixed stops (mow + fert in one visit) are first-class: two line items, both
   revenue buckets, EPA prompt, mower hours — no mode toggle to get wrong.

### How the mowing side functions

- A customer is "a mowing customer" iff they have an active mowing-category
  service **and** `mowingIntervalDays` set. The mowing cadence engine only
  runs for those customers — fertilizer-only clients are never nagged about
  mowing.
- Lifecycle: due (interval elapsed since last mowing-category visit) → route
  stop → zone auto-timer → visit with mowing line items → Day Review confirm.
- The pricing matrix / power model trains **only on `source: 'gps'` visits
  whose line items are all mowing-category.** This is stricter than v1, which
  trains on mixed visits too — a mow+fert stop's duration includes spreader
  time and inflates the mowing curve. Mixed and split visits appear in
  history/revenue but never in the model.

### How the fertilizer side functions

- Scheduling is **programs only** — v1's per-customer `fertilizerInterval` /
  `fertilizerRounds` naive-interval fields are not ported. Enrollment in a
  program for a year generates the season's treatment steps; that is the one
  source of fertilizer due-ness.
- Lifecycle: enrolled step enters its window → due item → treatment-round
  stop (carrying `treatmentIds`) → same zone auto-timer → visit with a
  fertilizer line item (billed per the resolution rule in Section 3) → EPA
  log at Day Review (Repeat-Last fast path) → treatment auto-completed and
  linked.
- **Every completion goes through a visit — no exceptions.** Logging an
  application from the Treatments page (no route, no GPS) creates a manual
  visit (`source: 'manual'`) with the fert line item and compliance log, then
  links it. v1's parallel ad-hoc treatment records (own price/duration/log)
  do not exist in v2; there is exactly one execution record type.
- **Season rollover** is a one-tap bulk action: "Enroll all active program
  customers for {year+1}" (per-customer opt-out), instead of v1's
  re-enrollment one customer at a time.

### Where the sides meet

- **Mixed stop, planned or spontaneous:** checking a fertilizer service on a
  visit at Day Review looks up that customer's open treatment whose window
  contains the visit date and offers to complete-and-link it ("This counts as
  Round 3?"). Decline = the line item stands alone (off-program application).
- **Integrity rule:** deleting or un-completing a visit that fulfills a
  treatment reverts the treatment to `scheduled` (with a confirm). A
  treatment can never point at a dead visit.
- **Program edits propagate to open steps only.** Editing a step's
  name/window offers to update that step's `scheduled`/`due` treatments for
  the current year; `completed` ones are frozen history. (v1 copies step data
  at enrollment and never reconciles — edited programs and existing schedules
  drift.) Un-enrollment keeps v1's rule: open treatments deleted, completed
  ones kept.
- **One progress number.** The customer's fertilizer tab shows the program
  step list; progress = completed/total steps for the year. v1 shows two
  competing trackers on the same tab (program steps AND a `fertilizerRounds`
  bar counted from `s3` visits) that can disagree — `fertilizerRounds` is not
  ported.
- **Vacation hold:** `customer.holdUntil` hides a customer from both due
  engines until the date — the clean answer to "skip us till August" (v1 has
  no concept; the customer just shows overdue for weeks).
- **Fuel:** a visit contributes its duration to mower hours iff it has a
  mowing-category line item (mixed visits count fully — same approximation
  as v1, now derived from one source of truth).
- **Reporting:** revenue-by-side = group line items by category. Mixed visits
  split naturally; nothing is ever counted twice because the line item is the
  atomic unit of revenue.

## 7. Scheduling and the due list

Two independent cadence engines emit one shared shape:

```
DueItem = { customerId, engine: 'mowing'|'treatment',
            reason: string, dueDate, priority }
```

- **Mowing engine:** due when `today - lastMowingCategoryVisit >=
  mowingIntervalDays` (per customer). `priority` = days overdue (sharp
  deadline — a lawn gets shaggier every day past due).
- **Treatment engine:** v1's `classifyTreatment` window logic, ported as-is.
  `priority` = urgency as the window closes: low at window open, rising to
  overdue-level as `dueWindowEnd` approaches (wide deadline — any day inside
  the window is equally fine agronomically, so urgency is about not running
  out of window, not about the start date).

These two priority scales are normalized so the merged list sorts sensibly:
a mow 3 days overdue and a treatment with 3 days of window left should rank
similarly. The route builder consumes the merged due list and doesn't know
which engine produced an item. Customers with an active `holdUntil` are
excluded from both engines.

**Double-up suggestion:** when a customer appears in both engines at once
(mowing due AND a treatment window open), the route builder badges them —
one stop can fulfill both, which is exactly the efficiency the line-item
model makes safe. **Wind advisory:** treatment-round building and the live
screen show the day's forecast wind; above a configurable drift threshold
(default 10 mph), spraying stops get a warning badge — the forecast data is
already fetched for weather capture. Route templates (saved stop orderings) are the primary
morning workflow; Directions API optimization is optional per build, tracked
by apiTracker.

## 8. Screens

| Screen | Notes |
|---|---|
| Dashboard | Today's stats, start-route CTA, and **two due cards** — "Mowing due (N)" and "Treatments in window (N)" — since there's no mode toggle, both sides are always visible |
| Route Builder | Templates first-class; due-list driven; drag ordering; double-up badges (mow due + treatment window); wind advisory on spray stops |
| Live Map | Engine-state renderer. GPS health indicator. Offline list fallback. Driveby + opportunity + pending-arrival prompts (v1 semantics) |
| Day Review | v1's flow (it's good): pre-filled services, EPA per applicable visit with Repeat-Last, auto miles via Directions with haversine offline fallback, one Save All |
| History | v1's layout; totals from line items; "Time in Field" shows job and job+drive separately (v1 ambiguity resolved by showing both) |
| Customers | List with due badges; detail with stats/services/location tabs |
| Zone editor | v1's editor (tap-to-place square, trace, resize slider) + overlap banner |
| Treatments | The fertilizer home. Ports v1's proven layout: Needs Attention / Upcoming-45-days sections, "Now: {step}" season indicator, enrollment list with Enroll All, skipped list with un-skip, per-customer done/total. Adds: "build round route" action (feeds Route Builder stops carrying `treatmentIds`), log-application creates a manual visit (Section 6 — v1 logs against a fake visit object), season rollover |
| Analytics | Pricing matrix + power model (port v1's `matrix.js` math, minus the free-text size parsing), fuel costs, $/hr |
| Health Check (new) | Customers missing zones; overlapping zone pairs; stale prices (service override differs from catalog for >N months); customers with no active services; visits with `attribution: 'estimated'` count |
| Settings | Rates, fuel params, chemical inventory, applicator info, backup/restore, error log |

UI style is governed by **[DESIGN.md](DESIGN.md)** — tokens, component
inventory, field-mode vs office-mode rules, per-screen layouts, and the CSS
architecture (plain CSS variables + shared classes; inline style objects
banned). Build sessions treat DESIGN.md deviations like spec deviations.
Summary: light theme only, card/tile, green-as-state accent, bottom tab bar,
56px+ field touch targets, hero-size live timer, GPS health chip.

**One rate config.** `targetHourlyRate` / `rateUnderpaidThreshold` from
settings are the only pricing thresholds; no screen hardcodes its own (v1's
TimeSplitModal hardcodes $60/$45).

## 9. Field data-entry fast paths

- EPA: chemical inventory in Settings auto-fills product fields; **Repeat Last
  Saved Application** copies the previous log wholesale (v1 features, kept).
- Time splitting for clustered lawns: keep v1's proportional-split modal, but
  resulting visits are stamped `source: 'split'` and **excluded from pricing-
  model training** (decided — split defaults come from the model's own
  predictions, so training on them is circular). They appear normally in
  history and revenue.
- Quick-add customer from the truck: name + tap-to-place zone is enough;
  everything else can be filled at home.

## 10. Backup and data safety

- **Backup at every Day Review save** (not weekly): JSON snapshot of all
  tables auto-downloaded (or File System Access API where available). Zero
  extra taps. EPA records are legal documents; max acceptable loss is one day.
- Manual export/import in Settings (full fidelity, versioned schema header).
- **Single-writer rule:** the phone is the only writer. Desktop use is
  read-only via imported snapshots. (No sync infrastructure for a crew of
  one; divergence is prevented by policy, stated in the UI.)
- Restore = import snapshot into a fresh DB, never merge.

## 11. Testing strategy

- Every number a screen displays comes from a pure function in `utils/` or
  `engine/` with vitest coverage. **JSX contains no `reduce`.** (v1's only two
  bug-free modules were exactly its two tested modules.)
- Engine tested two ways:
  1. Synthetic update sequences (v1's style — port those tests).
  2. **Trace replay:** recorded `gpsTraces` days replayed through the engine
     asserting the resulting visit log. Every field bug becomes a fixture.
- Money/date utils get property-ish tests (cents round-trips, businessDate
  across midnight and DST).
- **One implementation per formula.** v1's Analytics re-implements the
  difficulty normalization and fits its own inline regression separately from
  `matrix.js` — two copies drift. Any math used twice lives in one exported
  function.
- Importer tested against a full copy of the real v1 database export.

## 12. Migration from v1

Built in **Phase 1**, not last — it is the proof the schema works.

1. Export every v1 table to JSON (one-time script run against the old app).
2. Transform:
   - visits → line items using v1's reconstruction logic one final time;
     anything guessed is stamped `attribution: 'estimated'`.
   - single-product complianceLogs → `products[]` shape.
   - `division` dropped; categories re-derived from service definitions.
   - free-text lawn sizes parsed once (with the "ac" bug fixed), stored
     structured; unparseable values flagged for manual review.
   - dates → businessDate strings; money → cents.
3. **Parity check (the acceptance test):** total revenue, visit counts, and
   per-customer totals in v2 must equal v1's History page numbers for
   all-time. Differences are bugs in the importer, not rounding to accept.

## 13. Build phases and gates

Rule: **feature freeze until parity.** Nothing v1 doesn't do gets built until
after cutover, except items in this spec (they're fixes, not features).

- **Phase 0** — this spec, reviewed and corrected by Dylan.
- **Phase 1 — data foundation.** Schema, pure utils, cadence engines, vitest,
  export/import, v1 importer. *Gate: parity check passes on real data.*
- **Phase 2 — core field loop.** Customers, zone editor (+overlap), engine
  port (+checkpointing, gap reconciliation, health indicator), Live Map,
  visit logging. *Gate: one real week run in parallel with v1; visit logs
  compared at each day's end.*
- **Phase 3 — planning & review.** Route builder + templates, due list, Day
  Review (+per-save backup), History. *Gate: full 5-tap day works.*
- **Phase 4 — compliance.** Programs/treatments linked to visits, EPA single
  shape, print sheet, chemical inventory.
- **Phase 5 — analytics & polish.** Matrix + power model, fuel, health check,
  CSV export, PWA install polish.
- **Cutover:** freeze v1, final import, v1 kept installed read-only for the
  rest of the season as the archive.

## 14. Decisions (open questions resolved 2026-07-14)

1. **Platform: PWA, screen-on.** Wake lock + loud GPS-health indicator; the
   engine stays platform-agnostic so a Capacitor wrap remains possible later.
2. **Fertilizer lives fully in treatments.** No global mowing/fertilizer mode
   toggle in v2 (v1's ServiceProvider/activeMode is not ported). Treatments
   page is the fertilizer home; category filters elsewhere.
3. **Backup: auto-download JSON** at every Day Review save. No Drive/OAuth.
4. **Split visits are excluded from pricing-model training** (circularity),
   visible everywhere else as normal visits.
5. **Nothing dropped:** calendar view, conditions tags, and weather capture
   are all kept and ported.
