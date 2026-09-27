import { find, get, patchMany, tickets } from '@/lib/fsdb'
import { coerceTicketType, DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

const CLOSED_LIKE_STATUSES = ['resolved', 'closed', 'completed', 'cancel', 'archived', 'pending'] as const

/** NULL / empty / ≤0 sorts to the end of the company support queue (not numbered). */
function sortPriorityKey(p: number | null | undefined): number {
  if (p === null || p === undefined) return Number.MAX_SAFE_INTEGER
  const n = Number(p)
  return !Number.isFinite(n) || n <= 0 ? Number.MAX_SAFE_INTEGER : n
}

/** Normalize rank from request: value ≥ 1 = slot (1 = first); ≤ 0 / empty = append at end. */
export function parseCompanyTicketDesiredRank(raw: unknown): number | 'append' {
  if (raw === undefined || raw === null || raw === '') return 'append'
  const n = Number(raw)
  if (!Number.isFinite(n)) return 'append'
  const floored = Math.floor(n)
  if (floored <= 0) return 'append'
  return floored
}

export type SupportQueueScope =
  | { kind: 'company'; companyId: string }
  | { kind: 'creator'; userId: string }

type QueueRow = { id: number; priority: number | null }

async function loadCompanySupportTicketRows(companyId: string, omitTicketId?: number): Promise<QueueRow[]> {
  const rows = await find(tickets, {
    where: [
      ['companyId', '==', companyId],
      ['ticketType', '==', DEFAULT_TICKET_TYPE],
      ['status', 'not-in', [...CLOSED_LIKE_STATUSES]],
    ],
  })
  return rows.filter((r) => r.id !== omitTicketId).map((r) => ({ id: r.id, priority: r.priority }))
}

async function loadCreatorSupportTicketRows(creatorUserId: string, omitTicketId?: number): Promise<QueueRow[]> {
  const rows = await find(tickets, {
    where: [
      ['companyId', '==', null],
      ['createdBy', '==', creatorUserId],
      ['ticketType', '==', DEFAULT_TICKET_TYPE],
      ['status', 'not-in', [...CLOSED_LIKE_STATUSES]],
    ],
  })
  return rows.filter((r) => r.id !== omitTicketId).map((r) => ({ id: r.id, priority: r.priority }))
}

function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    const da = sortPriorityKey(a.priority)
    const db = sortPriorityKey(b.priority)
    if (da !== db) return da - db
    return a.id - b.id
  })
}

/** Open support ticket belongs to a company queue or a creator-only (no company) queue. */
export async function resolveSupportQueueScope(ticketId: number): Promise<SupportQueueScope | null> {
  const row = await get(tickets, ticketId)
  if (!row) return null
  if (coerceTicketType(row.ticketType) !== DEFAULT_TICKET_TYPE) return null
  if (CLOSED_LIKE_STATUSES.includes(row.status as typeof CLOSED_LIKE_STATUSES[number])) return null
  if (row.companyId) return { kind: 'company', companyId: row.companyId }
  if (row.createdBy) return { kind: 'creator', userId: row.createdBy }
  return null
}

/** Write final order 1..n (only tickets whose priority actually changes are written). */
async function writeOrderedSupportPriorities(orderedIds: number[], current: Map<number, number | null>): Promise<void> {
  if (orderedIds.length === 0) return
  const now = new Date()
  const items = orderedIds
    .map((id, i) => ({ id, priority: i + 1 }))
    .filter(({ id, priority }) => current.get(id) !== priority)
    .map(({ id, priority }) => ({ id, patch: { priority, updatedAt: now } }))
  await patchMany(tickets, items)
}

async function reorder(rows: QueueRow[], nextOrder: number[], extraId?: number): Promise<void> {
  const current = new Map(rows.map((r) => [r.id, r.priority]))
  if (extraId !== undefined && !current.has(extraId)) current.set(extraId, null)
  await writeOrderedSupportPriorities(nextOrder, current)
}

/** Compact support-ticket priorities per company to 1..n (delete/trash/remove from pool). */
export async function compactCompanySupportPriorities(companyId: string, omitTicketId?: number): Promise<void> {
  const rows = await loadCompanySupportTicketRows(companyId, omitTicketId)
  await reorder(rows, sortQueue(rows).map((r) => r.id))
}

/**
 * Compute queue order after placing `ticketId` at `desiredRank` (1-based, 1 = front).
 * Tickets that previously held ranks at or after the insert slot shift one position back (higher rank number).
 */
export function computeSupportQueueOrder(
  orderedIds: number[],
  ticketId: number,
  desiredRank: number | 'append'
): number[] {
  const without = orderedIds.filter((id) => id !== ticketId)
  const maxRank = without.length + 1
  const rank =
    desiredRank === 'append' ? maxRank : Math.min(Math.max(1, desiredRank), maxRank)
  const insertAt = rank - 1
  return [...without.slice(0, insertAt), ticketId, ...without.slice(insertAt)]
}

/**
 * Place one support ticket at `desiredRank` (1-based) within a company;
 * other open support tickets shift back (higher rank) when their slot is taken.
 */
export async function assignCompanySupportTicketRank(
  companyId: string,
  ticketId: number,
  desiredRank: number | 'append'
): Promise<void> {
  const rows = await loadCompanySupportTicketRows(companyId)
  const nextOrder = computeSupportQueueOrder(sortQueue(rows).map((r) => r.id), ticketId, desiredRank)
  if (nextOrder.length === 0) return
  await reorder(rows, nextOrder, ticketId)
}

/** Personal support tickets (no company): queue per creator — same insert/shift rules as company queue. */
export async function assignCreatorSupportTicketRank(
  creatorUserId: string,
  ticketId: number,
  desiredRank: number | 'append'
): Promise<void> {
  const rows = await loadCreatorSupportTicketRows(creatorUserId)
  const nextOrder = computeSupportQueueOrder(sortQueue(rows).map((r) => r.id), ticketId, desiredRank)
  if (nextOrder.length === 0) return
  await reorder(rows, nextOrder, ticketId)
}

export async function compactCreatorSupportPriorities(creatorUserId: string, omitTicketId?: number): Promise<void> {
  const rows = await loadCreatorSupportTicketRows(creatorUserId, omitTicketId)
  await reorder(rows, sortQueue(rows).map((r) => r.id))
}

/** Assign rank with automatic shift; works for company queue and creator-only (customer) tickets. */
export async function assignSupportTicketPriorityRank(
  ticketId: number,
  desiredRank: number | 'append'
): Promise<boolean> {
  const scope = await resolveSupportQueueScope(ticketId)
  if (!scope) return false
  if (scope.kind === 'company') {
    await assignCompanySupportTicketRank(scope.companyId, ticketId, desiredRank)
  } else {
    await assignCreatorSupportTicketRank(scope.userId, ticketId, desiredRank)
  }
  return true
}

export async function compactSupportQueueAfterRemoval(scope: SupportQueueScope, omitTicketId?: number): Promise<void> {
  if (scope.kind === 'company') {
    await compactCompanySupportPriorities(scope.companyId, omitTicketId)
  } else {
    await compactCreatorSupportPriorities(scope.userId, omitTicketId)
  }
}

/** Apply queue rank for an open support ticket (used by API + automation). */
export async function applyCompanySupportPriorityRank(ticketId: number, rawPriority: unknown): Promise<boolean> {
  return assignSupportTicketPriorityRank(ticketId, parseCompanyTicketDesiredRank(rawPriority))
}
