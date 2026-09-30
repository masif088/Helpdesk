import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { canAccessKnowledgeBase } from '@/lib/auth-utils'
import { get, knowledgeBaseArticles, type Patch, remove, update } from '@/lib/fsdb'
import { articleVisibleForRole, normalizeTargetRolesInput } from '@/lib/knowledge-base-article-roles'

/** GET /api/knowledge-base-articles/[id] - Get single article */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const row = await get(knowledgeBaseArticles, id)

  if (!row) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  const role = (session.user as { role?: string }).role
  const isKbAdmin = canAccessKnowledgeBase(role)
  if (
    !isKbAdmin &&
    (row.status !== 'published' || !articleVisibleForRole(row.targetRoles ?? undefined, role))
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    status: row.status,
    description: row.description ?? '',
    category: row.category ?? 'general',
    sort_order: row.sortOrder ?? 0,
    target_roles: row.targetRoles ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}

/** PATCH /api/knowledge-base-articles/[id] - Update article */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { title, status, description, category, sort_order, target_roles } = body

  const values: Record<string, unknown> = {}
  if (title !== undefined) values.title = String(title).trim()
  if (status !== undefined) values.status = status === 'published' ? 'published' : 'draft'
  if (description !== undefined) values.description = description?.trim() || null
  if (category !== undefined) values.category = category?.trim() || 'general'
  if (sort_order !== undefined) values.sortOrder = Number(sort_order) ?? 0
  if (target_roles !== undefined) values.targetRoles = normalizeTargetRolesInput(target_roles)

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await update(knowledgeBaseArticles, id, values as Patch<typeof knowledgeBaseArticles.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    status: updated.status,
    description: updated.description ?? '',
    category: updated.category ?? 'general',
    sort_order: updated.sortOrder ?? 0,
    target_roles: updated.targetRoles ?? null,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/knowledge-base-articles/[id] - Delete article */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, canAccessKnowledgeBase)
  if (denied) return denied

  const { id } = await params

  const deleted = await remove(knowledgeBaseArticles, id)

  if (!deleted) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
