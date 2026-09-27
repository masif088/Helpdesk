import { after, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { companyDefaultRate } from '@/lib/billing-rate-server'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { loadCustomerAccessibleTickets } from '@/lib/customer-ticket-access'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import {
  companies,
  find,
  findBy,
  get,
  getMany,
  getManyMap,
  insert,
  insertMany,
  projects,
  projectStatuses,
  sortRows,
  tags,
  teamMembers,
  teams,
  ticketAssignees,
  ticketAttachments,
  ticketChecklist,
  ticketComments,
  tickets,
  type TicketsRow,
  ticketTags,
  ticketTypes,
  update,
  users,
} from '@/lib/fsdb'
import { sendRequesterTicketCreatedEmail } from '@/lib/requester-new-ticket-email'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import { getPublicUrl } from '@/lib/storage-provider'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE, isTicketFolder } from '@/lib/ticket-classification'
import {
  assignCompanySupportTicketRank,
  assignCreatorSupportTicketRank,
  parseCompanyTicketDesiredRank,
} from '@/lib/ticket-company-priority-order'
import {
  assertTicketContactUserAllowed,
  getEffectiveCompanyIdForUser,
} from '@/lib/ticket-contact-user'
import { isInboxTicket, isMyTicket, isTicketScope, loadAssignedTicketIds, loadMyTicketScope, notifyNewUnassignedTicket } from '@/lib/ticket-inbox'
import { loadTicketCandidates, searchTickets, sortTicketList } from '@/lib/ticket-list-query'
import { sendNewTicketAgentNotificationEmail } from '@/lib/ticket-notification-emails'
import { assertCustomerMayUseTicketType } from '@/lib/ticket-type-customer-access'

const DEFAULT_LIMIT = 50
/** Max tickets per list request (UI: 50 / 100 / 200 / 500). */
const MAX_LIMIT = 500
/** GET /api/tickets - List tickets with related data (server-side filtering). Customer: only tickets of their company */
export async function GET(request: Request) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()
  const isCustomerViewer = role === 'customer'

  // Customer: company tickets + personal tickets without company (owner)
  let customerCompanyId: string | null = null
  if (isCustomerViewer) {
    customerCompanyId = await getCustomerCompanyId(userId)
  }

  const url = new URL(request.url)
  const companyIdParam = url.searchParams.get('company_id')
  const companyIdsParam = url.searchParams.get('company_ids')
  const companyIds = companyIdsParam
      ? companyIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : companyIdParam
        ? [companyIdParam.trim()]
        : []
  const statusParam = url.searchParams.get('status')
  const typeIdParam = url.searchParams.get('type_id')
  const typeIdsParam = url.searchParams.get('type_ids')
  const tagIdsParam = url.searchParams.get('tag_ids')
  const noCompany = url.searchParams.get('no_company') === '1'
  const noTags = url.searchParams.get('no_tags') === '1'
  const noTeam = url.searchParams.get('no_team') === '1'
  const teamIdParam = url.searchParams.get('team_id')
  const teamIdsParam = url.searchParams.get('team_ids')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const dueDateFrom = url.searchParams.get('due_date_from')
  const dueDateTo = url.searchParams.get('due_date_to')
  const search = url.searchParams.get('search')?.trim()
  const searchBy = url.searchParams.get('search_by')?.trim() || 'all' // 'all' | 'title' | 'id'
  // search_fields: comma-separated subset — title,description,comments,properties
  const searchFieldsRaw = url.searchParams.get('search_fields')
  const searchFields = searchFieldsRaw
    ? new Set(searchFieldsRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null
  const paginated = url.searchParams.get('paginated') === '1'
  const sortOrder = url.searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc'
  const sortById = url.searchParams.get('sort_by') === 'id'
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)),
    MAX_LIMIT
  )
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const statusSlugs = statusParam ? statusParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  const tagIds = tagIdsParam ? tagIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  const typeIds = typeIdsParam
    ? typeIdsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : typeIdParam
      ? (() => { const n = parseInt(typeIdParam, 10); return isNaN(n) ? [] : [n] })()
      : []
  const teamIds = teamIdsParam
    ? teamIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : teamIdParam
      ? [teamIdParam.trim()]
      : []
  const ticketTypeFilter = url.searchParams.get('ticket_type')?.trim().toLowerCase()

  const isCustomerList = role === 'customer'
  const isAdminList = isAdmin(role as string | undefined)

  /**
   * Customers never see spam/trash lists (ignore `ticket_type` query).
   * Staff: junk folders via explicit `?ticket_type=spam|trash`; else main list = `support` only.
   * Tickets with classification `project` are excluded from the main list (they live on the project board).
   */
  const listTicketType =
    role !== 'customer' && isTicketFolder(ticketTypeFilter)
      ? ticketTypeFilter
      : DEFAULT_TICKET_TYPE

  /** Staff views on the support queue: inbox (unassigned, open) or mine (assigned to me or to one of my teams). */
  const scopeParam = url.searchParams.get('scope')?.trim().toLowerCase()
  const scope = !isCustomerList && listTicketType === DEFAULT_TICKET_TYPE && isTicketScope(scopeParam) ? scopeParam : null

  // ── 1. Candidate set ────────────────────────────────────────────────────────
  let candidates: TicketsRow[]
  const searchAsId = search && /^\d+$/.test(search) ? parseInt(search, 10) : null
  if (search) {
    if (searchBy === 'id') {
      candidates = searchAsId !== null ? await getMany(tickets, [searchAsId]) : []
    } else if (searchBy === 'title') {
      candidates = await searchTickets(search, { title: true, description: false, comments: false }, null)
    } else if (searchFields) {
      // granular field selection from preferences
      candidates = await searchTickets(
        search,
        {
          title: searchFields.has('title'),
          description: searchFields.has('description'),
          comments: searchFields.has('comments'),
        },
        searchAsId
      )
    } else {
      // 'all' default — title + description only (comments excluded for performance)
      candidates = await searchTickets(search, { title: true, description: true, comments: false }, searchAsId)
    }
  } else if (isCustomerList) {
    candidates = await loadCustomerAccessibleTickets(userId, customerCompanyId)
  } else {
    candidates = await loadTicketCandidates({
      ticketType: listTicketType,
      companyIds,
      statusSlugs,
      teamIds,
      typeIds,
    })
  }

  // ── 2. Access rules ─────────────────────────────────────────────────────────
  let allowed: (t: TicketsRow) => boolean = () => true
  if (isCustomerList) {
    if (search) {
      // Search results were not scoped by the customer loader — scope them now.
      const accessible = new Set((await loadCustomerAccessibleTickets(userId, customerCompanyId)).map((t) => t.id))
      allowed = (t) => accessible.has(t.id)
    }
  } else if (!isAdminList) {
    // Team access: unassigned OR public team OR user is a member of the ticket's team
    const [memberships, publicTeams] = await Promise.all([
      findBy(teamMembers, { userId }),
      find(teams, { where: [['type', '==', 'public']] }),
    ])
    const visibleTeamIds = new Set([...memberships.map((m) => m.teamId), ...publicTeams.map((t) => t.id)])
    allowed = (t) => !t.teamId || visibleTeamIds.has(t.teamId)
  }

  // ── 3. Remaining filters (in memory) ────────────────────────────────────────
  const companySet = new Set(companyIds)
  const statusSet = new Set(statusSlugs)
  const typeSet = new Set(typeIds)
  const teamSet = new Set(teamIds)
  const createdFrom = dateFrom ? new Date(dateFrom) : null
  const createdTo = dateTo ? new Date(dateTo) : null
  if (createdTo && !isNaN(createdTo.getTime())) createdTo.setHours(23, 59, 59, 999)
  const dueFrom = dueDateFrom ? new Date(dueDateFrom) : null
  const dueTo = dueDateTo ? new Date(dueDateTo) : null
  if (dueTo && !isNaN(dueTo.getTime())) dueTo.setHours(23, 59, 59, 999)

  let tagTicketIds: Set<number> | null = null
  if (tagIds.length > 0) {
    tagTicketIds = new Set((await find(ticketTags, { where: [['tagId', 'in', tagIds]] })).map((l) => l.ticketId))
  }
  let taggedTicketIds: Set<number> | null = null
  if (noTags) {
    taggedTicketIds = new Set((await find(ticketTags, { select: ['ticketId'] })).map((l) => l.ticketId))
  }

  const [assignedIds, myIds] = await Promise.all([
    scope === 'inbox' ? loadAssignedTicketIds() : null,
    scope === 'mine' ? loadMyTicketScope(userId) : null,
  ])

  const filtered = candidates.filter((t) => {
    if (!allowed(t)) return false
    if (assignedIds && !isInboxTicket(t, assignedIds)) return false
    if (myIds && !isMyTicket(t, myIds)) return false
    if (t.ticketType !== listTicketType) return false
    if (!isCustomerList && companySet.size > 0 && (!t.companyId || !companySet.has(t.companyId))) return false
    if (statusSet.size > 0 && !statusSet.has(t.status)) return false
    if (typeSet.size > 0 && (t.typeId == null || !typeSet.has(t.typeId))) return false
    if (!isCustomerList && teamSet.size > 0 && (!t.teamId || !teamSet.has(t.teamId))) return false
    if (createdFrom && !isNaN(createdFrom.getTime()) && t.createdAt < createdFrom) return false
    if (createdTo && !isNaN(createdTo.getTime()) && t.createdAt > createdTo) return false
    if (dueDateFrom || dueDateTo) {
      if (!t.dueDate) return false
      if (dueFrom && !isNaN(dueFrom.getTime()) && t.dueDate < dueFrom) return false
      if (dueTo && !isNaN(dueTo.getTime()) && t.dueDate > dueTo) return false
    }
    if (tagTicketIds && !tagTicketIds.has(t.id)) return false
    if (noCompany && t.companyId) return false
    if (taggedTicketIds && taggedTicketIds.has(t.id)) return false
    if (noTeam && t.teamId) return false
    return true
  })

  // ── 4. Sort + page, then load full rows and relations for the page only ────
  // Inbox: newest first (it is about "has anyone seen this", not priority)
  const pageIds = sortTicketList(filtered, sortById || scope === 'inbox', scope === 'inbox' ? 'desc' : sortOrder)
    .slice(offset, offset + limit)
    .map((t) => t.id)
  const pageTicketMap = await getManyMap(tickets, pageIds)
  const pageTickets = pageIds.map((id) => pageTicketMap.get(String(id))).filter((t): t is TicketsRow => !!t)

  const [creatorById, teamById, typeById, companyById] = await Promise.all([
    getManyMap(users, pageTickets.map((t) => t.createdBy)),
    getManyMap(teams, pageTickets.map((t) => t.teamId)),
    getManyMap(ticketTypes, pageTickets.map((t) => t.typeId)),
    getManyMap(companies, pageTickets.map((t) => t.companyId)),
  ])
  const ticketsRows = pageTickets.map((ticket) => ({
    ticket,
    creator: ticket.createdBy ? creatorById.get(ticket.createdBy) ?? null : null,
    team: ticket.teamId ? teamById.get(ticket.teamId) ?? null : null,
    type: ticket.typeId != null ? typeById.get(String(ticket.typeId)) ?? null : null,
    company: ticket.companyId ? companyById.get(ticket.companyId) ?? null : null,
  }))

  const ticketIds = pageTickets.map((t) => t.id)

  const [assigneeLinks, checklistRows, tagLinks, commentRows, attachmentsRows] = await Promise.all([
    find(ticketAssignees, { where: [['ticketId', 'in', ticketIds]] }),
    find(ticketChecklist, { where: [['ticketId', 'in', ticketIds]] }),
    find(ticketTags, { where: [['ticketId', 'in', ticketIds]] }),
    find(ticketComments, {
      where: [['ticketId', 'in', ticketIds]],
      select: ['ticketId', 'visibility', 'authorType', 'receivedAt'],
    }),
    find(ticketAttachments, { where: [['ticketId', 'in', ticketIds]] }).then((rows) =>
      sortRows(rows, [['createdAt', 'asc']])
    ),
  ])
  const [assigneeUsers, tagById] = await Promise.all([
    getManyMap(users, assigneeLinks.map((a) => a.userId)),
    getManyMap(tags, tagLinks.map((l) => l.tagId)),
  ])

  // Customer: agent/automation replies. Staff: notes or customer replies.
  const repliesRows = commentRows
    .filter((c) =>
      isCustomerViewer
        ? c.visibility === 'reply' && c.authorType !== 'customer'
        : c.visibility === 'note' || (c.visibility === 'reply' && c.authorType === 'customer')
    )
    .map((c) => ({ ticketId: c.ticketId, createdAt: c.receivedAt }))

  const latestReplies: Record<number, string> = {}
  repliesRows.forEach((r) => {
    const createdAtStr = r.createdAt ? new Date(r.createdAt).toISOString() : ''
    const cur = latestReplies[r.ticketId]
    if (!cur || createdAtStr > cur) latestReplies[r.ticketId] = createdAtStr
  })

  const tagsByTicket: Record<number, Array<{ id: string; name: string; slug: string; color?: string }>> = {}
  tagLinks.forEach((row) => {
    const tag = tagById.get(row.tagId)
    if (!tag) return
    if (!tagsByTicket[row.ticketId]) tagsByTicket[row.ticketId] = []
    tagsByTicket[row.ticketId].push({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color ?? undefined,
    })
  })

  const assigneesByTicket: Record<
    number,
    Array<{ id: string; user_id: string; user_name: string }>
  > = {}
  assigneeLinks.forEach((row) => {
    const u = assigneeUsers.get(row.userId)
    const name = u?.fullName || u?.email || 'Unknown'
    if (!assigneesByTicket[row.ticketId]) assigneesByTicket[row.ticketId] = []
    assigneesByTicket[row.ticketId].push({
      id: row.id,
      user_id: row.userId,
      user_name: name,
    })
  })

  const attachmentsByTicket: Record<
    number,
    Array<{ id: string; file_url: string; file_name: string; file_path: string }>
  > = {}
  attachmentsRows.forEach((row) => {
    if (!attachmentsByTicket[row.ticketId]) attachmentsByTicket[row.ticketId] = []
    attachmentsByTicket[row.ticketId].push({
      id: row.id,
      file_url: row.fileUrl || (row.filePath ? getPublicUrl(row.filePath) : ''),
      file_name: row.fileName,
      file_path: row.filePath ?? '',
    })
  })

  const checklistByTicket: Record<
    number,
    { completed: number; total: number; items: unknown[] }
  > = {}
  checklistRows.forEach((row) => {
    if (!checklistByTicket[row.ticketId])
      checklistByTicket[row.ticketId] = { completed: 0, total: 0, items: [] }
    checklistByTicket[row.ticketId].total++
    if (row.isCompleted) checklistByTicket[row.ticketId].completed++
    checklistByTicket[row.ticketId].items.push(row)
  })

  const result = ticketsRows.map((r) => {
    const t = r.ticket
    const cl = checklistByTicket[t.id] || { completed: 0, total: 0, items: [] }
    const audienceLastRead = isCustomerViewer ? t.customerLastReadAt : t.staffLastReadAt
    const lastReadAt = audienceLastRead ? new Date(audienceLastRead).toISOString() : null
    const latestReplyAt = latestReplies[t.id]
    // For agents: a ticket created by a customer counts as unread until first opened.
    // Use dbInsertedAt as fallback when there are no comments yet.
    const creatorIsCustomer = !isCustomerViewer && r.creator?.role?.toLowerCase() === 'customer'
    const dbInsertedAt = (t as { dbInsertedAt?: Date | null }).dbInsertedAt
    const ticketInsertedAt = dbInsertedAt ? new Date(dbInsertedAt).toISOString() : null
    const latestActivityAt = latestReplyAt ?? (creatorIsCustomer ? ticketInsertedAt : null)
    const hasUnread = !!latestActivityAt && (!lastReadAt || latestActivityAt > lastReadAt)
    const creatorName = r.creator?.fullName || r.creator?.email || 'Unknown'
    const companyName = r.company?.name

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      short_note: t.shortNote ?? null,
      created_by: t.createdBy,
      contact_user_id: t.contactUserId ?? null,
      due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      status: t.status,
      team_id: t.teamId,
      type_id: t.typeId,
      ticket_type: coerceTicketType(t.ticketType),
      priority: t.priority,
      company_id: t.companyId,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
      creator: r.creator
        ? { id: r.creator.id, full_name: r.creator.fullName, email: r.creator.email }
        : null,
      team: r.team ? { id: r.team.id, name: r.team.name } : null,
      type: r.type ? { id: r.type.id, title: r.type.title, slug: r.type.slug, color: r.type.color } : null,
      company: r.company
        ? { id: r.company.id, name: r.company.name, color: r.company.color, email: r.company.email }
        : null,
      creator_name: creatorName,
      by_label: creatorName || companyName,
      team_name: r.team?.name ?? null,
      tags: tagsByTicket[t.id] || [],
      assignees: assigneesByTicket[t.id] || [],
      checklist_items: cl.items,
      checklist_completed: cl.completed,
      checklist_total: cl.total,
      last_read_at: lastReadAt,
      has_unread_replies: hasUnread,
      /** Staff: no one on the team has opened this ticket yet */
      is_new: !isCustomerViewer && !t.staffLastReadAt,
      attachments: attachmentsByTicket[t.id] || [],
    }
  })

  if (paginated) {
    return NextResponse.json({ data: result, total: filtered.length })
  }

  return NextResponse.json(result)
}

/** POST /api/tickets - Create ticket */
export async function POST(request: Request) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    title,
    description,
    short_note,
    status,
    team_id,
    type_id,
    priority,
    company_id,
    due_date,
    assignees = [],
    tag_ids = [],
    attachments = [],
    created_via: bodyCreatedVia,
    contact_user_id: bodyContactUserId,
    project_id: bodyProjectId,
    project_status_id: bodyProjectStatusId,
  } = body

  /** created_via: 'portal' (admin app) | 'website' (embed/widget) | 'app' (mobile/external) - for automation conditions */
  const createdVia = bodyCreatedVia || 'portal'

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()
  const numericPriorityRaw = priority !== undefined && priority !== null ? Number(priority) : 0
  const resolvedPriority =
    Number.isFinite(numericPriorityRaw) && !Number.isNaN(numericPriorityRaw)
      ? Math.max(0, Math.floor(numericPriorityRaw))
      : 0
  let resolvedCompanyId = company_id || null
  if (role === 'customer' && !resolvedCompanyId) {
    resolvedCompanyId = await getCustomerCompanyId(userId)
  }

  let contactUserId: string | null = null
  if (bodyContactUserId !== undefined && bodyContactUserId !== null && bodyContactUserId !== '') {
    if (typeof bodyContactUserId !== 'string') {
      return NextResponse.json({ error: 'contact_user_id must be a UUID string' }, { status: 400 })
    }
    contactUserId = bodyContactUserId
  }
  const contactCheck = await assertTicketContactUserAllowed(contactUserId)
  if (!contactCheck.ok) {
    return NextResponse.json({ error: contactCheck.error }, { status: 400 })
  }

  const companyIdBeforeContactAlign = resolvedCompanyId
  let ticketCrossCompanyWarning: string | undefined
  if (contactUserId) {
    const contactCompany = await getEffectiveCompanyIdForUser(contactUserId)
    if (contactCompany && contactCompany !== resolvedCompanyId) {
      if (companyIdBeforeContactAlign && companyIdBeforeContactAlign !== contactCompany) {
        ticketCrossCompanyWarning =
          "Contact is from another company: ticket company was aligned to the contact's company."
      }
      resolvedCompanyId = contactCompany
    }
  }

  let insertTicketType: 'support' | 'project' = 'support'
  let insertProjectId: string | null = null
  let insertProjectStatusId: number | null = null

  const rawProjectId =
    bodyProjectId != null && String(bodyProjectId).trim() !== '' ? String(bodyProjectId).trim() : null
  if (rawProjectId) {
    if (role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const projRow = await get(projects, rawProjectId)
    if (!projRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 })
    }
    insertProjectId = projRow.id
    insertTicketType = 'project'

    const psParsed =
      bodyProjectStatusId != null && bodyProjectStatusId !== ''
        ? parseInt(String(bodyProjectStatusId), 10)
        : NaN
    if (Number.isFinite(psParsed)) {
      const psRow = await get(projectStatuses, psParsed)
      if (!psRow || psRow.projectId !== insertProjectId) {
        return NextResponse.json({ error: 'Invalid project_status_id' }, { status: 400 })
      }
      insertProjectStatusId = psRow.id
    } else {
      const [firstPs] = await find(projectStatuses, {
        where: [['projectId', '==', insertProjectId]],
        orderBy: [['sortOrder', 'asc'], ['id', 'asc']],
        limit: 1,
      })
      insertProjectStatusId = firstPs?.id ?? null
    }
  }

  if (role === 'customer') {
    const typeCheck = await assertCustomerMayUseTicketType(type_id ?? null)
    if (!typeCheck.ok) {
      return NextResponse.json({ error: typeCheck.error }, { status: 400 })
    }
  }

  const useCompanyPriorityPool =
    insertTicketType === DEFAULT_TICKET_TYPE && resolvedCompanyId != null
  const useCreatorPriorityPool =
    insertTicketType === DEFAULT_TICKET_TYPE && !resolvedCompanyId && Boolean(authUser.id)

  const baseValues = {
    title: title || 'Untitled',
    description: description || null,
    shortNote: short_note ?? null,
    status: status || 'open',
    teamId: team_id || null,
    typeId: type_id ?? null,
    dueDate: due_date ? new Date(due_date) : null,
    createdBy: authUser.id,
    contactUserId,
    createdVia,
    ticketType: insertTicketType,
    projectId: insertProjectId,
    projectStatusId: insertProjectStatusId,
    // Created by staff → already seen by the team (not "New")
    ...(role !== 'customer' ? { staffLastReadAt: new Date() } : {}),
  }

  let newTicket: TicketsRow | undefined
  const companyRate = await companyDefaultRate(resolvedCompanyId)

  if (useCompanyPriorityPool) {
    const desiredRank = parseCompanyTicketDesiredRank(priority)
    try {
      // Priority NULL first, then placed into the company queue (shifting the others).
      newTicket = await insert(tickets, { ...baseValues, ...companyRate, priority: null, companyId: resolvedCompanyId })
      await assignCompanySupportTicketRank(resolvedCompanyId!, newTicket.id, desiredRank)
    } catch (e) {
      console.error('[POST /api/tickets] company queue create failed:', e)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }
  } else if (useCreatorPriorityPool) {
    const desiredRank = parseCompanyTicketDesiredRank(priority)
    try {
      newTicket = await insert(tickets, { ...baseValues, priority: null, companyId: null })
      await assignCreatorSupportTicketRank(authUser.id, newTicket.id, desiredRank)
    } catch (e) {
      console.error('[POST /api/tickets] creator queue create failed:', e)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }
  } else {
    newTicket = await insert(tickets, { ...baseValues, ...companyRate, priority: resolvedPriority, companyId: resolvedCompanyId })
  }

  if (!newTicket) {
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }
  const ticket = newTicket

  if (assignees.length > 0) {
    await insertMany(
      ticketAssignees,
      (assignees as string[]).map((uid) => ({ ticketId: ticket.id, userId: uid }))
    )
  }

  if (tag_ids.length > 0) {
    await insertMany(
      ticketTags,
      (tag_ids as string[]).map((tagId) => ({ ticketId: ticket.id, tagId }))
    )
  }

  try {
    const ctx = await loadAutomationTicketContext(ticket.id)
    if (ctx) await runAutomationRules('ticket_created', ctx)
  } catch (autoErr) {
    console.error('Automation rules error:', autoErr)
  }

  if (attachments.length > 0) {
    await insertMany(
      ticketAttachments,
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        ticketId: ticket.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: authUser.id,
      }))
    )
  }

  const activityRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId: ticket.id,
    actorUserId: userId,
    actorRole: activityRole,
    action: 'ticket_created',
    metadata: {
      title: title || 'Untitled',
      created_via: createdVia,
      assignee_count: Array.isArray(assignees) ? assignees.length : 0,
      tag_count: Array.isArray(tag_ids) ? tag_ids.length : 0,
      attachment_count: Array.isArray(attachments) ? attachments.length : 0,
    },
  })

  if (insertTicketType === DEFAULT_TICKET_TYPE && !(Array.isArray(assignees) && assignees.length > 0)) {
    const inboxTicket = { id: ticket.id, title: ticket.title, teamId: ticket.teamId ?? null, companyId: ticket.companyId ?? null }
    const actor = { id: userId, name: authUser.name || authUser.email || 'Someone', role: role ?? null }
    after(async () => {
      try {
        await notifyNewUnassignedTicket({
          ticketId: inboxTicket.id,
          ticketTitle: inboxTicket.title || 'Untitled',
          teamId: inboxTicket.teamId,
          companyId: inboxTicket.companyId,
          actorUserId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
        })
      } catch (e) {
        console.error('[POST ticket] notify inbox:', e)
      }
    })
  }

  if (Array.isArray(assignees) && assignees.length > 0) {
    try {
      const actorName = authUser.name || authUser.email || 'Someone'
      await notifyTicketUsers({
        recipientUserIds: assignees,
        excludeUserId: userId,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        type: 'new_ticket_assignee',
        title: 'New ticket assignment',
        body: `You were assigned to "${ticket.title}"`,
        actorUserId: userId,
        actorName,
        actorRole: role ?? null,
      })
    } catch (e) {
      console.error('[POST ticket] notify assignees:', e)
    }
  }


  if (insertTicketType !== 'project') {
    void notifySlackTicketEvent('ticket_created', {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      teamId: ticket.teamId ?? null,
      priority: ticket.priority,
      companyId: ticket.companyId ?? null,
      typeId: ticket.typeId ?? null,
    })

    try {
      const notifResult = await sendRequesterTicketCreatedEmail({
        creatorUserId: userId,
        creatorRole: role,
        companyId: resolvedCompanyId,
        ticketId: ticket.id,
        ticketTitle: ticket.title || 'Untitled',
      })
      // Persist the Gmail thread ID so customer email replies can be matched to this ticket.
      if (notifResult.sent && notifResult.sentThreadId && !ticket.gmailThreadId) {
        await update(tickets, ticket.id, { gmailThreadId: notifResult.sentThreadId, updatedAt: new Date() })
      }
    } catch (mailErr) {
      console.error('[POST ticket] requester notification email failed:', mailErr)
    }
    if (role === 'customer' && ticket.teamId) {
      try {
        await sendNewTicketAgentNotificationEmail({
          ticketId: ticket.id,
          ticketTitle: ticket.title || 'Untitled',
          teamId: ticket.teamId,
          creatorUserId: userId,
        })
      } catch (mailErr) {
        console.error('[POST ticket] agent new ticket notification email failed:', mailErr)
      }
    }
  }

  return NextResponse.json({
    id: ticket.id,
    created_at: ticket.createdAt ? new Date(ticket.createdAt).toISOString() : '',
    updated_at: ticket.updatedAt ? new Date(ticket.updatedAt).toISOString() : '',
    company_id: ticket.companyId ?? null,
    ...(ticketCrossCompanyWarning
      ? { ticket_cross_company_warning: ticketCrossCompanyWarning }
      : {}),
  })
}
