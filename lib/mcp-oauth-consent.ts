/** Which permissions a person may approve for an AI connector, by role (the same limits the endpoints enforce anyway; this keeps the consent page honest). */
import { API_KEY_SCOPES, type ApiKeyScope } from './api-key-core.ts'

const STAFF = ['admin', 'manager']

export function allowedScopesFor(role: string | null | undefined): ApiKeyScope[] {
  const r = (role ?? '').toLowerCase()
  const internal = !!r && r !== 'customer'
  return API_KEY_SCOPES.filter((s) => {
    if (s === 'team:read') return STAFF.includes(r)
    if (s === 'tickets:update') return internal
    return true
  })
}

/** Ticked when the page opens: what only reads. Anything that changes data the person has to tick themselves. */
export const DEFAULT_CONSENT_SCOPES: ApiKeyScope[] = ['tickets:read', 'calendar:read', 'team:read']
