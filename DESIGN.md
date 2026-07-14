# Lawn Route Tracker v2 — UI Design System

Companion to [SPEC.md](SPEC.md). SPEC.md governs behavior; this governs look,
feel, and interaction. Build sessions should treat deviations from this file
the same as deviations from the spec.

---

## 1. Principles

1. **Boring on purpose.** The app's value is zero-touch days and trustworthy
   numbers. Every screen looks like the same calm tool. Color is reserved for
   *state* (green/amber/red), never decoration.
2. **Two contexts, two densities.** Field screens (Live Route, Day Review)
   are huge, sparse, and one-hand/glove operable in direct sunlight. Office
   screens (everything else) are normal density, used on the couch or desk.
3. **Glanceable.** Card/tile layouts, white background, dark text, large
   sizing. State must be readable from the truck mount at arm's length.
4. **Light theme only.** The phone is mounted and plugged in — battery is
   moot, sun glare is not. Bright white + dark text is the most
   sunlight-readable combination. No dark mode in v2.
5. **One component set.** Every card, pill, and stat tile comes from the
   shared components + `globals.css` classes below. Inline style objects are
   banned (v1 repeats thousands of them and drifted).

## 2. Design tokens (globals.css `:root`)

### Color

```css
--bg-app:        #f8fafc;   /* page background — near-white slate */
--bg-card:       #ffffff;   /* cards */
--bg-inset:      #f1f5f9;   /* wells inside cards, table headers */
--border:        #e2e8f0;
--border-strong: #cbd5e1;

--text-main:     #0f172a;
--text-muted:    #64748b;

--green:         #10b981;   /* primary + "good / on-site / complete" */
--green-dark:    #059669;
--green-bg:      rgba(16,185,129,0.10);
--amber:         #f59e0b;   /* pending / warning / due */
--amber-bg:      rgba(245,158,11,0.12);
--red:           #ef4444;   /* overdue / error / destructive */
--red-bg:        rgba(239,68,68,0.10);
--blue:          #3b82f6;   /* informational only (sync, tips) */
--blue-bg:       rgba(59,130,246,0.10);
--slate:         #64748b;   /* idle / neutral state */
```

Category colors for treatment chips (carried from v1 — one of its best ideas):
Pre-Emergent `#8b5cf6` · Weed Control `#f59e0b` · Fertilizer `#10b981` ·
Insecticide `#ef4444` · Fungicide `#0ea5e9` · Other `#64748b`.
Each used at full strength for text/icon with a `1a`-alpha background.

### State color system (the only meanings colors are allowed to have)

| Color | Means | Examples |
|---|---|---|
| Green | good / active / complete | on-site timer, completed visit, enrolled |
| Amber | attention soon / pending | arriving countdown, due window, underpaid-ish rate |
| Red | act now / error / destructive | overdue, GPS lost, delete, badly underpaid |
| Blue | neutral information | sync status, tips, mileage card |
| Slate | idle / off | driving state, disabled, skipped |

### Typography

System stack: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`
(bundle Inter as the PWA is offline-first; fall back cleanly).

```css
--fs-hero:   3.5rem;  /* 56px — live timer digits (tabular-nums) */
--fs-title:  1.5rem;  /* page titles */
--fs-card:   1.15rem; /* card headings, customer names */
--fs-body:   1rem;    /* 16px minimum everywhere — no exceptions on field screens */
--fs-small:  0.85rem; /* metadata, timestamps */
--fs-micro:  0.72rem; /* uppercase labels, chips — office screens only */
```

- All numerals that update live (timers, money) use `font-variant-numeric:
  tabular-nums` so they don't jitter.
- Money and timer displays are the biggest thing on their card.
- Uppercase micro-labels (`letter-spacing: 0.5px`) label stat tiles, v1-style.

### Spacing, radius, elevation

```css
--space: 0.25rem;            /* 4px base; use multiples: 2/3/4/6/8 */
--radius-sm: 8px;  --radius-md: 12px;  --radius-full: 999px;
--shadow-sm: 0 1px 3px rgba(15,23,42,0.08);
--shadow-md: 0 6px 20px rgba(15,23,42,0.10);   /* floating bars, modals */
```

Cards: `--bg-card`, 1px `--border`, `--radius-md`, `--shadow-sm`, padding
`1rem` office / `1.25rem` field. Status-carrying cards get a 4px left border
in their state color (v1's pattern — keep it).

### Touch targets

- Office screens: minimum 44px.
- **Field screens: minimum 56px**, primary actions 64px+ and full-width,
  anchored to the bottom of the viewport (thumb reach in a mount).
- Destructive or irreversible field actions (finish job, end route) use
  **slide-to-confirm** (port v1's SlideToFinish), never a bare tap.

## 3. Component inventory

Everything below lives in `src/components/ui/` + `globals.css`. Pages compose
these; a page defining its own one-off card style is a review flag.

| Component | Notes |
|---|---|
| `Card` | Optional `status` prop → left border color |
| `StatTile` | Micro-label + big number (+ optional sub-line). Dashboard/History summaries |
| `Pill` | Chip: filters, categories, statuses. Selected = green border + `--green-bg` |
| `DataRow` | Icon + label left, value right — settings, breakdowns |
| `Banner` | Full-width alert (info/warn/error). GPS-lost, overlap warning, unsaved changes |
| `PrimaryBar` | Bottom-anchored full-width action button (field screens) |
| `SlideToConfirm` | Ported from v1 |
| `TabBar` | Bottom navigation (Section 4) |
| `GpsHealthChip` | Section 5 |
| `SectionTitle` | Icon + title + count (v1's pattern, kept) |
| `EmptyState` | Dashed-border card, one sentence, optional CTA |
| `Modal` | One modal shell (v1 has several ad-hoc overlays) — max-height 90vh, internal scroll, sticky action row |
| `UnitField` | Number input + unit suffix (sq ft, days, mph, $) |

## 4. Navigation

**Bottom tab bar**, 5 tabs, always visible except inside modals:

`Home · Route · Clients · Treatments · More`

- Icons + labels, 56px tall, active tab in green.
- `Route` shows a green dot when a route is active; tapping it during an
  active route goes straight to the live screen.
- `More` → History, Analytics, Health Check, Settings.
- v1's top nav is not ported — top of screen is unreachable one-handed in a
  mount.

## 5. Field mode screens

### Live Route

One dominant **state card** fills the top ~half of the screen; its whole
background tints with the state:

| State | Look |
|---|---|
| DRIVING | Slate. Drive timer (hero digits), next stop name + distance below, pause button |
| ARRIVING | Amber. Customer name huge, countdown ring for the 8s debounce ("Starting in 5…"), Cancel underneath |
| ON SITE | Green. Customer name + hero elapsed timer, property-notes line (gate code, dog), pause + notes buttons |
| PROMPT | Driveby / opportunity / resume-after-crash prompts replace the card — never stack on top of it |

Below the state card: the route list (compact rows — name, status dot,
planned services) collapsed behind "Up next: {name} · {n} remaining".
Bottom: `PrimaryBar` with the contextual action (Start next / Slide to
finish / End route).

- **GpsHealthChip** floats top-right at all times during a route: green dot =
  fix < 15s old; amber = degraded accuracy or fix 15–60s; red triggers a
  full-width `Banner` + vibration ("GPS lost — timing may be wrong").
- **Offline**: map tiles gone → the state card and list stand alone
  (they never depended on the map); a slate "offline — tracking still
  running" chip appears.
- Wind advisory chip on spray stops (amber, "12 mph — check drift").

### Day Review

v1's flow, re-skinned with the shared components: one `Card` per visit
(status left-border), tap-`Pill`s for services, price top-right in `--fs-card`
tabular numerals, EPA row with Fill/Edit + Repeat-Last, mileage card (blue),
sticky bottom `PrimaryBar` "Save All & Close". Backup runs on save (spec §10)
with a one-line toast "Saved · snapshot downloaded".

## 6. Office screens

- **Dashboard**: greeting + date; big Start-Route CTA card (or live-route
  resume card when one is active); `StatTile` row (today's revenue, jobs,
  field time); **two due cards** — "Mowing due (N)" green-bordered, and
  "Treatments in window (N)" amber-bordered — each expanding to its top-5
  with a "build route from these" action.
- **Route Builder**: due list top (priority-sorted rows with double-up 🔁
  badges and wind chips), selected stops below with drag handles (≥44px),
  optimize + save actions bottom.
- **Clients**: card grid (search, sort, due badges) with v1's table-view
  toggle. Detail keeps v1's tab structure (Details / Services / Stats /
  Location / Fertilizer) rebuilt from shared components.
- **Treatments**: v1's layout ported (summary tiles, Needs Attention,
  Upcoming-45d, enrollment, skipped) with category-colored chips; adds
  "Build round route" per Needs-Attention group and the season-rollover card.
- **History**: filter pills row, `StatTile` summary (visits / revenue with
  per-service breakdown / job time / job+drive time), day-grouped visit
  cards, calendar toggle. Print view unchanged in spirit (see §8).
- **Analytics**: pricing matrix + curve, profitability list, fuel — charts
  stay minimal: green line/bars on white, slate gridlines, no legends where
  a direct label works.
- **Health Check**: one `Card` per issue class (missing zones, overlapping
  zones, stale prices, no active services, estimated-attribution count),
  each row deep-linking to the fix. Green "all clear" empty state.
- **Settings**: `DataRow` groups; chemical inventory editor; backup/restore;
  error log viewer.

## 7. Motion & feedback

- Fade/slide-in on page mount (~150ms) and nothing else decorative.
- State-card color transitions animate (~300ms) — the one meaningful motion.
- Vibration: geofence enter (double pulse), exit (single), GPS lost (long).
- Toasts: bottom, above the tab bar, 3s, one at a time. Errors persist until
  dismissed.

## 8. Print styles

Two print surfaces, both ported from v1's approach:
- **EPA application record**: the letterhead document (logo, business info,
  bordered sections). It intentionally does NOT use the app's design system —
  it's a formal record. Keep v1's layout with the added temp/wind fields.
- **History service report**: compact per-customer listing (`.print-only`
  pattern).

## 9. CSS architecture

- `globals.css`: tokens (above) + shared classes (`.card`, `.pill`,
  `.stat-tile`, `.banner`, `.input-field`, `.input-label`, `.btn`,
  `.btn-primary`, `.btn-secondary`, `.tab-bar`…).
- Component-specific CSS only for the live state card and charts.
- **No inline style objects** except truly dynamic values (a computed width,
  a state-driven color var). No Tailwind, no CSS-in-JS — plain CSS variables
  + classes, same as moneyracingshop.
- Layout: CSS grid for tile rows (`repeat(auto-fit, minmax(140px, 1fr))`),
  flex for rows. Max content width 1100px centered on desktop; the PWA is
  phone-first and must be flawless at 390px.
