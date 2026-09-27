import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { find, insert, jobTypes, UniqueViolationError } from '@/lib/fsdb'
import {
  normalizeJobTypeSlug,
  normalizeJobTypeTitle,
  parseJobTypeSortOrder,
} from '@/lib/job-types-admin'
import { logSettingsCreated } from '@/lib/settings-activity-log'

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

/** GET — all job types (admin), including inactive */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const forbid = assertAdmin(role)
  if (forbid) return forbid

  const rows = await find(jobTypes, { orderBy: [['sortOrder', 'asc'], ['slug', 'asc']] })

  return NextResponse.json(rows.map(serializeRow))
}

/** POST — create job type */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const forbid = assertAdmin(role)
  if (forbid) return forbid

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const slug = normalizeJobTypeSlug(body.slug)
  const title = normalizeJobTypeTitle(body.title)
  if (!slug || !title) {
    return NextResponse.json(
      { error: 'Invalid slug (use a–z, 0–9, underscore, max 64) or missing title' },
      { status: 400 }
    )
  }

  const [top] = await find(jobTypes, { orderBy: [['sortOrder', 'desc']], limit: 1 })
  const mx = top ? Number(top.sortOrder) : 0
  const sortFallback = Number.isFinite(mx) ? mx + 1 : 1
  const sortOrder = parseJobTypeSortOrder(body.sort_order, sortFallback)
  const isActive =
    body.is_active === undefined || body.is_active === null ? true : Boolean(body.is_active)

  try {
    const row = await insert(jobTypes, {
      slug,
      title,
      sortOrder,
      isActive,
    })

    await logSettingsCreated({
      session,
      entityType: 'job_type',
      entityId: row.slug,
      label: row.title,
      snapshot: serializeRow(row),
    })

    return NextResponse.json(serializeRow(row))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (e instanceof UniqueViolationError || msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    console.error('[POST /api/settings/job-types]', e)
    return NextResponse.json({ error: 'Could not create job type' }, { status: 500 })
  }
}
