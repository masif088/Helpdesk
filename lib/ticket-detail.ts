/**
 * Server-side helper to fetch full ticket detail for detail page
 * Replaces Supabase queries
 */
import { customerCanAccessTicket } from '@/lib/customer-ticket-access'
import {
  commentAttachments,
  companies,
  find,
  findBy,
  get,
  getManyMap,
  projects,
  projectStatuses,
  screenshots,
  sortRows,
  tags,
  teams,
  ticketAssignees,
  ticketAttributs,
  ticketCcRecipients,
  ticketChecklist,
  ticketComments,
  type TicketCommentsRow,
  tickets,
  ticketTags,
  ticketTypes,
  users,
  type UsersRow,
} from '@/lib/fsdb'
import { getPublicUrl } from '@/lib/storage-provider'
import { mapChecklistItemToDto } from '@/lib/ticket-checklist-map'
import { coerceTicketType } from '@/lib/ticket-classification'

/** Initial / per-page comment batch size (newest-first window; UI shows oldest-at-top within batch). */
export const TICKET_COMMENTS_PAGE_SIZE = 10

export type TicketCommentOlderCursor = { created_at: string; id: string }

export interface TicketDetailOptions {
  /** @deprecated Prefer customerPortal */
  companyId?: string
  /** Portal customer: company tickets + personal tickets without company */
  customerPortal?: { userId: string; companyId: string | null }
  /** Filter screenshots by user (both admin and customer show only current user's) */
  screenshotUserId?: string
  /** Include hourly billing rate (admin / manager only). */
  includeBilling?: boolean
}

type CommentRowJoined = {
  comment: TicketCommentsRow
  user: UsersRow | null
  editor: UsersRow | null
}

function isCustomerPortalView(options?: TicketDetailOptions): boolean {
  return !!(options?.customerPortal || options?.companyId)
}

/** All comments of a ticket visible to this audience, newest first (createdAt desc, id desc). */
async function loadVisibleCommentsDesc(ticketId: number, options?: TicketDetailOptions): Promise<TicketCommentsRow[]> {
  const rows = await findBy(ticketComments, { ticketId })
  const visible = isCustomerPortalView(options) ? rows.filter((c) => c.visibility !== 'note') : rows
  return sortRows(visible, [['createdAt', 'desc'], ['id', 'desc']])
}

function isOlderThan(c: TicketCommentsRow, d: Date, beforeId: string): boolean {
  const t = c.createdAt ? new Date(c.createdAt).getTime() : 0
  return t < d.getTime() || (t === d.getTime() && c.id < beforeId)
}

async function mapCommentRowsToClient(rows: CommentRowJoined[]) {
  if (rows.length === 0) return []

  const commentIds = rows.map((r) => r.comment.id)
  const allTaggedIds = [...new Set(rows.flatMap((r) => r.comment.taggedUserIds ?? []))]
  const taggedUserMap = await getManyMap(users, allTaggedIds)
  const taggedUserById: Record<string, { id: string; full_name: string | null; email: string }> = {}
  for (const u of taggedUserMap.values()) {
    taggedUserById[u.id] = { id: u.id, full_name: u.fullName, email: u.email }
  }

  const commentAttachRows = await find(commentAttachments, { where: [['commentId', 'in', commentIds]] })

  const commentAttachByCommentId: Record<string, Array<{ id: string; file_url: string; file_name: string }>> = {}
  for (const row of commentAttachRows) {
    if (!commentAttachByCommentId[row.commentId]) {
      commentAttachByCommentId[row.commentId] = []
    }
    commentAttachByCommentId[row.commentId].push({
      id: row.id,
      file_url: row.fileUrl || (row.filePath ? getPublicUrl(row.filePath) : ''),
      file_name: row.fileName,
    })
  }

  return rows.map((r) => ({
    id: r.comment.id,
    ticket_id: r.comment.ticketId,
    user_id: r.comment.userId,
    comment: r.comment.comment,
    created_at: r.comment.createdAt ? new Date(r.comment.createdAt).toISOString() : '',
    visibility: r.comment.visibility ?? 'reply',
    author_type: r.comment.authorType ?? 'agent',
    tagged_user_ids: r.comment.taggedUserIds ?? [],
    tagged_users: (r.comment.taggedUserIds ?? []).flatMap((id) => {
      const u = taggedUserById[id]
      return u ? [u] : []
    }),
    cc_emails: r.comment.ccEmails ?? [],
    bcc_emails: r.comment.bccEmails ?? [],
    user: r.user
      ? { id: r.user.id, full_name: r.user.fullName, email: r.user.email, avatar_url: r.user.avatarUrl }
      : null,
    comment_attachments: commentAttachByCommentId[r.comment.id] || [],
    edited_by_user_id: r.comment.editedByUserId ?? null,
    edited_at: r.comment.editedAt ? new Date(r.comment.editedAt).toISOString() : null,
    edited_by_user: r.editor
      ? { id: r.editor.id, full_name: r.editor.fullName, email: r.editor.email }
      : null,
  }))
}

/**
 * Fetch a window of comments: `latest` = newest N; `older` = N comments strictly before cursor (chronological).
 */
export async function fetchTicketCommentsWindow(
  ticketId: number,
  options: TicketDetailOptions | undefined,
  mode: 'latest' | 'older',
  olderThan: TicketCommentOlderCursor | null,
  pageSize: number = TICKET_COMMENTS_PAGE_SIZE
) {
  const all = await loadVisibleCommentsDesc(ticketId, options)
  let candidates = all
  if (mode === 'older' && olderThan) {
    const d = new Date(olderThan.created_at)
    candidates = all.filter((c) => isOlderThan(c, d, olderThan.id))
  }

  const pageWindow = candidates.slice(0, pageSize + 1)
  const hasOlder = pageWindow.length > pageSize
  const batchComments = hasOlder ? pageWindow.slice(0, pageSize) : pageWindow
  const peopleById = await getManyMap(
    users,
    batchComments.flatMap((c) => [c.userId, c.editedByUserId])
  )
  const batch: CommentRowJoined[] = batchComments.map((comment) => ({
    comment,
    user: peopleById.get(comment.userId) ?? null,
    editor: comment.editedByUserId ? peopleById.get(comment.editedByUserId) ?? null : null,
  }))
  const chronological: CommentRowJoined[] = [...batch].reverse()

  const comments = await mapCommentRowsToClient(chronological)

  const oldest = batch.length > 0 ? batch[batch.length - 1]!.comment : null
  const comments_older_cursor: TicketCommentOlderCursor | null =
    hasOlder && oldest
      ? {
          created_at: oldest.createdAt ? new Date(oldest.createdAt).toISOString() : '',
          id: oldest.id,
        }
      : null

  let comments_older_remaining = 0
  if (hasOlder && oldest) {
    const d = oldest.createdAt ? new Date(oldest.createdAt) : new Date(0)
    comments_older_remaining = all.filter((c) => isOlderThan(c, d, oldest.id)).length
  }

  return { comments, comments_has_older: hasOlder, comments_older_cursor, comments_older_remaining }
}

export async function getTicketDetail(ticketId: number, options?: TicketDetailOptions) {
  const t = await get(tickets, ticketId)
  if (!t) return null

  const [creator, contact, team, type, company, project] = await Promise.all([
    get(users, t.createdBy),
    get(users, t.contactUserId),
    get(teams, t.teamId),
    get(ticketTypes, t.typeId),
    get(companies, t.companyId),
    get(projects, t.projectId),
  ])
  const ticketRow = { creator, contact, team, type, company, project }
  if (options?.customerPortal) {
    const { userId, companyId } = options.customerPortal
    if (!customerCanAccessTicket(
      { companyId: t.companyId, contactUserId: t.contactUserId, createdBy: t.createdBy },
      userId,
      companyId
    )) {
      return null
    }
    const cls = coerceTicketType(t.ticketType)
    if (cls === 'spam' || cls === 'trash' || cls === 'notification' || cls === 'project') return null
  } else if (options?.companyId && t.companyId !== options.companyId) {
    return null
  } else if (options?.companyId) {
    const cls = coerceTicketType(t.ticketType)
    if (cls === 'spam' || cls === 'trash' || cls === 'notification' || cls === 'project') return null
  }

  const [assigneeLinks, checklistItemsRaw, attributsRows, screenshotsRows, ticketTagLinks, ccRecipientsRows] =
    await Promise.all([
      findBy(ticketAssignees, { ticketId }),
      findBy(ticketChecklist, { ticketId }),
      findBy(ticketAttributs, { ticketId }),
      findBy(
        screenshots,
        options?.screenshotUserId ? { ticketId, userId: options.screenshotUserId } : { ticketId }
      ).then((rows) => sortRows(rows, [['createdAt', 'desc']])),
      findBy(ticketTags, { ticketId }),
      findBy(ticketCcRecipients, { ticketId }),
    ])

  const [peopleById, tagById] = await Promise.all([
    getManyMap(users, [
      ...assigneeLinks.map((a) => a.userId),
      ...checklistItemsRaw.map((c) => c.completedByUserId),
    ]),
    getManyMap(tags, ticketTagLinks.map((l) => l.tagId)),
  ])
  const assigneesRows = assigneeLinks.map((a) => ({ id: a.id, userId: a.userId, user: peopleById.get(a.userId) ?? null }))
  const checklistRows = sortRows(checklistItemsRaw, [['orderIndex', 'asc']]).map((item) => ({
    item,
    completedBy: item.completedByUserId ? peopleById.get(item.completedByUserId) ?? null : null,
  }))
  const ticketTagsRows = ticketTagLinks.map((l) => ({ tag: tagById.get(l.tagId) ?? null }))
  attributsRows.sort((a, b) => a.metaKey.localeCompare(b.metaKey))

  const {
    comments,
    comments_has_older,
    comments_older_cursor,
    comments_older_remaining,
  } = await fetchTicketCommentsWindow(ticketId, options, 'latest', null, TICKET_COMMENTS_PAGE_SIZE)

  const ticketTypeCls = coerceTicketType(t.ticketType)
  let project_status: { id: number; title: string; slug: string; color: string } | null = null
  let project_statuses: Array<{ id: number; title: string; slug: string; color: string; sort_order: number }> = []

  if (ticketTypeCls === 'project' && t.projectId) {
    const psRows = await find(projectStatuses, {
      where: [['projectId', '==', t.projectId]],
      orderBy: [['sortOrder', 'asc']],
    })
    project_statuses = psRows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      color: r.color,
      sort_order: r.sortOrder,
    }))
    if (t.projectStatusId != null) {
      const cur = psRows.find((r) => r.id === t.projectStatusId)
      project_status = cur
        ? { id: cur.id, title: cur.title, slug: cur.slug, color: cur.color }
        : null
    }
  }

  const ticketData = {
    id: t.id,
    title: t.title,
    description: t.description,
    original_description: t.originalDescription ?? null,
    short_note: t.shortNote ?? null,
    required_skills: t.requiredSkills ?? [],
    created_by: t.createdBy,
    contact_user_id: t.contactUserId ?? null,
    due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    status: t.status,
    team_id: t.teamId,
    type_id: t.typeId,
    ticket_type: ticketTypeCls,
    priority: t.priority ?? null,
    company_id: t.companyId,
    project_id: t.projectId ?? null,
    project_status_id: t.projectStatusId ?? null,
    ...(options?.includeBilling
      ? { hourly_rate: t.hourlyRate ?? null, fixed_price: t.fixedPrice ?? null, rate_currency: t.rateCurrency ?? null }
      : {}),
    project: ticketRow.project
      ? { id: ticketRow.project.id, title: ticketRow.project.title }
      : null,
    project_status,
    project_statuses,
    created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
    updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
    source: t.source ?? null,
    gmail_thread_id: t.gmailThreadId,
    created_via: t.createdVia,
    last_read_at: (() => {
      const audienceLastRead = isCustomerPortalView(options)
        ? t.customerLastReadAt
        : t.staffLastReadAt
      return audienceLastRead ? new Date(audienceLastRead).toISOString() : null
    })(),
    creator: ticketRow.creator
      ? {
          id: ticketRow.creator.id,
          full_name: ticketRow.creator.fullName,
          email: ticketRow.creator.email,
          avatar_url: ticketRow.creator.avatarUrl ?? null,
        }
      : null,
    contact: ticketRow.contact
      ? {
          id: ticketRow.contact.id,
          full_name: ticketRow.contact.fullName,
          email: ticketRow.contact.email,
          avatar_url: ticketRow.contact.avatarUrl ?? null,
        }
      : null,
    team: ticketRow.team ? { id: ticketRow.team.id, name: ticketRow.team.name } : null,
    type: ticketRow.type
      ? { id: ticketRow.type.id, title: ticketRow.type.title, slug: ticketRow.type.slug, color: ticketRow.type.color }
      : null,
    company: ticketRow.company
      ? {
          id: ticketRow.company.id,
          name: ticketRow.company.name,
          color: ticketRow.company.color,
          email: ticketRow.company.email,
        }
      : null,
    assignees: assigneesRows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      user: r.user
        ? {
            id: r.user.id,
            full_name: r.user.fullName,
            email: r.user.email,
            avatar_url: r.user.avatarUrl,
          }
        : null,
    })),
  }

  const checklistItems = checklistRows.map((r) =>
    mapChecklistItemToDto(r.item, r.completedBy ?? undefined)
  )

  const attributes = attributsRows.map((r) => ({
    id: r.id,
    ticket_id: r.ticketId,
    meta_key: r.metaKey,
    meta_value: r.metaValue,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  const tagsList = ticketTagsRows
    .map((r) => r.tag)
    .filter(Boolean)
    .map((tag) => ({
      id: tag!.id,
      name: tag!.name,
      slug: tag!.slug,
      color: tag!.color ?? undefined,
    }))

  const screenshotsList = screenshotsRows.map((r) => ({
    id: r.id,
    file_name: r.fileName,
    file_path: r.filePath,
    file_url: r.fileUrl || (r.filePath ? getPublicUrl(r.filePath) : ''),
    file_size: r.fileSize ?? 0,
    mime_type: r.mimeType ?? '',
    ticket_id: r.ticketId,
    title: r.title,
    description: r.description,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  const ticketCcEmails = Array.isArray(ccRecipientsRows) ? ccRecipientsRows.map((r) => r.email).filter(Boolean) : []

  return {
    ticketData,
    checklistItems,
    comments,
    comments_has_older,
    comments_older_cursor,
    comments_older_remaining,
    attributes,
    screenshots: screenshotsList,
    tags: tagsList,
    ticketCcEmails,
  }
}
