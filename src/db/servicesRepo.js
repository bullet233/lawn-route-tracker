// Services catalog (SPEC §3 — the single catalog; category + requiresComplianceLog
// live here once, no name regex at runtime). Seeded with a sensible default set
// on first run so routes/visits have line items to reference.

import { db } from './index.js'
import { newId } from './ids.js'

export const DEFAULT_SERVICES = [
  { name: 'Mow', category: 'mowing', defaultPriceCents: 4000, requiresComplianceLog: false },
  { name: 'Fertilizer Round', category: 'fertilizer', defaultPriceCents: 6000, requiresComplianceLog: true },
  { name: 'Weed Control', category: 'fertilizer', defaultPriceCents: 5500, requiresComplianceLog: true },
  { name: 'Leaf Cleanup', category: 'cleanup', defaultPriceCents: 8000, requiresComplianceLog: false },
]

export function makeService(input, sortOrder = 0) {
  return {
    id: input.id || newId(),
    name: input.name,
    category: input.category || 'other',
    defaultPriceCents: input.defaultPriceCents ?? 0,
    requiresComplianceLog: !!input.requiresComplianceLog,
    active: input.active !== false,
    sortOrder: input.sortOrder ?? sortOrder,
  }
}

/** Seed defaults if the catalog is empty. Idempotent — safe to call on boot. */
export async function seedServicesIfEmpty() {
  const count = await db.services.count()
  if (count > 0) return false
  await db.services.bulkAdd(DEFAULT_SERVICES.map((s, i) => makeService(s, i)))
  return true
}

export function allServices() {
  return db.services.orderBy('sortOrder').toArray()
}

export function activeServices() {
  return db.services.filter((s) => s.active).toArray()
}

/**
 * Resolve the effective price for a customer + service, honoring the customer's
 * serviceOverrides delta (SPEC §3). Returns integer cents.
 */
export function resolvePriceCents(service, customer) {
  const override = customer?.serviceOverrides?.[service.id]
  if (override && override.priceCents != null) return override.priceCents
  return service.defaultPriceCents
}

/**
 * Billing resolution when a treatment step completes (SPEC §3): the step's
 * billingServiceId if set; else the customer's single active fertilizer
 * service; else null (caller must ask). Pure over the provided services.
 */
export function resolveBillingService(services, step, customer) {
  const active = (services || []).filter((s) => s.active)
  if (step?.billingServiceId) {
    const s = active.find((x) => x.id === step.billingServiceId)
    if (s) return s
  }
  const fert = active.filter((s) => s.category === 'fertilizer')
  // honor customer service overrides that deactivate a service
  const enabled = fert.filter((s) => customer?.serviceOverrides?.[s.id]?.active !== false)
  return enabled.length === 1 ? enabled[0] : null
}
