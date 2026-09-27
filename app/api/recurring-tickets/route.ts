import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { find, insert, recurringTickets } from '@/lib/fsdb'
import { computeNextRunAt, type Frequency, normalizeSpecificDates } from '@/lib/recurring-ticket-schedule'

function authError() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
function forbiddenError() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** GET /api/recurring-tickets — list all rules */
export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return authError()
  const role = (session.user as { role?: string }).role
  if (!isAdminOrManager(role)) return forbiddenError()

  const rows = await find(recurringTickets, { orderBy: [['createdAt', 'asc']] })

  return NextResponse.json({ data: rows })
}

/** POST /api/recurring-tickets — create a new recurring rule */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return authError()
  const role = (session.user as { role?: string }).role
  if (!isAdminOrManager(role)) return forbiddenError()

  const body = await req.json().catch(() => ({}))
  const {
    title,
    description,
    frequency,
    specific_days,
    specific_date,
    interval_days,
    time_of_day = '08:00',
    timezone = 'UTC',
    start_date,
    end_date,
    ticket_status,
    ticket_priority,
    team_id,
    company_id,

    ticket_type_id,
    contact_user_id,
    assignee_ids,
  } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!frequency) {
    return NextResponse.json({ error: 'frequency is required' }, { status: 400 })
  }
  if (!start_date) {
    return NextResponse.json({ error: 'start_date is required' }, { status: 400 })
  }

  const validFrequencies: Frequency[] = ['daily', 'weekdays', 'weekends', 'specific_days', 'specific_date', 'interval']
  if (!validFrequencies.includes(frequency)) {
    return NextResponse.json({ error: 'invalid frequency' }, { status: 400 })
  }

  const specificDates = frequency === 'specific_date' ? normalizeSpecificDates(specific_date) : []
  if (frequency === 'specific_date' && specificDates.length === 0) {
    return NextResponse.json({ error: 'Select at least one day of the month' }, { status: 400 })
  }

  const schedule = {
    frequency,
    specificDays: specific_days ?? null,
    specificDate: frequency === 'specific_date' ? specificDates : null,
    intervalDays: interval_days ?? null,
    timeOfDay: time_of_day,
    timezone,
    startDate: start_date,
    endDate: end_date ?? null,
  }

  const nextRunAt = computeNextRunAt(schedule, new Date())

  const row = await insert(recurringTickets, {
      title: title.trim(),
      description: description ?? null,
      frequency,
      specificDays: specific_days ?? null,
      specificDate: frequency === 'specific_date' ? specificDates : null,
      intervalDays: interval_days ?? null,
      timeOfDay: time_of_day,
      timezone,
      startDate: start_date,
      endDate: end_date ?? null,
      isActive: true,
      nextRunAt: nextRunAt ?? undefined,
      ticketStatus: ticket_status ?? null,
      ticketPriority: ticket_priority || null,
      teamId: team_id ?? null,
      companyId: company_id ?? null,

      ticketTypeId: ticket_type_id ?? null,
      contactUserId: contact_user_id ?? null,
      assigneeIds: Array.isArray(assignee_ids) ? assignee_ids : [],
      createdBy: session.user.id,
    })

  return NextResponse.json({ data: row }, { status: 201 })
}
