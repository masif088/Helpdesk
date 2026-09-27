/**
 * POST /api/cron/process-recurring-tickets
 * Called every minute by Cloud Scheduler (see docs/cron-jobs.md).
 * Finds all active recurring rules whose nextRunAt <= now, creates the ticket,
 * logs the run, and schedules the next run.
 */
import { NextRequest, NextResponse } from 'next/server'

import { companyDefaultRate } from '@/lib/billing-rate-server'
import { isCronRequest } from '@/lib/cron-auth'
import { find, insert, insertIgnore, recurringTicketRuns, recurringTickets, ticketAssignees, tickets, update } from '@/lib/fsdb'
import { sendRecurringTicketCreatedEmail } from '@/lib/recurring-ticket-email'
import { computeNextRunAt, type Frequency } from '@/lib/recurring-ticket-schedule'
import { applyRecurringTicketTemplate } from '@/lib/recurring-ticket-template'
import { assignCompanySupportTicketRank, assignCreatorSupportTicketRank, parseCompanyTicketDesiredRank, resolveSupportQueueScope } from '@/lib/ticket-company-priority-order'

export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Find all active rules whose nextRunAt is due
  const due = await find(recurringTickets, {
    where: [
      ['isActive', '==', true],
      ['nextRunAt', '<=', now],
    ],
  })

  if (due.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let created = 0
  let failed = 0

  for (const rule of due) {
    try {
      const desiredRank = parseCompanyTicketDesiredRank(rule.ticketPriority ?? 0)
      const resolvedTitle = applyRecurringTicketTemplate(rule.title, now)
      const resolvedDescription = rule.description
        ? applyRecurringTicketTemplate(rule.description, now)
        : null
      let newTicket: { id: number } | undefined

      {
        // Create ticket
        const row = await insert(tickets, {
          title: resolvedTitle,
          description: resolvedDescription,
          status: rule.ticketStatus ?? 'open',
          priority: rule.companyId ? null : (rule.ticketPriority || null),
          teamId: rule.teamId ?? null,
          companyId: rule.companyId ?? null,
          typeId: rule.ticketTypeId ?? null,
          createdBy: rule.createdBy ?? null,
          contactUserId: rule.contactUserId ?? null,
          createdVia: 'recurring',
          ticketType: 'support',
          ...(await companyDefaultRate(rule.companyId)),
        })

        // Assign company / creator support queue rank
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

      // Compute next run
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
      // Always start next-run search from tomorrow midnight to avoid double-firing on the same day
      const tomorrowMidnight = new Date(now)
      tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1)
      tomorrowMidnight.setUTCHours(0, 0, 0, 0)
      const nextRunAt = computeNextRunAt(schedule, tomorrowMidnight)

      // Update rule — set lastRunAt and nextRunAt (null if expired)
      await update(recurringTickets, rule.id, {
        lastRunAt: now,
        nextRunAt: nextRunAt ?? null,
        // Deactivate if past endDate and no future run
        isActive: nextRunAt !== null ? rule.isActive : false,
        updatedAt: now,
      })

      // Log run
      await insert(recurringTicketRuns, {
        recurringTicketId: rule.id,
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
          `[recurring-tickets] Email failed for rule ${rule.id} ticket #${newTicket.id}:`,
          emailErr
        )
      }

      created++
    } catch (err) {
      failed++
      console.error(`[recurring-tickets] Failed to process rule ${rule.id}:`, err)

      // Log failed run
      await insert(recurringTicketRuns, {
        recurringTicketId: rule.id,
        ticketId: null,
        ranAt: now,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ processed: due.length, created, failed })
}
