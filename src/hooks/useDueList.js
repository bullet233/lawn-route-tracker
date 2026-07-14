// useDueList — wires the two Phase-1 cadence engines to live table data and
// returns the merged, sorted due list + double-up set (SPEC §7).
//
// NOTE: visits/treatments are read in full here for the due computation. That
// is fine at current scale; when the archive grows, narrow to recent ranges by
// index (SPEC §3 "query by index"). Flagged intentionally.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/index.js'
import { allCustomers } from '../db/customersRepo.js'
import { buildDueList, doubleUpCustomerIds } from '../engine/dueList.js'
import {
  computeLastMowByCustomer,
  indexById,
  mowingEligibleCustomers,
} from '../utils/dueSelectors.js'

export function useDueList(today) {
  const customers = useLiveQuery(() => allCustomers(), [], null)
  const visits = useLiveQuery(() => db.visits.toArray(), [], null)
  const treatments = useLiveQuery(() => db.treatments.toArray(), [], null)

  const loading = customers === null || visits === null || treatments === null
  if (loading) {
    return { loading: true, due: [], mowingDue: [], treatmentDue: [], doubleUps: new Set(), customersById: {} }
  }

  const customersById = indexById(customers)
  const lastMowByCustomerId = computeLastMowByCustomer(visits)
  const due = buildDueList({
    customers: mowingEligibleCustomers(customers),
    lastMowByCustomerId,
    treatments,
    customersById,
    today,
  })
  return {
    loading: false,
    due,
    mowingDue: due.filter((d) => d.engine === 'mowing'),
    treatmentDue: due.filter((d) => d.engine === 'treatment'),
    doubleUps: doubleUpCustomerIds(due),
    customersById,
  }
}
