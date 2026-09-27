import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessMessageTemplates } from '@/lib/auth-utils'
import { get, messageTemplates, update } from '@/lib/fsdb'

function assertAdmin(session: { user?: { role?: string } } | null) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  if (!canAccessMessageTemplates(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** GET /api/message-templates/[id] */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const deny = assertAdmin(session)
  if (deny) return deny

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const row = await get(messageTemplates, id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    type: row.type,
    group: row.templateGroup,
    title: row.title,
    key: row.key,
    status: row.status,
    email_subject: row.emailSubject ?? null,
    content: row.content ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}

/** PATCH /api/message-templates/[id] — body: { content?, status?, email_subject?, title?, group? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const deny = assertAdmin(session)
  if (deny) return deny

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { content, status, email_subject, title, group } = body as {
    content?: string | null
    status?: string
    email_subject?: string | null
    title?: string
    group?: string
  }

  const updates: Partial<typeof messageTemplates.$inferInsert> = {
    updatedAt: new Date(),
  }
  let touched = false

  if (title !== undefined) {
    const t = String(title).trim()
    if (!t) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    updates.title = t
    touched = true
  }
  if (group !== undefined) {
    updates.templateGroup = String(group).trim() || 'general'
    touched = true
  }
  if (content !== undefined) {
    updates.content = content === null || content === '' ? null : String(content)
    touched = true
  }
  if (email_subject !== undefined) {
    updates.emailSubject = email_subject === null || email_subject === '' ? null : String(email_subject)
    touched = true
  }
  if (status !== undefined) {
    const s = String(status).toLowerCase()
    if (s !== 'active' && s !== 'inactive') {
      return NextResponse.json({ error: 'status must be active or inactive' }, { status: 400 })
    }
    updates.status = s
    touched = true
  }

  if (!touched) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const row = await update(messageTemplates, id, updates)

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    type: row.type,
    group: row.templateGroup,
    title: row.title,
    key: row.key,
    status: row.status,
    email_subject: row.emailSubject ?? null,
    content: row.content ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}
