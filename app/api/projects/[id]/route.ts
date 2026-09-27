import { NextResponse } from 'next/server'

import {
  find,
  get,
  getManyMap,
  projects,
  projectStatuses,
  remove,
  tickets,
  ticketTypes,
  update,
  updateWhere,
} from '@/lib/fsdb'
import { requireProjectApiSession } from '@/lib/project-api-auth'

function serializeProject(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  }
}

function serializeStatus(row: typeof projectStatuses.$inferSelect) {
  return {
    id: row.id,
    project_id: row.projectId,
    title: row.title,
    slug: row.slug,
    color: row.color,
    sort_order: row.sortOrder,
  }
}

/** Ticket payload for Kanban (column id = ps-{project_status_id}). Project activity = these tickets only. */
function serializeProjectBoardTicket(
  row: {
    t: typeof tickets.$inferSelect
    type: typeof ticketTypes.$inferSelect | null
  },
  fallbackProjectStatusId: number | null
) {
  const t = row.t
  const psId = t.projectStatusId ?? fallbackProjectStatusId
  const statusKey = psId != null ? `ps-${psId}` : 'ps-unassigned'

  return {
    id: t.id,
    title: t.title,
    description: t.description,
    short_note: t.shortNote ?? null,
    created_by: t.createdBy ?? '',
    contact_user_id: t.contactUserId ?? null,
    due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    status: statusKey,
    team_id: t.teamId,
    type_id: t.typeId,
    ticket_type: t.ticketType ?? 'project',
    priority: t.priority ?? 0,
    company_id: t.companyId,
    created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
    updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
    type: row.type
      ? { id: row.type.id, title: row.type.title, slug: row.type.slug, color: row.type.color ?? '#000' }
      : null,
    project_id: t.projectId,
    project_status_id: t.projectStatusId,
  }
}

/** GET /api/projects/[id] — project + statuses + activity (board tickets) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireProjectApiSession()
  if ('error' in gate) return gate.error

  const { id } = await params
  const projectRow = await get(projects, id)
  if (!projectRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const statusRows = await find(projectStatuses, {
    where: [['projectId', '==', id]],
    orderBy: [['sortOrder', 'asc'], ['id', 'asc']],
  })

  const firstStatusId = statusRows[0]?.id ?? null

  const boardTickets = await find(tickets, {
    where: [
      ['projectId', '==', id],
      ['ticketType', '==', 'project'],
    ],
    orderBy: [['updatedAt', 'desc']],
  })
  const typeById = await getManyMap(ticketTypes, boardTickets.map((t) => t.typeId))
  const ticketJoinRows = boardTickets.map((t) => ({
    t,
    type: t.typeId != null ? typeById.get(String(t.typeId)) ?? null : null,
  }))

  return NextResponse.json({
    ...serializeProject(projectRow),
    statuses: statusRows.map(serializeStatus),
    board_tickets: ticketJoinRows.map((r) => serializeProjectBoardTicket(r, firstStatusId)),
  })
}

/** PATCH /api/projects/[id] — title, description */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireProjectApiSession()
  if ('error' in gate) return gate.error

  const { id } = await params
  const existing = await get(projects, id)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const patch: Partial<typeof projects.$inferInsert> = {
    updatedAt: new Date(),
  }

  const titleIn = body.title ?? body.name
  if (titleIn !== undefined) {
    const title = String(titleIn ?? '').trim()
    if (!title) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    patch.title = title
  }
  if (body.description !== undefined) {
    patch.description =
      body.description != null && String(body.description).trim() !== ''
        ? String(body.description).trim()
        : null
  }

  const row = await update(projects, id, patch)
  if (!row) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(serializeProject(row))
}

/** DELETE /api/projects/[id] */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireProjectApiSession()
  if ('error' in gate) return gate.error

  const { id } = await params
  const existing = await get(projects, id)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await updateWhere(
    tickets,
    [
      ['projectId', '==', id],
      ['ticketType', '==', 'project'],
    ],
    {
      ticketType: 'support',
      projectId: null,
      projectStatusId: null,
      updatedAt: new Date(),
    }
  )

  // project_statuses cascade; remaining references (non-project tickets, screenshots) are set to null
  const statuses = await find(projectStatuses, { where: [['projectId', '==', id]] })
  for (const s of statuses) await remove(projectStatuses, s.id)
  await updateWhere(tickets, [['projectId', '==', id]], { projectId: null, projectStatusId: null })
  await remove(projects, id)
  return NextResponse.json({ ok: true })
}
