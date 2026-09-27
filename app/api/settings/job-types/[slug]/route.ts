import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { findOneBy, get, jobTypes, remove, ticketTimeTracker, update } from '@/lib/fsdb'
import { normalizeJobTypeTitle, parseJobTypeSortOrder } from '@/lib/job-types-admin'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'

const JOB_TYPE_LOG_KEYS = ['title', 'sort_order', 'is_active', 'billable']

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
    billable: r.billable !== false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }
}

/** PATCH — update title, sort_order, is_active, billable (slug is path key, not renamed here) */
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

  const updates: Partial<{ title: string; sortOrder: number; isActive: boolean; billable: boolean }> = {}

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
    updates.isActive = Boolean(body.is_active)
  }
  if (body.billable !== undefined) {
    updates.billable = Boolean(body.billable)
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
    billable: r.billable !== false,
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

/** DELETE — only when no time entry uses this job type (otherwise deactivate it). */
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

  const exists = await get(jobTypes, slug)
  if (!exists) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (await findOneBy(ticketTimeTracker, { jobType: slug })) {
    return NextResponse.json(
      { error: 'This job type is used by time entries. Deactivate it instead of deleting.' },
      { status: 409 }
    )
  }

  try {
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
