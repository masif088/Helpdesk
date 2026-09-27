import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { globalAnnouncement, upsert } from '@/lib/fsdb'
import {
  getGlobalAnnouncementRow,
  GLOBAL_ANNOUNCEMENT_ROW_ID,
  resolveActiveAnnouncementMessage,
} from '@/lib/global-announcement'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function rowToJson(row: NonNullable<Awaited<ReturnType<typeof getGlobalAnnouncementRow>>>) {
  return {
    message: row.message ?? '',
    is_enabled: row.isEnabled,
    starts_at: row.startsAt ? row.startsAt.toISOString() : null,
    ends_at: row.endsAt ? row.endsAt.toISOString() : null,
    currently_visible: resolveActiveAnnouncementMessage(row) !== null,
    updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}

/** GET — full config (admin). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const row =
      (await getGlobalAnnouncementRow()) ??
      (await upsert(globalAnnouncement, { id: GLOBAL_ANNOUNCEMENT_ROW_ID, message: '', isEnabled: false }))
    return NextResponse.json(rowToJson(row))
  } catch {
    return NextResponse.json({ error: 'Database error while loading the announcement.' }, { status: 500 })
  }
}

/** PATCH — update config (admin). */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message : ''
  const isEnabled = body.is_enabled === true
  const startsRaw = body.starts_at
  const endsRaw = body.ends_at

  let startsAt: Date | null = null
  let endsAt: Date | null = null
  if (startsRaw != null && startsRaw !== '') {
    if (typeof startsRaw !== 'string') {
      return NextResponse.json({ error: 'starts_at must be an ISO date string' }, { status: 400 })
    }
    const d = new Date(startsRaw)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid starts_at' }, { status: 400 })
    }
    startsAt = d
  }
  if (endsRaw != null && endsRaw !== '') {
    if (typeof endsRaw !== 'string') {
      return NextResponse.json({ error: 'ends_at must be an ISO date string' }, { status: 400 })
    }
    const d = new Date(endsRaw)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid ends_at' }, { status: 400 })
    }
    endsAt = d
  }

  if (isEnabled) {
    if (!message.trim()) {
      return NextResponse.json({ error: 'Message is required when the announcement is enabled' }, { status: 400 })
    }
    if (!startsAt || !endsAt) {
      return NextResponse.json({ error: 'Start and end date/time are required when enabled' }, { status: 400 })
    }
    if (startsAt.getTime() >= endsAt.getTime()) {
      return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
    }
  } else if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
    return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
  }

  const updated = await upsert(globalAnnouncement, {
    id: GLOBAL_ANNOUNCEMENT_ROW_ID,
    message: message.trim(),
    isEnabled,
    startsAt,
    endsAt,
    updatedAt: new Date(),
    updatedBy: session.user.id,
  })

  return NextResponse.json(rowToJson(updated))
}
