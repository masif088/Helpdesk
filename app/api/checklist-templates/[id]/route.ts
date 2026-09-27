import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import {
  checklistTemplateGroups,
  checklistTemplateItems,
  checklistTemplates,
  deleteChecklistTemplateCascade,
  find,
  get,
  type Patch,
  update,
} from '@/lib/fsdb'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const template = await get(checklistTemplates, id)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [groups, items] = await Promise.all([
    find(checklistTemplateGroups, { where: [['templateId', '==', id]], orderBy: [['orderIndex', 'asc']] }),
    find(checklistTemplateItems, { where: [['templateId', '==', id]], orderBy: [['orderIndex', 'asc']] }),
  ])

  return NextResponse.json({ ...template, groups, items })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const updates: Patch<typeof checklistTemplates.$inferSelect> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if ('description' in body)
    updates.description = typeof body.description === 'string' ? body.description.trim() || null : null
  updates.updatedAt = new Date()

  const row = await update(checklistTemplates, id, updates)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await deleteChecklistTemplateCascade(id)
  return NextResponse.json({ ok: true })
}
