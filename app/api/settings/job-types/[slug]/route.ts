import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { get, jobTypes, remove, ticketTimeTracker, update, updateWhere } from '@/lib/fsdb'
import { normalizeJobTypeTitle, parseJobTypeSortOrder } from '@/lib/job-types-admin'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'

const JOB_TYPE_LOG_KEYS = ['title', 'sort_order', 'is_active']

function assertAdmin(role: string | undefined) {
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

function serializeRow(r: typeof jobTypes.$inferSelect) {
  return {
    slug: r.slug,
    title: r.title,
    sort_order: r.sortOrder,
    is_active: r.isActive,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }
}

/** PATCH — update title, sort_order, is_active (slug is path key, not renamed here) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const forbid = assertAdmin(role)
  if (forbid) return forbid

  const { slug: slugParam } = await params
  const slug = decodeURIComponent(slugParam)

  const existing = await get(jobTypes, slug)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Partial<{ title: string; sortOrder: number; isActive: boolean }> = {}

  if (body.title !== undefined) {
    const title = normalizeJobTypeTitle(body.title)
    if (!title) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
    }
    updates.title = title
  }
  if (body.sort_order !== undefined) {
    updates.sortOrder = parseJobTypeSortOrder(body.sort_order, existing.sortOrder)
  }
  if (body.is_active !== undefined) {
    if (slug === 'other' && body.is_active === false) {
      return NextResponse.json({ error: 'Cannot deactivate the fallback job type "other".' }, { status: 400 })
    }
    updates.isActive = Boolean(body.is_active)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await update(jobTypes, slug, updates)

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const snap = (r: typeof existing) => ({
    title: r.title,
    sort_order: r.sortOrder,
    is_active: r.isActive,
  })
  await logSettingsUpdated({
    session,
    entityType: 'job_type',
    entityId: slug,
    label: updated.title,
    before: snap(existing),
    after: snap(updated),
    keys: JOB_TYPE_LOG_KEYS,
  })

  return NextResponse.json(serializeRow(updated))
}

/**
 * DELETE — remove row; tracker rows referencing this slug are pointed at “other”.
 * Slug “other” cannot be deleted.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const forbid = assertAdmin(role)
  if (forbid) return forbid

  const { slug: slugParam } = await params
  const slug = decodeURIComponent(slugParam)

  if (slug === 'other') {
    return NextResponse.json({ error: 'Cannot delete the fallback job type "other".' }, { status: 400 })
  }

  const exists = await get(jobTypes, slug)
  if (!exists) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await updateWhere(ticketTimeTracker, [['jobType', '==', slug]], { jobType: 'other' })
    await remove(jobTypes, slug)
    await logSettingsDeleted({
      session,
      entityType: 'job_type',
      entityId: slug,
      label: exists.title,
      snapshot: serializeRow(exists),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[DELETE /api/settings/job-types/[slug]]', e)
    return NextResponse.json({ error: 'Could not delete job type' }, { status: 500 })
  }
}
