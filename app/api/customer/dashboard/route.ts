import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { customerBillingCompanyId, getCustomerBilling } from '@/lib/customer-billing'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { loadCustomerAccessibleTickets } from '@/lib/customer-ticket-access'
import { find, getManyMap, sortRows, ticketComments, ticketStatuses, ticketTypes, users } from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

/** Statuses where the team waits for the client */
const AWAITING_SLUGS = ['question', 'client_review']
const COMPLETED_SLUGS = ['resolved', 'closed', 'completed']
const LIST_LIMIT = 6

const time = (d: Date | null | undefined) => (d ? new Date(d).getTime() : 0)
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : '')

/**
 * GET /api/customer/dashboard — the customer's home: tickets that wait for their reply, active tickets,
 * latest replies from the team, counts per type / status and (portal admin only) a billing summary.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const companyId = await getCustomerCompanyId(userId)

  // Support tickets: company + personal (no company); exclude spam/trash
  const [accessible, statusRows, billingCompanyId] = await Promise.all([
    loadCustomerAccessibleTickets(userId, companyId),
    find(ticketStatuses, { orderBy: [['sortOrder', 'asc']] }),
    customerBillingCompanyId(userId),
  ])
  const myTickets = accessible.filter((t) => t.ticketType === DEFAULT_TICKET_TYPE)
  const byUpdated = [...myTickets].sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
  const statusBySlug = new Map(statusRows.map((s) => [s.slug, s]))

  const typeMap = await getManyMap(ticketTypes, [...new Set(myTickets.map((t) => t.typeId).filter((id): id is number => id != null))])
  const typeCounts = new Map<number | null, { type_title: string; type_id: number | null; count: number; color: string }>()
  for (const t of myTickets) {
    const key = t.typeId ?? null
    const type = key != null ? typeMap.get(String(key)) : undefined
    const row = typeCounts.get(key) ?? {
      type_title: key == null ? 'No Type' : type?.title ?? 'Unknown',
      type_id: key,
      count: 0,
      color: key == null ? '#d9d9d9' : type?.color ?? '#1890ff',
    }
    row.count += 1
    typeCounts.set(key, row)
  }

  const statusTally = new Map<string, number>()
  for (const t of myTickets) statusTally.set(t.status, (statusTally.get(t.status) ?? 0) + 1)
  const statusCounts = statusRows.map((s) => ({
    status_slug: s.slug,
    status_title: s.customerTitle ?? s.title,
    count: statusTally.get(s.slug) ?? 0,
    color: s.color ?? '#000',
  }))

  // Active tickets first (most recently updated), then fill up with the latest finished ones
  const active = byUpdated.filter((t) => !isClosedLikeTicketStatus(t.status))
  const listed = [...active, ...byUpdated.filter((t) => isClosedLikeTicketStatus(t.status))].slice(0, LIST_LIMIT)
  const creatorById = await getManyMap(users, listed.map((t) => t.createdBy))
  const recentTickets = listed.map((t) => {
    const s = statusBySlug.get(t.status)
    const creator = t.createdBy ? creatorById.get(t.createdBy) : undefined
    return {
      id: t.id,
      title: t.title,
      due_date: t.dueDate ? iso(t.dueDate) : null,
      updated_at: iso(t.updatedAt),
      status_title: s?.customerTitle ?? s?.title ?? t.status,
      status_color: s?.color ?? '#000',
      is_active: !isClosedLikeTicketStatus(t.status),
      priority: t.priority != null ? Number(t.priority) : null,
      creator_name: creator?.fullName || creator?.email || null,
    }
  })

  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const completed = myTickets.filter((t) => COMPLETED_SLUGS.includes(t.status) && t.updatedAt)
  const thisMonthCompleted = completed.filter((t) => new Date(t.updatedAt) >= startOfThisMonth).length
  const lastMonthCompleted = completed.filter((t) => new Date(t.updatedAt) >= startOfLastMonth && new Date(t.updatedAt) < startOfThisMonth).length

  const awaiting = byUpdated.filter((t) => AWAITING_SLUGS.includes(t.status))

  // Latest replies from the team on the customer's tickets
  let recentTeamUpdates: { ticket_id: number; ticket_title: string; comment: string; author_name: string | null; created_at: string }[] = []
  if (myTickets.length > 0) {
    const agentComments = await find(ticketComments, {
      where: [
        ['ticketId', 'in', myTickets.map((t) => t.id)],
        ['authorType', '==', 'agent'],
      ],
    })
    const latest = sortRows(
      agentComments.filter((c) => c.visibility === 'reply' || c.visibility === 'public'),
      [['createdAt', 'desc']]
    ).slice(0, 5)
    const authorById = await getManyMap(users, latest.map((c) => c.userId))
    const titleById = new Map(myTickets.map((t) => [t.id, t.title]))
    recentTeamUpdates = latest.map((c) => {
      const plain = c.comment.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const author = authorById.get(c.userId)
      return {
        ticket_id: c.ticketId,
        ticket_title: titleById.get(c.ticketId) ?? `Ticket #${c.ticketId}`,
        comment: plain.length > 120 ? plain.slice(0, 120) + '…' : plain,
        author_name: author?.fullName || author?.email || 'Team',
        created_at: iso(c.createdAt),
      }
    })
  }

  // Billing summary: only for the company's portal admin
  let billing: { deposit_balance: { currency: string; amount: number }[]; unpaid_invoices: { currency: string; amount: number }[]; unpaid_count: number; overdue_count: number } | null = null
  if (billingCompanyId) {
    const b = await getCustomerBilling(billingCompanyId)
    const unpaid = b.invoices.filter((i) => i.status === 'issued')
    const today = dayjs().startOf('day')
    billing = {
      deposit_balance: b.depositBalance,
      unpaid_invoices: b.unpaidInvoices,
      unpaid_count: unpaid.length,
      overdue_count: unpaid.filter((i) => i.due_date && dayjs(i.due_date).isBefore(today)).length,
    }
  }

  return NextResponse.json({
    company_id: companyId,
    my_tickets_count: myTickets.length,
    active_count: active.length,
    tickets_by_type: [...typeCounts.values()],
    status_counts: statusCounts,
    recent_tickets: recentTickets,
    monthly_summary: { this_month_completed: thisMonthCompleted, last_month_completed: lastMonthCompleted },
    awaiting_count: awaiting.length,
    awaiting_response: awaiting.slice(0, LIST_LIMIT).map((t) => ({ id: t.id, title: t.title, status: t.status, updated_at: iso(t.updatedAt) })),
    recent_team_updates: recentTeamUpdates,
    billing,
  })
}
