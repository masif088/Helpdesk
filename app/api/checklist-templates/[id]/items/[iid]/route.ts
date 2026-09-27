import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateItems, type Patch, remove, update } from '@/lib/fsdb'

type Params = { params: Promise<{ id: string; iid: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { iid } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Patch<typeof checklistTemplateItems.$inferSelect> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if (typeof body.order_index === 'number') updates.orderIndex = body.order_index
  if ('group_id' in body)
    updates.groupId = typeof body.group_id === 'string' ? body.group_id : null
  if ('note' in body)
    updates.note = typeof body.note === 'string' ? body.note.trim() || null : null

  const row = await update(checklistTemplateItems, iid, updates)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { iid } = await params
  await remove(checklistTemplateItems, iid)
  return NextResponse.json({ ok: true })
}
