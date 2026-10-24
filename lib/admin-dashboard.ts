/**
 * Admin / staff dashboard data: support-queue KPIs, 14-day ticket trend, top of the priority queue,
 * recent ticket activity and (admin / manager only) this week's billable time.
 * Cached per server process for a short time — the numbers are team-wide, not per user.
 */
import dayjs from 'dayjs'

import {
  companies,
  count,
  find,
  getManyMap,
  jobTypes,
  ticketActivityLog,
  tickets,
  ticketStatuses,
  ticketTimeTracker,
  users,
} from '@/lib/fsdb'
import { ballWithClientSlugs } from '@/lib/ticket-status-defaults'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

const TREND_DAYS = 14
const QUEUE_SIZE = 7
const RECENT_SIZE = 8
const CACHE_TTL_MS = 60_000

export type DashboardTrendPoint = { date: string; label: string; created: number; closed: number }

export type DashboardQueueItem = {
  id: number
  title: string
  priority: number | null
  status: string
  statusTitle: string
  statusColor: string | null
  companyName: string | null
  dueDate: string | null
}

export type DashboardActivityItem = {
  id: string
  ticketId: number | null
  ticketTitle: string | null
  action: string
  actorName: string | null
  actorRole: string
  createdAt: string
}

export type DashboardBilling = {
  billableSeconds: number
  nonBillableSeconds: number
  /** Billable seconds on tickets without an hourly rate. */
  unpricedSeconds: number
  amounts: { currency: string; amount: number }[]
}

export type AdminDashboardData = {
  openCount: number
  waitingCount: number
  newThisWeek: number
  closedThisWeek: number
  trend: DashboardTrendPoint[]
  queue: DashboardQueueItem[]
  recent: DashboardActivityItem[]
  billing: DashboardBilling | null
  generatedAt: string
}

const g = globalThis as typeof globalThis & {
  __adminDashboardCache?: Map<string, { at: number; value: Promise<AdminDashboardData> }>
}

export function getAdminDashboardData(opts: { includeBilling: boolean }): Promise<AdminDashboardData> {
  const key = opts.includeBilling ? 'billing' : 'plain'
  const cache = (g.__adminDashboardCache ??= new Map())
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = loadAdminDashboardData(opts.includeBilling)
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key))
  return value
}

async function loadAdminDashboardData(includeBilling: boolean): Promise<AdminDashboardData> {
  const now = dayjs()
  const trendStart = now.subtract(TREND_DAYS - 1, 'day').startOf('day')
  const weekStart = now.startOf('day').subtract((now.day() + 6) % 7, 'day') // Monday

  const statusRows = await find(ticketStatuses)
  const statusBySlug = new Map(statusRows.map((s) => [s.slug, s]))
  // Statuses where the ball is in the client's court (Settings -> Ticket statuses)
  const WAITING_STATUSES = ballWithClientSlugs(statusRows)
  const activeSlugs = statusRows
    .filter((s) => s.isActive !== false && !isClosedLikeTicketStatus(s.slug) && !WAITING_STATUSES.includes(s.slug))
    .map((s) => s.slug)
  const closedSlugs = statusRows.filter((s) => isClosedLikeTicketStatus(s.slug)).map((s) => s.slug)

  const [openCount, waitingCount, createdRows, closedRows, queueRows, recentRows, billing] = await Promise.all([
    activeSlugs.length
      ? count(tickets, [
          ['ticketType', '==', 'support'],
          ['status', 'in', activeSlugs.slice(0, 30)],
        ])
      : Promise.resolve(0),
    count(tickets, [
      ['ticketType', '==', 'support'],
      ['status', 'in', WAITING_STATUSES],
    ]),
    find(tickets, { where: [['createdAt', '>=', trendStart.toDate()]], select: ['id', 'createdAt', 'ticketType'] }),
    closedSlugs.length
      ? find(tickets, {
          where: [
            ['status', 'in', closedSlugs.slice(0, 30)],
            ['updatedAt', '>=', trendStart.toDate()],
          ],
          select: ['id', 'updatedAt', 'ticketType'],
        })
      : Promise.resolve([]),
    find(tickets, {
      where: [
        ['ticketType', '==', 'support'],
        ['priority', 'in', [1, 2, 3]],
      ],
      select: ['id', 'title', 'priority', 'status', 'companyId', 'dueDate', 'updatedAt'],
    }),
    find(ticketActivityLog, { orderBy: [['createdAt', 'desc']], limit: RECENT_SIZE }),
    includeBilling ? loadWeekBilling(weekStart.toDate()) : Promise.resolve(null),
  ])

  const created = createdRows.filter((t) => t.ticketType === 'support')
  const closed = closedRows.filter((t) => t.ticketType === 'support')
  const trend: DashboardTrendPoint[] = []
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = trendStart.add(i, 'day')
    const inDay = (v: Date | null | undefined) => !!v && dayjs(v).isSame(d, 'day')
    trend.push({
      date: d.format('YYYY-MM-DD'),
      label: d.format('D MMM'),
      created: created.filter((t) => inDay(t.createdAt)).length,
      closed: closed.filter((t) => inDay(t.updatedAt)).length,
    })
  }

  const queueTop = queueRows
    .filter((t) => !isClosedLikeTicketStatus(t.status))
    .sort(
      (a, b) =>
        (a.priority ?? 99) - (b.priority ?? 99) ||
        (a.dueDate ? a.dueDate.getTime() : Infinity) - (b.dueDate ? b.dueDate.getTime() : Infinity) ||
        a.id - b.id
    )
    .slice(0, QUEUE_SIZE)

  const recentTicketIds = [...new Set(recentRows.map((r) => r.ticketId).filter((x): x is number => x != null))]
  const actorIds = [...new Set(recentRows.map((r) => r.actorUserId).filter((x): x is string => !!x))]
  const companyIds = [...new Set(queueTop.map((t) => t.companyId).filter((x): x is string => !!x))]
  const [companyMap, recentTickets, actorMap] = await Promise.all([
    getManyMap(companies, companyIds),
    getManyMap(tickets, recentTicketIds),
    getManyMap(users, actorIds),
  ])

  return {
    openCount,
    waitingCount,
    newThisWeek: created.filter((t) => !dayjs(t.createdAt).isBefore(weekStart)).length,
    closedThisWeek: closed.filter((t) => !dayjs(t.updatedAt).isBefore(weekStart)).length,
    trend,
    queue: queueTop.map((t) => {
      const st = statusBySlug.get(t.status)
      return {
        id: t.id,
        title: t.title,
        priority: t.priority ?? null,
        status: t.status,
        statusTitle: st?.title ?? t.status,
        statusColor: st?.color ?? null,
        companyName: t.companyId ? companyMap.get(t.companyId)?.name ?? null : null,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      }
    }),
    recent: recentRows.map((r) => {
      const actor = r.actorUserId ? actorMap.get(r.actorUserId) : undefined
      return {
        id: r.id,
        ticketId: r.ticketId,
        ticketTitle: r.ticketId != null ? recentTickets.get(String(r.ticketId))?.title ?? null : null,
        action: r.action,
        actorName: actor ? actor.fullName || actor.email : null,
        actorRole: r.actorRole,
        createdAt: r.createdAt.toISOString(),
      }
    }),
    billing,
    generatedAt: now.toISOString(),
  }
}

/** Completed time entries since `from`: billable vs non-billable seconds and billed amount per currency. */
async function loadWeekBilling(from: Date): Promise<DashboardBilling> {
  const [sessions, jobTypeRows] = await Promise.all([
    find(ticketTimeTracker, {
      where: [['startTime', '>=', from]],
      select: ['id', 'ticketId', 'jobType', 'stopTime', 'durationSeconds', 'durationAdjustment'],
    }),
    find(jobTypes),
  ])
  const billableJob = new Map(jobTypeRows.map((j) => [j.slug, j.billable !== false]))
  const done = sessions.filter((s) => s.stopTime != null)
  const ticketMap = await getManyMap(tickets, [...new Set(done.map((s) => s.ticketId))])

  let billableSeconds = 0
  let nonBillableSeconds = 0
  let unpricedSeconds = 0
  const amounts = new Map<string, number>()
  for (const s of done) {
    const secs = reportedDurationSeconds(s)
    if (!s.jobType || !billableJob.get(s.jobType)) {
      nonBillableSeconds += secs
      continue
    }
    billableSeconds += secs
    const t = ticketMap.get(String(s.ticketId))
    if (t?.fixedPrice != null) continue // priced as a whole, not per hour
    if (t?.hourlyRate == null) {
      unpricedSeconds += secs
      continue
    }
    const cur = t.rateCurrency ?? 'IDR'
    amounts.set(cur, (amounts.get(cur) ?? 0) + (secs / 3600) * t.hourlyRate)
  }
  return {
    billableSeconds,
    nonBillableSeconds,
    unpricedSeconds,
    amounts: [...amounts.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
  }
}
