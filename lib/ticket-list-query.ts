/**
 * Ticket list candidate loading for Firestore.
 *
 * Firestore cannot OR across fields, ILIKE, or use sub-queries, so the list endpoint:
 *  1. loads a candidate set with ONE indexed query (ticket_type + the most selective `in` filter),
 *     or — when searching — the union of keyword `array-contains` queries on title / description / comments;
 *  2. applies every remaining filter, sorts and paginates in memory.
 */
import {
  bestToken,
  type Cond,
  find,
  getMany,
  matchesAllTokens,
  queryTokens,
  searchTokens,
  stripHtml,
  ticketComments,
  tickets,
  type TicketsRow,
} from '@/lib/fsdb'

/** Fields needed to filter / sort / check access (everything but large text + keyword arrays). */
export const TICKET_LIST_FIELDS: (keyof TicketsRow & string)[] = [
  'id',
  'title',
  'status',
  'teamId',
  'typeId',
  'ticketType',
  'priority',
  'companyId',
  'createdBy',
  'contactUserId',
  'dueDate',
  'requiredSkills',
  'createdAt',
  'updatedAt',
  'projectId',
]

export type TicketCandidateFilter = {
  ticketType: string
  companyIds?: string[]
  statusSlugs?: string[]
  teamIds?: string[]
  typeIds?: number[]
}

/** One Firestore query: ticket_type == X plus the single most selective `in` list (others filtered later). */
export async function loadTicketCandidates(f: TicketCandidateFilter): Promise<TicketsRow[]> {
  const where: Cond<TicketsRow>[] = [['ticketType', '==', f.ticketType]]
  if (f.companyIds?.length) where.push(['companyId', 'in', f.companyIds])
  else if (f.teamIds?.length) where.push(['teamId', 'in', f.teamIds])
  else if (f.typeIds?.length) where.push(['typeId', 'in', f.typeIds])
  else if (f.statusSlugs?.length) where.push(['status', 'in', f.statusSlugs])
  return find(tickets, { where, select: TICKET_LIST_FIELDS })
}

export type TicketSearchFields = { title: boolean; description: boolean; comments: boolean }

/**
 * Tickets whose title / description / comments contain every word (or word prefix) of `search`.
 * `searchAsId` also matches the ticket with that id. Returns full rows.
 */
export async function searchTickets(
  search: string,
  fields: TicketSearchFields,
  searchAsId: number | null
): Promise<TicketsRow[]> {
  const tokens = queryTokens(search)
  const best = bestToken(tokens)
  const ids = new Set<number>()
  const found = new Map<number, TicketsRow>()

  if (searchAsId !== null) {
    const byId = await getMany(tickets, [searchAsId])
    for (const t of byId) found.set(t.id, t)
  }
  if (!best) return [...found.values()]

  const jobs: Promise<void>[] = []
  if (fields.title) {
    jobs.push(
      find(tickets, { where: [['kwTitle', 'array-contains', best]] }).then((rows) => {
        for (const t of rows) {
          if (matchesAllTokens(searchTokens(t.title, String(t.id)), tokens)) found.set(t.id, t)
        }
      })
    )
  }
  if (fields.description) {
    jobs.push(
      find(tickets, { where: [['kwDescription', 'array-contains', best]] }).then((rows) => {
        for (const t of rows) {
          if (matchesAllTokens(searchTokens(stripHtml(t.description)), tokens)) found.set(t.id, t)
        }
      })
    )
  }
  if (fields.comments) {
    jobs.push(
      find(ticketComments, { where: [['kwComment', 'array-contains', best]] }).then((rows) => {
        for (const c of rows) {
          if (matchesAllTokens(searchTokens(stripHtml(c.comment)), tokens)) ids.add(c.ticketId)
        }
      })
    )
  }
  await Promise.all(jobs)

  const missing = [...ids].filter((id) => !found.has(id))
  for (const t of await getMany(tickets, missing)) found.set(t.id, t)
  return [...found.values()]
}

/** Default list order: company asc, priority asc (NULLs last), id asc/desc. Or id only. */
export function sortTicketList(rows: TicketsRow[], sortById: boolean, dir: 'asc' | 'desc'): TicketsRow[] {
  const idCmp = (a: TicketsRow, b: TicketsRow) => (dir === 'asc' ? a.id - b.id : b.id - a.id)
  if (sortById) return [...rows].sort(idCmp)
  const nullsLast = <T,>(a: T | null, b: T | null, cmp: (x: T, y: T) => number) =>
    a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b)
  return [...rows].sort(
    (a, b) =>
      nullsLast(a.companyId, b.companyId, (x, y) => (x < y ? -1 : x > y ? 1 : 0)) ||
      nullsLast(a.priority, b.priority, (x, y) => x - y) ||
      idCmp(a, b)
  )
}
