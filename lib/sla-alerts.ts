/**
 * SLA alerts as bell notifications (run with the hourly inbox reminders):
 *   - a clock is about to run out (under 20% of the target left): the ticket's assignees (admins / managers when nobody is assigned)
 *   - a clock ran out: the assignees and the admins / managers
 * Clocks that are stopped (waiting on the client) raise no alert. Each alert is sent once per ticket and clock (`tickets.slaNotified`).
 */
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { find, ticketAssignees, tickets, update, users } from '@/lib/fsdb'
import { getTicketSla, loadSlaContext, slaTargetFor } from '@/lib/sla'
import { formatSlaDuration } from '@/lib/sla-format'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

const CLOSED_LIKE = ['resolved', 'closed', 'completed', 'cancel', 'archived', 'pending']

export type SlaAlertResult = { checked: number; warned: string[]; breached: string[] }

/** `dryRun` lists what would be notified without notifying or marking anything. */
export async function runSlaAlerts(opts: { dryRun?: boolean } = {}): Promise<SlaAlertResult> {
  const [ctx, open, managers] = await Promise.all([
    loadSlaContext(),
    find(tickets, {
      where: [
        ['ticketType', '==', DEFAULT_TICKET_TYPE],
        ['status', 'not-in', CLOSED_LIKE],
      ],
      select: ['id', 'title', 'status', 'ticketType', 'typeId', 'companyId', 'createdAt', 'slaNotified'],
    }),
    find(users, { where: [['role', 'in', ['admin', 'manager']]] }),
  ])
  const managerIds = managers.filter((u) => !u.deletedAt && u.status !== 'inactive').map((u) => u.id)
  const result: SlaAlertResult = { checked: 0, warned: [], breached: [] }

  for (const t of open) {
    if (!slaTargetFor(ctx, t)) continue
    result.checked++
    const sla = await getTicketSla(t.id, ctx)
    if (!sla) continue
    const sent = { ...(t.slaNotified ?? {}) }
    let changed = false
    const assignees = (await find(ticketAssignees, { where: [['ticketId', '==', t.id]], select: ['userId'] })).map((a) => a.userId)

    for (const [name, c] of [['respond', sla.respond], ['resolve', sla.resolve]] as const) {
      // A clock that is stopped (waiting on the client) raises no new alert
      if (!c || c.doneAt || c.paused || (c.state !== 'at_risk' && c.state !== 'breached')) continue
      const kind = c.state === 'breached' ? 'breach' : 'warn'
      if (sent[`${name}_${kind}`] || (kind === 'warn' && sent[`${name}_breach`])) continue
      const what = name === 'respond' ? 'first response' : 'resolution'
      const label = `#${t.id} ${t.title}`
      if (kind === 'warn') result.warned.push(`${label} (${what})`)
      else result.breached.push(`${label} (${what})`)
      if (!opts.dryRun) {
        await notifyTicketUsers({
          recipientUserIds: kind === 'breach' ? [...assignees, ...managerIds] : assignees.length ? assignees : managerIds,
          ticketId: t.id,
          ticketTitle: t.title,
          type: kind === 'breach' ? 'sla_breach' : 'sla_warning',
          title: kind === 'breach' ? `SLA breached: ${what}` : `SLA at risk: ${what}`,
          body:
            kind === 'breach'
              ? `"${t.title}" is ${formatSlaDuration(c.remainingSeconds ?? 0)} past its ${what} target (${formatSlaDuration(c.targetMinutes * 60)})`
              : `"${t.title}" has ${formatSlaDuration(c.remainingSeconds ?? 0)} left for its ${what} target (${formatSlaDuration(c.targetMinutes * 60)})`,
          actorUserId: 'system',
          actorName: 'SLA',
          actorRole: 'system',
        })
        sent[`${name}_${kind}`] = new Date().toISOString()
        changed = true
      }
    }
    if (changed) await update(tickets, t.id, { slaNotified: sent })
  }
  return result
}
