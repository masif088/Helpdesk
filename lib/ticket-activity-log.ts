import {
  find,
  findBy,
  get,
  getMany,
  insert,
  projectStatuses,
  tags,
  teams,
  ticketActivityLog,
  ticketAssignees,
  tickets,
  ticketStatuses,
  ticketTags,
  users,
} from '@/lib/fsdb'

import type { TicketActivityAction } from './ticket-activity-actions'

export { TICKET_ACTIVITY_ACTIONS, type TicketActivityAction } from './ticket-activity-actions'

export type TicketActorRole = 'agent' | 'customer' | 'system' | 'automation'

export type TicketActivitySnapshot = {
  title: string
  description: string | null
  shortNote: string | null
  status: string
  teamId: string | null
  typeId: number | null
  /** support | spam | trash */
  ticketType: string
  /** Ticket priority as integer (null when cleared e.g. closed support). */
  priority: number | null
  companyId: string | null
  contactUserId: string | null
  dueDateIso: string | null
  assigneeIds: string[]
  tagIds: string[]
}

export async function loadTicketActivitySnapshot(
  ticketId: number
): Promise<TicketActivitySnapshot | null> {
  const t = await get(tickets, ticketId)

  if (!t) return null

  const [assignRows, tagRows] = await Promise.all([
    findBy(ticketAssignees, { ticketId }),
    findBy(ticketTags, { ticketId }),
  ])

  return {
    title: t.title,
    description: t.description ?? null,
    shortNote: t.shortNote ?? null,
    status: t.status,
    teamId: t.teamId ?? null,
    typeId: t.typeId ?? null,
    ticketType: t.ticketType ?? 'support',
    priority: t.priority == null ? null : Number(t.priority),
    companyId: t.companyId ?? null,
    contactUserId: t.contactUserId ?? null,
    dueDateIso: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    assigneeIds: assignRows.map((r) => r.userId).sort(),
    tagIds: tagRows.map((r) => r.tagId).sort(),
  }
}

export function diffTicketSnapshots(
  before: TicketActivitySnapshot,
  after: TicketActivitySnapshot
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  const keys: (keyof TicketActivitySnapshot)[] = [
    'title',
    'description',
    'shortNote',
    'status',
    'teamId',
    'typeId',
    'ticketType',
    'priority',
    'companyId',
    'contactUserId',
    'dueDateIso',
  ]
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changes[k] = { from: before[k], to: after[k] }
    }
  }
  if (JSON.stringify(before.assigneeIds) !== JSON.stringify(after.assigneeIds)) {
    changes.assignee_ids = { from: before.assigneeIds, to: after.assigneeIds }
  }
  if (JSON.stringify(before.tagIds) !== JSON.stringify(after.tagIds)) {
    changes.tag_ids = { from: before.tagIds, to: after.tagIds }
  }
  return changes
}

/** Resolve UUIDs in activity `changes` to display names for ticket activity UI. */
export async function enrichActivityEntityLabels(
  changes: Record<string, { from: unknown; to: unknown }>
): Promise<{ teams?: Record<string, string>; tags?: Record<string, string>; contacts?: Record<string, string>; assignees?: Record<string, string>; statuses?: Record<string, string>; project_statuses?: Record<string, string> }> {
  const out: { teams?: Record<string, string>; tags?: Record<string, string>; contacts?: Record<string, string>; assignees?: Record<string, string>; statuses?: Record<string, string>; project_statuses?: Record<string, string> } = {}

  // Teams
  const teamDelta = changes.teamId
  if (teamDelta) {
    const ids = new Set<string>()
    if (teamDelta.from != null && teamDelta.from !== '') ids.add(String(teamDelta.from))
    if (teamDelta.to != null && teamDelta.to !== '') ids.add(String(teamDelta.to))
    if (ids.size > 0) {
      const rows = await getMany(teams, [...ids])
      const map: Record<string, string> = {}
      for (const r of rows) map[r.id] = (r.name?.trim() || r.id) as string
      out.teams = map
    }
  }

  // Statuses
  const statusDelta = changes.status
  if (statusDelta) {
    const slugs = new Set<string>()
    if (statusDelta.from != null && statusDelta.from !== '') slugs.add(String(statusDelta.from))
    if (statusDelta.to != null && statusDelta.to !== '') slugs.add(String(statusDelta.to))
    if (slugs.size > 0) {
      const rows = await find(ticketStatuses, { where: [['slug', 'in', [...slugs]]] })
      const map: Record<string, string> = {}
      for (const r of rows) map[r.slug] = (r.title?.trim() || r.slug) as string
      out.statuses = map
    }
  }

  // Tags
  const tagDelta = changes.tag_ids
  if (tagDelta) {
    const ids = new Set<string>()
    for (const arr of [tagDelta.from, tagDelta.to]) {
      if (Array.isArray(arr)) for (const id of arr) if (id) ids.add(String(id))
    }
    if (ids.size > 0) {
      const rows = await getMany(tags, [...ids])
      const map: Record<string, string> = {}
      for (const r of rows) map[r.id] = (r.name?.trim() || r.id) as string
      out.tags = map
    }
  }

  // Assignees
  const assigneeDelta = changes.assignee_ids
  if (assigneeDelta) {
    const ids = new Set<string>()
    for (const arr of [assigneeDelta.from, assigneeDelta.to]) {
      if (Array.isArray(arr)) for (const id of arr) if (id) ids.add(String(id))
    }
    if (ids.size > 0) {
      const rows = await getMany(users, [...ids])
      const map: Record<string, string> = {}
      for (const r of rows) map[r.id] = (r.fullName?.trim() || r.email || r.id) as string
      out.assignees = map
    }
  }

  // Contact
  const contactDelta = changes.contactUserId
  if (contactDelta) {
    const ids = new Set<string>()
    if (contactDelta.from != null && contactDelta.from !== '') ids.add(String(contactDelta.from))
    if (contactDelta.to != null && contactDelta.to !== '') ids.add(String(contactDelta.to))
    if (ids.size > 0) {
      const rows = await getMany(users, [...ids])
      const map: Record<string, string> = {}
      for (const r of rows) map[r.id] = (r.fullName?.trim() || r.email || r.id) as string
      out.contacts = map
    }
  }

  // Project statuses
  const projectStatusDelta = changes.project_status_id
  if (projectStatusDelta) {
    const ids = new Set<number>()
    for (const v of [projectStatusDelta.from, projectStatusDelta.to]) {
      const n = Number(v)
      if (v != null && v !== '' && !isNaN(n)) ids.add(n)
    }
    if (ids.size > 0) {
      const rows = await getMany(projectStatuses, [...ids])
      const map: Record<string, string> = {}
      for (const r of rows) map[String(r.id)] = (r.title?.trim() || String(r.id)) as string
      out.project_statuses = map
    }
  }

  return out
}

export async function logTicketActivity(params: {
  ticketId: number
  actorUserId: string | null
  actorRole: TicketActorRole
  action: TicketActivityAction
  metadata?: Record<string, unknown> | null
  relatedCommentId?: string | null
}): Promise<void> {
  try {
    await insert(ticketActivityLog, {
      ticketId: params.ticketId,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: params.action,
      metadata: params.metadata ?? null,
      relatedCommentId: params.relatedCommentId ?? null,
    })
  } catch (err) {
    console.error('[ticket_activity_log]', err)
  }
}
