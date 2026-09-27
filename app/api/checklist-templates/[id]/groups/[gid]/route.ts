import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateGroups, deleteChecklistTemplateGroupCascade, type Patch, update } from '@/lib/fsdb'

type Params = { params: Promise<{ id: string; gid: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { gid } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Patch<typeof checklistTemplateGroups.$inferSelect> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if (typeof body.order_index === 'number') updates.orderIndex = body.order_index

  const row = await update(checklistTemplateGroups, gid, updates)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { gid } = await params
  await deleteChecklistTemplateGroupCascade(gid)
  return NextResponse.json({ ok: true })
}
