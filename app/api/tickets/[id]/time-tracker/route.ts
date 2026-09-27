import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin, isAdminOrManager } from '@/lib/auth-utils'
import { find, get, getManyMap, insert, remove, ticketTimeTracker, update, users } from '@/lib/fsdb'
import { assertValidJobTypeSlugOrNull, loadActiveJobTypeTitleMap } from '@/lib/job-types-db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

/** When body omits `job_type` key entirely, returns `undefined` so callers can skip updating the column. */
const MAX_NOTE_LENGTH = 2000

function normalizeNoteFromBodyOptional(body: Record<string, unknown>): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, 'note')) return undefined
  const raw = body.note
  if (raw === null || raw === undefined) {
    throw new Error('Note is required')
  }
  if (typeof raw !== 'string') {
    throw new Error('note must be a string')
  }
  const s = raw.trim()
  if (s === '') {
    throw new Error('Note is required')
  }
  return s.slice(0, MAX_NOTE_LENGTH)
}

async function normalizeJobTypeFromBodyOptional(
  body: Record<string, unknown>
): Promise<string | null | undefined> {
  if (!Object.prototype.hasOwnProperty.call(body, 'job_type')) return undefined
  const raw = body.job_type
  if (raw === null || raw === undefined || raw === '') {
    throw new Error('Job type is required')
  }
  if (typeof raw !== 'string') {
    throw new Error('job_type must be a string')
  }
  const s = raw.trim().slice(0, 64)
  if (s === '') {
    throw new Error('Job type is required')
  }
  await assertValidJobTypeSlugOrNull(s)
  return s
}

/** Job type is mandatory for new time entries (start / manual). */
async function normalizeJobTypeFromBodyRequired(body: Record<string, unknown>): Promise<string> {
  const v = await normalizeJobTypeFromBodyOptional(body)
  if (v == null) throw new Error('Job type is required')
  return v
}

function mapTrackerRow(
  t: typeof ticketTimeTracker.$inferSelect,
  user: typeof users.$inferSelect | null = null,
  titleMap?: Map<string, string>
) {
  const slug = t.jobType ?? null
  const job_type_title = slug && titleMap?.get(slug) != null ? titleMap.get(slug) ?? null : null
  return {
    id: t.id,
    ticketId: t.ticketId,
    userId: t.userId,
    tracker_type: t.trackerType,
    job_type: slug,
    job_type_title,
    start_time: t.startTime,
    stop_time: t.stopTime,
    duration_seconds: t.durationSeconds,
    duration_adjustment: t.durationAdjustment,
    reported_duration_seconds: reportedDurationSeconds({
      durationSeconds: t.durationSeconds,
      durationAdjustment: t.durationAdjustment,
    }),
    note: t.note ?? null,
    created_at: t.createdAt,
    user: user
      ? { id: user.id, full_name: user.fullName, email: user.email, avatar_url: user.avatarUrl }
      : null,
  }
}

/**
 * GET /api/tickets/[id]/time-tracker — list sessions. ?active=1 = current user's active timer only.
 * Optional ?start=&end= (ISO): keep sessions whose interval overlaps that window (same rule as customer-time report).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const url = new URL(request.url)
  const activeOnly = url.searchParams.get('active') === '1'

  const startP = url.searchParams.get('start')?.trim()
  const endP = url.searchParams.get('end')?.trim()
  const startFilter = startP ? new Date(startP) : null
  const endFilter = endP ? new Date(endP) : null

  let trackers = activeOnly
    ? await find(ticketTimeTracker, {
        where: [
          ['ticketId', '==', ticketId],
          ['userId', '==', session.user.id],
          ['stopTime', '==', null],
          ['trackerType', '==', 'timer'],
        ],
        orderBy: [['createdAt', 'desc']],
        limit: 1,
      })
    : await find(ticketTimeTracker, { where: [['ticketId', '==', ticketId]], orderBy: [['createdAt', 'desc']] })
  if (!activeOnly) {
    // Overlap report window: start_time <= end AND coalesce(stop_time, now()) >= start
    const nowMs = Date.now()
    if (endFilter && !Number.isNaN(endFilter.getTime())) {
      trackers = trackers.filter((t) => t.startTime.getTime() <= endFilter.getTime())
    }
    if (startFilter && !Number.isNaN(startFilter.getTime())) {
      trackers = trackers.filter((t) => (t.stopTime?.getTime() ?? nowMs) >= startFilter.getTime())
    }
    trackers = trackers.slice(0, 100)
  }
  const userById = await getManyMap(users, trackers.map((t) => t.userId))
  const rows = trackers.map((tracker) => ({ tracker, user: userById.get(tracker.userId) ?? null }))

  const titleMap = await loadActiveJobTypeTitleMap()
  const result = rows.map((r) => mapTrackerRow(r.tracker, r.user, titleMap))

  return NextResponse.json(activeOnly ? (result[0] ?? null) : result)
}

/** POST /api/tickets/[id]/time-tracker - Start or stop */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role
  const admin = isAdmin(role)

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = (await request.json()) as Record<string, unknown>
  const action = body.action // 'start' | 'stop'

  if (action === 'start') {
    let jobTypeVal: string
    try {
      jobTypeVal = await normalizeJobTypeFromBodyRequired(body)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
    const values: typeof ticketTimeTracker.$inferInsert = {
      ticketId: ticketId,
      userId: session.user.id,
      trackerType: 'timer',
      jobType: jobTypeVal,
      startTime: new Date(),
    }
    const row = await insert(ticketTimeTracker, values)

    const titleMap = await loadActiveJobTypeTitleMap()
    return NextResponse.json(mapTrackerRow(row, null, titleMap))
  }

  if (action === 'manual') {
    const durationSecondsRaw = body.duration_seconds
    const startedAtRaw = body.started_at ?? body.recorded_at
    const startedAt = startedAtRaw ? new Date(startedAtRaw as string) : new Date()
    const durationSeconds =
      typeof durationSecondsRaw === 'number'
        ? Math.floor(durationSecondsRaw)
        : parseInt(String(durationSecondsRaw), 10)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json({ error: 'duration_seconds must be a positive number' }, { status: 400 })
    }
    if (Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid started_at' }, { status: 400 })
    }
    const MAX = 2147483647
    const capped = Math.min(durationSeconds, MAX)
    const startTime = startedAt
    const stopTime = new Date(startedAt.getTime() + capped * 1000)
    const nowMs = Date.now()
    if (startTime.getTime() > nowMs || stopTime.getTime() > nowMs) {
      return NextResponse.json(
        { error: 'Worked time cannot be in the future (max: now)' },
        { status: 400 }
      )
    }

    let targetUserId = session.user.id
    if (admin && body.user_id != null && String(body.user_id).trim() !== '') {
      const uid = String(body.user_id).trim()
      const target = await get(users, uid)
      if (!target) {
        return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 })
      }
      targetUserId = uid
    }

    let jobTypeVal: string
    try {
      jobTypeVal = await normalizeJobTypeFromBodyRequired(body)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
    const manualValues: typeof ticketTimeTracker.$inferInsert = {
      ticketId,
      userId: targetUserId,
      trackerType: 'manual',
      jobType: jobTypeVal,
      startTime,
      stopTime,
      durationSeconds: capped,
      durationAdjustment: capped,
    }
    const row = await insert(ticketTimeTracker, manualValues)

    const titleMap = await loadActiveJobTypeTitleMap()
    return NextResponse.json(mapTrackerRow(row, null, titleMap))
  }

  if (action === 'stop') {
    const sessionIdRaw = body.session_id
    if (typeof sessionIdRaw !== 'string' || sessionIdRaw.trim() === '') {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    }
    const sessionId = sessionIdRaw.trim()
    const stopTime = new Date()

    const active = await get(ticketTimeTracker, sessionId)

    if (!active || (active.userId !== session.user.id && !admin)) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (active.trackerType !== 'timer') {
      return NextResponse.json({ error: 'Only timer sessions can be stopped here' }, { status: 400 })
    }
    if (active.stopTime) {
      return NextResponse.json({ error: 'Session already stopped' }, { status: 400 })
    }

    const startTime = new Date(active.startTime)
    let durationSeconds = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
    const MAX = 2147483647
    if (durationSeconds > MAX) durationSeconds = MAX
    if (durationSeconds < 0) durationSeconds = 0

    await update(ticketTimeTracker, sessionId, { stopTime, durationSeconds, durationAdjustment: durationSeconds })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

const MAX_DURATION = 2147483647

/** PATCH — edit completed entry. Times change sets tracker_type to manual; job_type/note-only keeps tracker_type. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role
  const admin = isAdmin(role)

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const sessionId = body.session_id as string | undefined
  const startRaw = body.start_time as string | undefined
  const stopRaw = body.stop_time as string | undefined
  const hasJobTypeKey = Object.prototype.hasOwnProperty.call(body, 'job_type')
  const hasNoteKey = Object.prototype.hasOwnProperty.call(body, 'note')

  const adjustOnly =
    sessionId &&
    body.duration_adjustment !== undefined &&
    startRaw === undefined &&
    stopRaw === undefined

  const metadataOnly =
    sessionId &&
    startRaw === undefined &&
    stopRaw === undefined &&
    body.duration_adjustment === undefined &&
    (hasJobTypeKey || hasNoteKey)

  const titleMap = await loadActiveJobTypeTitleMap()

  if (metadataOnly) {
    let jobTypeVal: string | null | undefined
    let noteVal: string | null | undefined
    try {
      jobTypeVal = await normalizeJobTypeFromBodyOptional(body)
      noteVal = normalizeNoteFromBodyOptional(body)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }

    const row = await get(ticketTimeTracker, sessionId)

    if (!row || row.ticketId !== ticketId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (row.userId !== session.user.id && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const metaSet: Partial<typeof ticketTimeTracker.$inferInsert> = {}
    if (jobTypeVal !== undefined) metaSet.jobType = jobTypeVal
    if (noteVal !== undefined) metaSet.note = noteVal
    if (Object.keys(metaSet).length === 0) {
      return NextResponse.json({ error: 'job_type or note is required' }, { status: 400 })
    }

    const updated = await update(ticketTimeTracker, sessionId, metaSet)

    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    return NextResponse.json(mapTrackerRow(updated, null, titleMap))
  }

  if (adjustOnly) {
    if (!isAdminOrManager(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const adjRaw = body.duration_adjustment
    const adj =
      typeof adjRaw === 'number' ? Math.floor(adjRaw) : parseInt(String(adjRaw), 10)
    if (!Number.isFinite(adj) || adj < 0) {
      return NextResponse.json({ error: 'duration_adjustment must be a non-negative integer' }, { status: 400 })
    }
    const MAX = 2147483647
    const capped = Math.min(adj, MAX)

    let jobTypeVal: string | null | undefined
    if (hasJobTypeKey) {
      try {
        jobTypeVal = await normalizeJobTypeFromBodyOptional(body)
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 })
      }
    }

    const row = await get(ticketTimeTracker, sessionId)

    if (!row || row.ticketId !== ticketId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (!row.stopTime || row.durationSeconds == null) {
      return NextResponse.json(
        { error: 'Only completed sessions can have reported duration adjusted' },
        { status: 400 }
      )
    }

    const setPayload: Partial<typeof ticketTimeTracker.$inferInsert> = { durationAdjustment: capped }
    if (jobTypeVal !== undefined) {
      setPayload.jobType = jobTypeVal
    }

    const updated = await update(ticketTimeTracker, sessionId, setPayload)

    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json(mapTrackerRow(updated, null, titleMap))
  }

  if (!sessionId || !startRaw || !stopRaw) {
    return NextResponse.json(
      {
        error:
          'session_id, start_time, and stop_time are required (or session_id + duration_adjustment for managers, or session_id + job_type/note)',
      },
      { status: 400 }
    )
  }

  const row = await get(ticketTimeTracker, sessionId)

  if (!row || row.ticketId !== ticketId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (row.userId !== session.user.id && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!row.stopTime) {
    return NextResponse.json(
      { error: 'Stop the timer before editing this entry' },
      { status: 400 }
    )
  }

  const startTime = new Date(startRaw)
  const stopTime = new Date(stopRaw)
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(stopTime.getTime())) {
    return NextResponse.json({ error: 'Invalid start_time or stop_time' }, { status: 400 })
  }
  if (stopTime.getTime() <= startTime.getTime()) {
    return NextResponse.json({ error: 'stop_time must be after start_time' }, { status: 400 })
  }

  const nowMs = Date.now()
  if (startTime.getTime() > nowMs || stopTime.getTime() > nowMs) {
    return NextResponse.json(
      { error: 'start_time and stop_time cannot be in the future (max: now)' },
      { status: 400 }
    )
  }

  let durationSeconds = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
  if (durationSeconds > MAX_DURATION) durationSeconds = MAX_DURATION
  if (durationSeconds < 1) {
    return NextResponse.json({ error: 'Duration must be at least 1 second' }, { status: 400 })
  }

  let jobTypeVal: string | null | undefined
  let noteVal: string | null | undefined
  try {
    if (hasJobTypeKey) jobTypeVal = await normalizeJobTypeFromBodyOptional(body)
    if (hasNoteKey) noteVal = normalizeNoteFromBodyOptional(body)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const timesChanged =
    startTime.getTime() !== new Date(row.startTime).getTime() ||
    stopTime.getTime() !== new Date(row.stopTime!).getTime()

  const editSet: Partial<typeof ticketTimeTracker.$inferInsert> = {
    startTime,
    stopTime,
    durationSeconds,
    durationAdjustment: durationSeconds,
  }
  if (timesChanged) {
    editSet.trackerType = 'manual'
  }
  if (jobTypeVal !== undefined) {
    editSet.jobType = jobTypeVal
  }
  if (noteVal !== undefined) {
    editSet.note = noteVal
  }

  const updated = await update(ticketTimeTracker, sessionId, editSet)

  if (!updated) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(mapTrackerRow(updated, null, titleMap))
}

/** DELETE — remove entry (own rows). Query: ?session_id=uuid. Active timer rows can be deleted to discard. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role
  const admin = isAdmin(role)

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id query required' }, { status: 400 })
  }

  const row = await get(ticketTimeTracker, sessionId)

  if (!row || row.ticketId !== ticketId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (row.userId !== session.user.id && !admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await remove(ticketTimeTracker, sessionId)

  return NextResponse.json({ ok: true })
}
