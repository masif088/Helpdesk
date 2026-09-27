import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessRecurringTickets } from '@/lib/auth-utils'
import { get, insert, insertIgnore, recurringTicketRuns, recurringTickets, ticketAssignees, tickets, update } from '@/lib/fsdb'
import { sendRecurringTicketCreatedEmail } from '@/lib/recurring-ticket-email'
import { computeNextRunAt, type Frequency } from '@/lib/recurring-ticket-schedule'
import { applyRecurringTicketTemplate } from '@/lib/recurring-ticket-template'
import { assignCompanySupportTicketRank, assignCreatorSupportTicketRank, parseCompanyTicketDesiredRank, resolveSupportQueueScope } from '@/lib/ticket-company-priority-order'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessRecurringTickets((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const rule = await get(recurringTickets, id)
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  try {
    const desiredRank = parseCompanyTicketDesiredRank(rule.ticketPriority ?? 0)
    const resolvedTitle = applyRecurringTicketTemplate(rule.title, now)
    const resolvedDescription = rule.description
      ? applyRecurringTicketTemplate(rule.description, now)
      : null
    let newTicket: { id: number } | undefined

    {
      const row = await insert(tickets, {
        title: resolvedTitle,
        description: resolvedDescription,
        status: rule.ticketStatus ?? 'open',
        priority: rule.companyId ? null : (rule.ticketPriority || null),
        teamId: rule.teamId ?? null,
        companyId: rule.companyId ?? null,
        typeId: rule.ticketTypeId ?? null,
        visibility: rule.visibility ?? 'team',
        createdBy: rule.createdBy ?? null,
        contactUserId: rule.contactUserId ?? null,
        createdVia: 'recurring',
        ticketType: 'support',
      })

      const scope = await resolveSupportQueueScope(row.id)
      if (scope) {
        if (scope.kind === 'company') {
          await assignCompanySupportTicketRank(scope.companyId, row.id, desiredRank)
        } else {
          await assignCreatorSupportTicketRank(scope.userId, row.id, desiredRank)
        }
      }

      const assigneeIds = Array.isArray(rule.assigneeIds) ? rule.assigneeIds as string[] : []
      for (const userId of assigneeIds) await insertIgnore(ticketAssignees, { ticketId: row.id, userId })

      newTicket = row
    }

    if (!newTicket) throw new Error('Failed to insert ticket')

    const schedule = {
      frequency: rule.frequency as Frequency,
      specificDays: rule.specificDays as number[] | null,
      specificDate: rule.specificDate,
      intervalDays: rule.intervalDays,
      timeOfDay: rule.timeOfDay,
      timezone: rule.timezone,
      startDate: rule.startDate,
      endDate: rule.endDate ?? null,
    }
    // Always schedule next run from tomorrow midnight so the cron doesn't fire again today
    const tomorrowMidnight = new Date(now)
    tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1)
    tomorrowMidnight.setUTCHours(0, 0, 0, 0)
    const nextRunAt = computeNextRunAt(schedule, tomorrowMidnight)

    await update(recurringTickets, id, { lastRunAt: now, nextRunAt: nextRunAt ?? null, updatedAt: now })

    await insert(recurringTicketRuns, {
      recurringTicketId: id,
      ticketId: newTicket.id,
      ranAt: now,
      status: 'success',
    })

    try {
      await sendRecurringTicketCreatedEmail({
        ticketId: newTicket.id,
        ticketTitle: resolvedTitle,
        companyId: rule.companyId ?? null,
        contactUserId: rule.contactUserId ?? null,
        createdByUserId: rule.createdBy ?? null,
      })
    } catch (emailErr) {
      console.error(
        `[recurring-tickets] Email failed for rule ${id} ticket #${newTicket.id}:`,
        emailErr
      )
    }

    return NextResponse.json({ ok: true, ticketId: newTicket.id })
  } catch (err) {
    await insert(recurringTicketRuns, {
      recurringTicketId: id,
      ticketId: null,
      ranAt: now,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {})

    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
