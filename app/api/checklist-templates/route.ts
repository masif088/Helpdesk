
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateGroups, checklistTemplateItems, checklistTemplates, find, insert } from '@/lib/fsdb'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = (await find(checklistTemplates, { orderBy: [['title', 'asc']] })).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }))

  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const userId = (session.user as { id?: string }).id ?? null

  const row = await insert(checklistTemplates, {
    title,
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
    createdByUserId: userId,
  })

  // If groups were included in the payload, insert them with their items
  if (Array.isArray(body.groups)) {
    for (const g of body.groups as { title: string; order_index?: number; items?: { title: string; order_index?: number }[] }[]) {
      const gTitle = typeof g.title === 'string' ? g.title.trim() : ''
      if (!gTitle) continue
      const gRow = await insert(checklistTemplateGroups, { templateId: row.id, title: gTitle, orderIndex: g.order_index ?? 0 })
      for (const item of g.items ?? []) {
        const iTitle = typeof item.title === 'string' ? item.title.trim() : ''
        if (!iTitle) continue
        await insert(checklistTemplateItems, {
          templateId: row.id,
          groupId: gRow.id,
          title: iTitle,
          orderIndex: item.order_index ?? 0,
        })
      }
    }
  }

  // Items without groups
  if (Array.isArray(body.items)) {
    for (const item of body.items as { title: string; order_index?: number }[]) {
      const iTitle = typeof item.title === 'string' ? item.title.trim() : ''
      if (!iTitle) continue
      await insert(checklistTemplateItems, {
        templateId: row.id,
        groupId: null,
        title: iTitle,
        orderIndex: item.order_index ?? 0,
      })
    }
  }

  return NextResponse.json(row, { status: 201 })
}
