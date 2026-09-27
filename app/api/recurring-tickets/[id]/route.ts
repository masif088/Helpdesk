import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { deleteRecurringTicketCascade, find, get, recurringTicketRuns, recurringTickets, update } from '@/lib/fsdb'
import { computeNextRunAt, type Frequency, normalizeSpecificDates } from '@/lib/recurring-ticket-schedule'
import { isTicketVisibilityLevel } from '@/lib/ticket-visibility'

function authError() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
function forbiddenError() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** GET /api/recurring-tickets/[id] — detail + last 20 runs */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return authError()
  const role = (session.user as { role?: string }).role
  if (!isAdminOrManager(role)) return forbiddenError()

  const { id } = await params

  const rule = await get(recurringTickets, id)

  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const runs = await find(recurringTicketRuns, {
    where: [['recurringTicketId', '==', id]],
    orderBy: [['ranAt', 'desc']],
    limit: 20,
  })

  return NextResponse.json({ data: rule, runs })
}

/** PATCH /api/recurring-tickets/[id] — update rule */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return authError()
  const role = (session.user as { role?: string }).role
  if (!isAdminOrManager(role)) return forbiddenError()

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const existing = await get(recurringTickets, id)

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const validFrequencies: Frequency[] = ['daily', 'weekdays', 'weekends', 'specific_days', 'specific_date', 'interval']

  const updates: Partial<typeof existing> = {}

  if (body.title !== undefined) updates.title = String(body.title).trim()
  if (body.description !== undefined) updates.description = body.description ?? null
  if (body.frequency !== undefined) {
    if (!validFrequencies.includes(body.frequency)) {
      return NextResponse.json({ error: 'invalid frequency' }, { status: 400 })
    }
    updates.frequency = body.frequency
  }
  if (body.specific_days !== undefined) updates.specificDays = body.specific_days ?? null
  if (body.specific_date !== undefined) {
    const dates = normalizeSpecificDates(body.specific_date)
    const nextFrequency = (body.frequency ?? existing.frequency) as Frequency
    if (nextFrequency === 'specific_date' && dates.length === 0) {
      return NextResponse.json({ error: 'Select at least one day of the month' }, { status: 400 })
    }
    updates.specificDate = nextFrequency === 'specific_date' ? dates : null
  }
  if (body.interval_days !== undefined) updates.intervalDays = body.interval_days ?? null
  if (body.time_of_day !== undefined) updates.timeOfDay = body.time_of_day
  if (body.timezone !== undefined) updates.timezone = body.timezone
  if (body.start_date !== undefined) updates.startDate = body.start_date
  if (body.end_date !== undefined) updates.endDate = body.end_date ?? null
  if (body.is_active !== undefined) updates.isActive = Boolean(body.is_active)
  if (body.ticket_status !== undefined) updates.ticketStatus = body.ticket_status ?? null
  if (body.ticket_priority !== undefined) updates.ticketPriority = body.ticket_priority || null
  if (body.team_id !== undefined) updates.teamId = body.team_id ?? null
  if (body.company_id !== undefined) updates.companyId = body.company_id ?? null

  if (body.ticket_type_id !== undefined) updates.ticketTypeId = body.ticket_type_id ?? null
  if (body.contact_user_id !== undefined) updates.contactUserId = body.contact_user_id ?? null
  if (body.assignee_ids !== undefined) updates.assigneeIds = Array.isArray(body.assignee_ids) ? body.assignee_ids : []
  if (body.visibility !== undefined) {
    if (!isTicketVisibilityLevel(body.visibility)) {
      return NextResponse.json({ error: 'invalid visibility' }, { status: 400 })
    }
    updates.visibility = body.visibility
  }

  // Recompute nextRunAt if schedule-affecting fields changed
  const scheduleFields = ['frequency', 'specific_days', 'specific_date', 'interval_days', 'time_of_day', 'timezone', 'start_date', 'end_date', 'is_active']
  const scheduleChanged = scheduleFields.some(f => f in body)

  if (scheduleChanged) {
    const merged = { ...existing, ...updates }
    if (merged.isActive) {
      const schedule = {
        frequency: merged.frequency as Frequency,
        specificDays: merged.specificDays as number[] | null,
        specificDate: merged.specificDate,
        intervalDays: merged.intervalDays,
        timeOfDay: merged.timeOfDay,
        timezone: merged.timezone,
        startDate: merged.startDate,
        endDate: merged.endDate,
      }
      updates.nextRunAt = computeNextRunAt(schedule, new Date()) ?? null
    } else {
      updates.nextRunAt = null
    }
  }

  updates.updatedAt = new Date()

  const updated = await update(recurringTickets, id, updates)

  return NextResponse.json({ data: updated })
}

/** DELETE /api/recurring-tickets/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return authError()
  const role = (session.user as { role?: string }).role
  if (!isAdminOrManager(role)) return forbiddenError()

  const { id } = await params

  await deleteRecurringTicketCascade(id)

  return NextResponse.json({ ok: true })
}
