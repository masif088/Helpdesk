import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { loadCustomerAccessibleTickets } from '@/lib/customer-ticket-access'
import {
  find,
  getManyMap,
  sortRows,
  tags,
  ticketComments,
  ticketStatuses,
  ticketTags,
  ticketTimeTracker,
  ticketTypes,
  users,
} from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

type TimePeriod = 'current-day' | 'week' | 'all'

function parseTimePeriod(raw: string | null): TimePeriod {
  if (raw === 'week' || raw === 'all' || raw === 'current-day') return raw
  return 'current-day'
}

function timePeriodStart(period: TimePeriod): Date | null {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'current-day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  // This week: Monday 00:00 local
  const day = now.getDay() // 0 Sun .. 6 Sat
  const daysFromMonday = day === 0 ? 6 : day - 1
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday)
}

/** GET /api/customer/dashboard - Stats for customer dashboard. */
export async function GET(request: Request) {
  const session = await auth()
  const { searchParams } = new URL(request.url)
  const debug = searchParams.get('debug') === '1'
  const timePeriod = parseTimePeriod(searchParams.get('time_period'))
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const companyId = await getCustomerCompanyId(userId)

  // Support tickets: company + personal (no company); exclude spam/trash
  const myTickets = (await loadCustomerAccessibleTickets(userId, companyId)).filter(
    (t) => t.ticketType === DEFAULT_TICKET_TYPE
  )

  const typeIds = [...new Set(myTickets.map((t) => t.typeId).filter(Boolean))] as number[]
  const typeMap: Record<number, { title: string; color: string }> = {}
  if (typeIds.length > 0) {
    const types = await getManyMap(ticketTypes, typeIds)
    types.forEach((t) => { typeMap[t.id] = { title: t.title, color: t.color ?? '#1890ff' } })
  }
  const typeCounts: Record<string | number, { type_title: string; type_id: number | null; count: number; color: string }> = {}
  myTickets.forEach((t) => {
    const key = t.typeId ?? 'none'
    const label = t.typeId ? (typeMap[t.typeId]?.title ?? 'Unknown') : 'No Type'
    const color = t.typeId ? (typeMap[t.typeId]?.color ?? '#1890ff') : '#d9d9d9'
    if (!typeCounts[key]) typeCounts[key] = { type_title: label, type_id: t.typeId ?? null, count: 0, color }
    typeCounts[key].count += 1
  })
  const ticketsByType = Object.values(typeCounts)

  const pCounts: Record<number, number> = {}
  myTickets.forEach((t) => {
    const v = Number(t.priority ?? 0)
    pCounts[v] = (pCounts[v] ?? 0) + 1
  })
  const priorityCounts = Object.entries(pCounts)
    .map(([k, count]) => ({ priority: Number(k), count }))
    .sort((a, b) => a.priority - b.priority)

  const myTicketIds = myTickets.map((t) => t.id)
  const timeByType: Array<{ type_title: string; seconds: number; color: string }> = []
  let totalTimeSeconds = 0
  if (myTicketIds.length > 0) {
    const periodStart = timePeriodStart(timePeriod)
    const trackerRows = await find(ticketTimeTracker, {
      where: [['ticketId', 'in', myTicketIds], periodStart && ['startTime', '>=', periodStart]],
    })
    const ticketToType: Record<number, number | null> = {}
    myTickets.forEach((t) => { ticketToType[t.id] = t.typeId })
    const secondsByType: Record<number | string, number> = {}
    trackerRows.forEach((r) => {
      const dur = r.durationSeconds ?? 0
      totalTimeSeconds += dur
      const tid = ticketToType[r.ticketId] ?? 'none'
      secondsByType[tid] = (secondsByType[tid] ?? 0) + dur
    })
    Object.entries(secondsByType).forEach(([tid, sec]) => {
      const typeId = tid === 'none' ? null : parseInt(tid, 10)
      timeByType.push({ type_title: typeId ? (typeMap[typeId]?.title ?? 'Unknown') : 'No Type', seconds: sec, color: typeId ? (typeMap[typeId]?.color ?? '#1890ff') : '#d9d9d9' })
    })
  }

  const statusRows = await find(ticketStatuses, { orderBy: [['sortOrder', 'asc']] })
  const sCounts: Record<string, number> = {}
  myTickets.forEach((t) => { sCounts[t.status ?? 'unknown'] = (sCounts[t.status ?? 'unknown'] ?? 0) + 1 })
  const statusCounts = statusRows.map((s) => ({
    status_slug: s.slug,
    status_title: s.customerTitle ?? s.title,
    count: sCounts[s.slug] ?? 0,
    color: s.color ?? '#000',
  }))

  const sortedForRecent = [...myTickets].sort((a, b) => {
    const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const db2 = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return db2 - da
  })
  const recentIds = sortedForRecent.slice(0, 5).map((t) => t.id)
  let recentTickets: Array<{
    id: number
    title: string
    due_date: string | null
    updated_at: string
    status_slug: string
    status_title: string
    customer_title: string
    status_color: string
    priority: number | null
    creator_name: string | null
    tags: Array<{ id: string; name: string; color: string | null }>
  }> = []

  if (recentIds.length > 0) {
    const recentTicketRows = sortedForRecent.slice(0, 5)
    const statusBySlug = new Map(statusRows.map((s) => [s.slug, s]))
    const creatorById = await getManyMap(users, recentTicketRows.map((t) => t.createdBy))
    const rows = recentTicketRows.map((ticket) => {
      const creator = ticket.createdBy ? creatorById.get(ticket.createdBy) : undefined
      return {
        ticket,
        statusRow: statusBySlug.get(ticket.status) ?? null,
        creatorFullName: creator?.fullName ?? null,
        creatorEmail: creator?.email ?? null,
      }
    })

    const tagLinks = await find(ticketTags, { where: [['ticketId', 'in', recentIds]] })
    const tagById = await getManyMap(tags, tagLinks.map((l) => l.tagId))
    const tagRows = tagLinks.map((l) => ({ ticketId: l.ticketId, tag: tagById.get(l.tagId) ?? null }))
    const tagsByTicketId: Record<number, Array<{ id: string; name: string; color: string | null }>> = {}
    tagRows.forEach((row) => {
      if (!row.tag) return
      if (!tagsByTicketId[row.ticketId]) tagsByTicketId[row.ticketId] = []
      tagsByTicketId[row.ticketId].push({ id: row.tag.id, name: row.tag.name, color: row.tag.color })
    })

    const timeRows = await find(ticketTimeTracker, { where: [['ticketId', 'in', recentIds]] })
    const timeByTicketId: Record<number, number> = {}
    timeRows.forEach((r) => { timeByTicketId[r.ticketId] = (timeByTicketId[r.ticketId] ?? 0) + (r.durationSeconds ?? 0) })

    const orderMap: Record<number, number> = {}
    recentIds.forEach((id, i) => { orderMap[id] = i })
    recentTickets = rows.map((r) => ({
      id: r.ticket.id,
      title: r.ticket.title,
      due_date: r.ticket.dueDate ? new Date(r.ticket.dueDate).toISOString() : null,
      updated_at: r.ticket.updatedAt ? new Date(r.ticket.updatedAt).toISOString() : '',
      status_slug: r.ticket.status,
      status_title: r.statusRow?.customerTitle ?? r.statusRow?.title ?? r.ticket.status,
      customer_title: r.statusRow?.customerTitle ?? 'Unknown',
      status_color: r.statusRow?.color ?? '#000',
      priority: r.ticket.priority != null ? Number(r.ticket.priority) : null,
      creator_name: r.creatorFullName || r.creatorEmail || null,
      tags: tagsByTicketId[r.ticket.id] ?? [],
      total_time_seconds: timeByTicketId[r.ticket.id] ?? 0,
    })).sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999))
  }

  const ticketsWithDue = myTickets.filter((t) => t.dueDate != null)
  let lastDueDate: string | null = null
  let lastDueTicket: { id: number; title: string } | null = null
  if (ticketsWithDue.length > 0) {
    const minDueTime = Math.min(...ticketsWithDue.map((t) => new Date(t.dueDate!).getTime()))
    const atMinDue = ticketsWithDue.filter((t) => new Date(t.dueDate!).getTime() === minDueTime)
    const t0 = [...atMinDue].sort((a, b) => a.id - b.id)[0]
    if (t0) {
      lastDueDate = t0.dueDate ? new Date(t0.dueDate).toISOString() : null
      lastDueTicket = { id: t0.id, title: t0.title ?? 'Untitled' }
    }
  }

  // ── Monthly summary ─────────────────────────────────────────────
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const completedStatuses = ['resolved', 'closed', 'completed']
  const thisMonthCompleted = myTickets.filter(
    (t) => completedStatuses.includes(t.status ?? '') && t.updatedAt && new Date(t.updatedAt) >= startOfThisMonth
  ).length
  const lastMonthCompleted = myTickets.filter(
    (t) => completedStatuses.includes(t.status ?? '') && t.updatedAt &&
      new Date(t.updatedAt) >= startOfLastMonth && new Date(t.updatedAt) < startOfThisMonth
  ).length

  let monthTimeSeconds = 0
  if (myTicketIds.length > 0) {
    const monthRows = await find(ticketTimeTracker, {
      where: [
        ['ticketId', 'in', myTicketIds],
        ['startTime', '>=', startOfThisMonth],
      ],
    })
    monthTimeSeconds = monthRows.reduce((s, r) => s + (r.durationSeconds ?? 0), 0)
  }

  // ── Tickets awaiting customer response ───────────────────────────
  const awaitingSlugs = ['question', 'client_review']
  const awaitingTickets = myTickets
    .filter((t) => awaitingSlugs.includes(t.status ?? ''))
    .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())
    .slice(0, 5)
    .map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '' }))

  // ── Recent team updates (agent comments on customer tickets) ─────
  type RecentUpdate = { ticket_id: number; ticket_title: string; comment: string; author_name: string | null; created_at: string }
  let recentTeamUpdates: RecentUpdate[] = []
  if (myTicketIds.length > 0) {
    const agentComments = await find(ticketComments, {
      where: [
        ['ticketId', 'in', myTicketIds],
        ['authorType', '==', 'agent'],
      ],
    })
    const latest = sortRows(
      agentComments.filter((c) => c.visibility === 'reply' || c.visibility === 'public'),
      [['createdAt', 'desc']]
    ).slice(0, 5)
    const authorById = await getManyMap(users, latest.map((c) => c.userId))
    const commentRows = latest.map((c) => ({
      ticketId: c.ticketId,
      comment: c.comment,
      createdAt: c.createdAt,
      authorFullName: authorById.get(c.userId)?.fullName ?? null,
      authorEmail: authorById.get(c.userId)?.email ?? null,
    }))

    const titleMap: Record<number, string> = {}
    myTickets.forEach((t) => { titleMap[t.id] = t.title })
    recentTeamUpdates = commentRows.map((r) => {
      const plain = r.comment.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      return {
        ticket_id: r.ticketId,
        ticket_title: titleMap[r.ticketId] ?? `Ticket #${r.ticketId}`,
        comment: plain.length > 120 ? plain.slice(0, 120) + '…' : plain,
        author_name: r.authorFullName || r.authorEmail || 'Team',
        created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      }
    })
  }

  const payload: Record<string, unknown> = {
    company_id: companyId,
    my_tickets_count: myTickets.length,
    tickets_by_type: ticketsByType,
    priority_counts: priorityCounts,
    time_by_type: timeByType,
    total_time_seconds: totalTimeSeconds,
    status_counts: statusCounts,
    recent_tickets: recentTickets,
    last_due_date: lastDueDate,
    last_due_ticket: lastDueTicket,
    monthly_summary: {
      this_month_completed: thisMonthCompleted,
      last_month_completed: lastMonthCompleted,
      this_month_time_seconds: monthTimeSeconds,
    },
    awaiting_response: awaitingTickets,
    recent_team_updates: recentTeamUpdates,
  }

  if (debug) {
    payload._debug = {
      tickets_with_due_count: ticketsWithDue.length,
      my_tickets_sample: myTickets.slice(0, 5).map((t) => ({
        id: t.id,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      })),
    }
  }

  return NextResponse.json(payload)
}
