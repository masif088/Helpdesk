/**
 * Rated tickets of one month, newest rating first, a page at a time (Reports → Ratings).
 * One range query on csatAt (no composite index needed) plus a count, so a page costs about its own size in reads.
 */
import dayjs from 'dayjs'

import { companies, count, find, getManyMap, ticketAssignees, tickets, users } from '@/lib/fsdb'

export const RATINGS_PAGE_SIZE = 20

export type RatedTicket = { ticketId: number; title: string; company: string | null; agents: string[]; rating: number; comment: string | null; at: string }

export type RatingsPage = { month: string; page: number; pageSize: number; total: number; items: RatedTicket[] }

/** `month` is YYYY-MM; anything else means the current month. */
export const normalizeMonth = (v: string | null | undefined) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : dayjs().format('YYYY-MM'))

export async function getRatingsPage(monthInput: string | null | undefined, pageInput: number): Promise<RatingsPage> {
  const month = normalizeMonth(monthInput)
  const page = Number.isFinite(pageInput) && pageInput >= 1 ? Math.floor(pageInput) : 1
  const start = dayjs(`${month}-01`).startOf('month').toDate()
  const end = dayjs(`${month}-01`).endOf('month').toDate()
  const where = [['csatAt', '>=', start], ['csatAt', '<=', end]] as const

  const [total, rows] = await Promise.all([
    count(tickets, where),
    find(tickets, { where, orderBy: [['csatAt', 'desc']], limit: RATINGS_PAGE_SIZE, offset: (page - 1) * RATINGS_PAGE_SIZE }),
  ])
  const ids = rows.map((t) => t.id)
  const [companyMap, assigneeRows] = await Promise.all([
    getManyMap(companies, [...new Set(rows.map((t) => t.companyId).filter((id): id is string => !!id))]),
    ids.length ? find(ticketAssignees, { where: [['ticketId', 'in', ids]], select: ['ticketId', 'userId'] }) : Promise.resolve([]),
  ])
  const people = await getManyMap(users, [...new Set(assigneeRows.map((a) => a.userId))])
  const agentsOf = (ticketId: number) => assigneeRows.filter((a) => a.ticketId === ticketId).map((a) => people.get(a.userId)?.fullName || people.get(a.userId)?.email || 'Unknown')

  return {
    month,
    page,
    pageSize: RATINGS_PAGE_SIZE,
    total,
    items: rows
      .filter((t) => t.csatRating)
      .map((t) => ({
        ticketId: t.id,
        title: t.title,
        company: t.companyId ? (companyMap.get(t.companyId)?.name ?? null) : null,
        agents: agentsOf(t.id),
        rating: t.csatRating!,
        comment: t.csatComment ?? null,
        at: new Date(t.csatAt!).toISOString(),
      })),
  }
}
