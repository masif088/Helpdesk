import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import {
  companies,
  count,
  find,
  findBy,
  get,
  getManyMap,
  sortRows,
  teams,
  ticketAssignees,
  ticketComments,
  tickets,
  type TicketsRow,
  ticketStatuses,
  users,
} from '@/lib/fsdb'

export type MobileStatusGroup = 'open' | 'in_progress' | 'need_response' | 'completed'

export function slugToGroup(slug: string): MobileStatusGroup {
  const s = slug.toLowerCase().replace(/[\s_]/g, '-')
  if (['completed', 'closed', 'resolved', 'cancel', 'archived'].some((k) => s.includes(k))) return 'completed'
  if (['review', 'question', 'waiting', 'client', 'need-response'].some((k) => s.includes(k))) return 'need_response'
  if (['open', 'received', 'new', 'pending'].some((k) => s.includes(k))) return 'open'
  return 'in_progress'
}

export async function getMobileSession() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user as { id: string; name?: string | null; email?: string | null; role?: string }
}

/** Tickets a customer sees on mobile: company tickets + own tickets without company. */
async function loadCustomerMobileTickets(userId: string): Promise<TicketsRow[]> {
  const companyId = await getCustomerCompanyId(userId)
  if (!companyId) return findBy(tickets, { createdBy: userId })
  const [byCompany, own] = await Promise.all([
    findBy(tickets, { companyId }),
    find(tickets, { where: [['createdBy', '==', userId], ['companyId', '==', null]] }),
  ])
  const seen = new Set<number>()
  return [...byCompany, ...own].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
}

export async function getMobileTickets() {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  // ticketStatuses catalog: slug → title/color
  const allStatuses = await find(ticketStatuses)
  const statusMap = Object.fromEntries(allStatuses.map((s) => [s.slug, s]))

  const rows = isCustomer
    ? sortRows(await loadCustomerMobileTickets(user.id), [['createdAt', 'desc']]).slice(0, 50)
    : await find(tickets, { orderBy: [['createdAt', 'desc']], limit: 50 })

  const companyMap = await getManyMap(companies, rows.map((r) => r.companyId))

  return rows.map((r) => {
    const st = statusMap[r.status] ?? { title: r.status, color: '#8c8c8c' }
    return {
      id: r.id,
      title: r.title,
      priority: numToPriority(r.priority),
      status: st.title,
      statusSlug: r.status,
      statusColor: st.color,
      statusGroup: slugToGroup(r.status),
      company: r.companyId ? (companyMap.get(r.companyId)?.name ?? '—') : '—',
      createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('id', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    }
  })
}

export async function getMobileTicketDetail(ticketId: number) {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  const ticket = await get(tickets, ticketId)

  if (!ticket) return null

  const allStatuses = await find(ticketStatuses)
  const statusMap = Object.fromEntries(allStatuses.map((s) => [s.slug, s]))
  const st = statusMap[ticket.status] ?? { title: ticket.status, color: '#8c8c8c' }

  const [companyRow, assigneeLinks, commentDocs] = await Promise.all([
    get(companies, ticket.companyId),
    findBy(ticketAssignees, { ticketId }),
    findBy(ticketComments, isCustomer ? { ticketId, visibility: 'reply' } : { ticketId }),
  ])
  const peopleById = await getManyMap(users, [
    ...assigneeLinks.map((a) => a.userId),
    ...commentDocs.map((c) => c.userId),
  ])
  const assigneeRows = assigneeLinks.map((a) => ({ name: peopleById.get(a.userId)?.fullName ?? null }))
  const commentRows = sortRows(commentDocs, [['createdAt', 'asc']]).map((c) => ({
    id: c.id,
    body: c.comment,
    visibility: c.visibility,
    authorType: c.authorType,
    createdAt: c.createdAt,
    authorName: peopleById.get(c.userId)?.fullName ?? null,
  }))

  return {
    id: ticket.id,
    title: ticket.title,
    priority: numToPriority(ticket.priority),
    description: ticket.description ?? '',
    status: st.title,
    statusColor: st.color,
    company: companyRow?.name ?? '—',
    assignee: assigneeRows.map((a) => a.name).filter(Boolean).join(', ') || '—',
    createdAt: ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('id', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    comments: commentRows.map((c) => ({
      id: c.id,
      author: c.authorName ?? 'Unknown',
      role: (c.authorType === 'customer' ? 'customer' : 'agent') as 'customer' | 'agent',
      body: c.body ?? '',
      isNote: c.visibility === 'note',
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' }) : '',
    })),
  }
}

export async function getMobileDashboardStats() {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  let base: { companyId: string } | { createdBy: string } | null = null
  if (isCustomer) {
    const companyId = await getCustomerCompanyId(user.id)
    base = companyId ? { companyId } : { createdBy: user.id }
  }
  const baseConds = base
    ? Object.entries(base).map(([k, v]) => [k as keyof TicketsRow & string, '==', v] as const)
    : []

  const allStatuses = await find(ticketStatuses)
  const slugsByGroup = (group: MobileStatusGroup) => allStatuses.filter((s) => slugToGroup(s.slug) === group).map((s) => s.slug)

  const openSlugs = slugsByGroup('open')
  const inProgressSlugs = slugsByGroup('in_progress')
  const needResponseSlugs = slugsByGroup('need_response')
  const completedSlugs = slugsByGroup('completed')

  const countBySlugs = async (slugs: string[]) => {
    if (!slugs.length) return 0
    return count(tickets, [...baseConds, ['status', 'in', slugs]])
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [open, inProgress, needResponse, completedWeek] = await Promise.all([
    countBySlugs(openSlugs),
    countBySlugs(inProgressSlugs),
    countBySlugs(needResponseSlugs),
    completedSlugs.length
      ? count(tickets, [...baseConds, ['status', 'in', completedSlugs], ['updatedAt', '>=', weekAgo]])
      : Promise.resolve(0),
  ])

  return { open, inProgress, needResponse, completedThisWeek: completedWeek }
}

export async function getMobileCompaniesAndTeams() {
  const [allCompanies, teamRows] = await Promise.all([
    find(companies),
    find(teams, { orderBy: [['name', 'asc']] }),
  ])
  // Top 10 companies by ticket count (one aggregate count per company).
  const withCounts = await Promise.all(
    allCompanies.map(async (c) => ({ id: c.id, name: c.name, n: await count(tickets, [['companyId', '==', c.id]]) }))
  )
  const companyRows = withCounts
    .sort((a, b) => b.n - a.n)
    .slice(0, 10)
    .map(({ id, name }) => ({ id, name }))
  return { companies: companyRows, teams: teamRows.map((t) => ({ id: t.id, name: t.name })) }
}

function numToPriority(p: number | null): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
  if (!p) return 'P5'
  if (p <= 1) return 'P1'
  if (p <= 2) return 'P2'
  if (p <= 3) return 'P3'
  if (p <= 4) return 'P4'
  return 'P5'
}
