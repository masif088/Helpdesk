/**
 * What an API key with the permission `tickets:update` may change on a ticket, and nothing else: its status, who is assigned,
 * and the due date. Pure checks of the request body (no database); the checks that need the database (does the status exist,
 * are these people on the team) are in `lib/ticket-key-update.ts`.
 */

export const KEY_UPDATE_FIELDS = ['status', 'assignees', 'add_assignees', 'remove_assignees', 'due_date'] as const
const MAX_PEOPLE = 20

export type KeyTicketPatch = {
  status?: string
  /** The whole list of people assigned (replaces the current one) */
  assignees?: string[]
  addAssignees?: string[]
  removeAssignees?: string[]
  /** null clears it */
  dueDate?: string | null
}

export type KeyPatchResult = { ok: true; patch: KeyTicketPatch } | { ok: false; error: string }

const ids = (v: unknown, name: string): string[] | string => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) return `${name} must be a list of user ids`
  const list = [...new Set(v.map((x) => String(x).trim()))]
  return list.length > MAX_PEOPLE ? `At most ${MAX_PEOPLE} people in ${name}` : list
}

export function parseKeyTicketPatch(body: unknown): KeyPatchResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Send a JSON body' }
  const b = body as Record<string, unknown>
  const keys = Object.keys(b)
  if (keys.length === 0) return { ok: false, error: `Send at least one of: ${KEY_UPDATE_FIELDS.join(', ')}` }
  const other = keys.filter((k) => !(KEY_UPDATE_FIELDS as readonly string[]).includes(k))
  if (other.length) return { ok: false, error: `A key may only change: ${KEY_UPDATE_FIELDS.join(', ')} (not ${other.join(', ')})` }
  if (b.assignees !== undefined && (b.add_assignees !== undefined || b.remove_assignees !== undefined)) return { ok: false, error: 'Use assignees (the whole list) or add_assignees / remove_assignees, not both' }

  const patch: KeyTicketPatch = {}
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || !b.status.trim()) return { ok: false, error: 'status must be a status slug (see GET /api/tickets/lookup)' }
    patch.status = b.status.trim()
  }
  for (const [field, target] of [['assignees', 'assignees'], ['add_assignees', 'addAssignees'], ['remove_assignees', 'removeAssignees']] as const) {
    if (b[field] === undefined) continue
    const r = ids(b[field], field)
    if (typeof r === 'string') return { ok: false, error: r }
    patch[target] = r
  }
  if (b.due_date !== undefined) {
    if (b.due_date === null || b.due_date === '') patch.dueDate = null
    else if (typeof b.due_date === 'string' && !Number.isNaN(new Date(b.due_date).getTime())) patch.dueDate = b.due_date
    else return { ok: false, error: 'due_date must be a date (YYYY-MM-DD), or null to clear it' }
  }
  return { ok: true, patch }
}

/** The assignee list after adding and removing people (order kept, no duplicates). */
export function mergeAssignees(current: string[], patch: Pick<KeyTicketPatch, 'assignees' | 'addAssignees' | 'removeAssignees'>): string[] {
  if (patch.assignees) return patch.assignees
  const remove = new Set(patch.removeAssignees ?? [])
  return [...new Set([...current, ...(patch.addAssignees ?? [])])].filter((u) => !remove.has(u))
}

/** The body the ticket PATCH route understands, from a checked patch and the current assignees. */
export function toPatchBody(patch: KeyTicketPatch, currentAssignees: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (patch.status !== undefined) body.status = patch.status
  if (patch.assignees || patch.addAssignees || patch.removeAssignees) body.assignees = mergeAssignees(currentAssignees, patch)
  if (patch.dueDate !== undefined) body.due_date = patch.dueDate
  return body
}
