import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateItems, find, insert } from '@/lib/fsdb'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await find(checklistTemplateItems, {
    where: [['templateId', '==', id]],
    orderBy: [['orderIndex', 'asc']],
  })

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const row = await insert(checklistTemplateItems, {
    templateId: id,
    groupId: typeof body.group_id === 'string' ? body.group_id : null,
    title,
    note: typeof body.note === 'string' ? body.note.trim() || null : null,
    orderIndex: typeof body.order_index === 'number' ? body.order_index : 0,
  })

  return NextResponse.json(row, { status: 201 })
}
