import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import {
  checklistTemplateGroups,
  checklistTemplateItems,
  checklistTemplates,
  find,
  findBy,
  get,
  insertMany,
  ticketChecklist,
} from '@/lib/fsdb'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/tickets/[id]/checklist/apply-template
 * Body: { template_id: string }
 * Appends template items (with group_name) to the ticket checklist.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const templateId = typeof body.template_id === 'string' ? body.template_id : null
  if (!templateId) return NextResponse.json({ error: 'template_id is required' }, { status: 400 })

  const template = await get(checklistTemplates, templateId)
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const [groups, items] = await Promise.all([
    find(checklistTemplateGroups, { where: [['templateId', '==', templateId]], orderBy: [['orderIndex', 'asc']] }),
    find(checklistTemplateItems, { where: [['templateId', '==', templateId]], orderBy: [['orderIndex', 'asc']] }),
  ])

  const groupMap = new Map(groups.map((g) => [g.id, g.title]))

  if (items.length === 0) return NextResponse.json({ added: 0 })

  // Find current max order_index for this ticket
  const existing = await findBy(ticketChecklist, { ticketId })

  const maxOrder = existing.reduce((m, r) => Math.max(m, r.orderIndex ?? 0), 0)

  const rows = items.map((item, i) => ({
    ticketId,
    title: item.title,
    isCompleted: false,
    orderIndex: maxOrder + i + 1,
    groupName: item.groupId ? (groupMap.get(item.groupId) ?? null) : null,
    completionNote: item.note ?? null,
  }))

  await insertMany(ticketChecklist, rows)
  await bumpTicketDataVersion(ticketId)

  return NextResponse.json({ added: rows.length })
}
