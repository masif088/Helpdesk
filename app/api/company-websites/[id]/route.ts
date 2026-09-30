import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'
import { companyWebsites, get, type Patch, remove, update, updateWhere } from '@/lib/fsdb'

/** PATCH /api/company-websites/[id] */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const { id } = await params
  const body = await request.json()
  const { url, title, description, is_primary, company_id } = body

  const existing = await get(companyWebsites, id)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const cid = company_id ?? existing.companyId
  if (is_primary) {
    await updateWhere(companyWebsites, [['companyId', '==', cid]], { isPrimary: false })
  }

  const updateData: Patch<typeof companyWebsites.$inferSelect> = {}
  if (url !== undefined) updateData.url = url
  if (title !== undefined) updateData.title = title || null
  if (description !== undefined) updateData.description = description || null
  if (is_primary !== undefined) updateData.isPrimary = is_primary
  updateData.updatedAt = new Date()

  const row = await update(companyWebsites, id, updateData)

  if (!row) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: row.id,
      company_id: row.companyId,
      url: row.url,
      title: row.title,
      description: row.description,
      is_primary: row.isPrimary ?? false,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
    },
    success: true,
  })
}

/** DELETE /api/company-websites/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const { id } = await params
  await remove(companyWebsites, id)
  return NextResponse.json({ success: true })
}
