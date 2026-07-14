// Compliance logs (EPA records — SPEC §3). One log per visit; products[] lists
// everything applied. Repeat-Last copies the previous log wholesale (SPEC §9).

import { db } from './index.js'
import { newId } from './ids.js'
import { businessDate } from '../utils/dates.js'

export function logForVisit(visitId) {
  return db.complianceLogs.where('visitId').equals(visitId).first()
}

/** A customer's EPA logs (uses the customerId index — no table scan). */
export function logsForCustomer(customerId) {
  return db.complianceLogs.where('customerId').equals(customerId).toArray()
}

/** Most recent compliance log (for Repeat-Last fast path). */
export async function lastComplianceLog() {
  const all = await db.complianceLogs.orderBy('businessDate').toArray()
  return all.length ? all[all.length - 1] : null
}

export function makeComplianceLog(visitId, customerId, input = {}, now = Date.now()) {
  return {
    id: input.id || newId(),
    visitId,
    customerId,
    businessDate: input.businessDate || businessDate(now),
    applicatorName: input.applicatorName || '',
    licenseNumber: input.licenseNumber || '',
    businessPhone: input.businessPhone || '',
    mixSite: input.mixSite || '',
    areaTreatedSqFt: input.areaTreatedSqFt ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    tempF: input.tempF ?? null,
    windMph: input.windMph ?? null,
    products: input.products || [],
  }
}

export function makeProduct(input = {}) {
  return {
    productName: input.productName || '',
    epaRegNum: input.epaRegNum || '',
    category: input.category || 'fertilizer',
    targetSite: input.targetSite || '',
    applicationRate: input.applicationRate || '',
    isSpotTreatment: !!input.isSpotTreatment,
    spotAreaSqFt: input.spotAreaSqFt ?? null,
    spotLocation: input.spotLocation || '',
    customerNotices: input.customerNotices || [],
  }
}

/** Upsert the single log for a visit. */
export async function saveComplianceLog(record) {
  const existing = await logForVisit(record.visitId)
  if (existing) {
    await db.complianceLogs.update(existing.id, { ...record, id: existing.id })
    return existing.id
  }
  await db.complianceLogs.add(record)
  return record.id
}

/** Applicator defaults live in settings (one export captures the business). */
export async function getApplicatorSettings() {
  const row = await db.settings.get('applicator')
  return row?.value || {}
}
