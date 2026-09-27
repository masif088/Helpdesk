/**
 * POST /api/automation/time-trigger — runs "Time Trigger" automation rules. Scheduled once a day (docs/cron-jobs.md).
 *
 * Each rule fires at most once per idle period of a ticket: after it fires, it is skipped for that ticket until
 * the ticket is updated again (tracked in `tickets.timeTriggerFired`). So running the job more often never
 * repeats notes / tags / status changes.
 */
import { NextRequest, NextResponse } from 'next/server'

import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { cronSecret, isCronRequest } from '@/lib/cron-auth'
import { automationRules, find, tickets, update } from '@/lib/fsdb'
import { withJobRun } from '@/lib/job-runs'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

const DAY_MS = 24 * 60 * 60 * 1000

async function runTimeTriggers(req: NextRequest) {
  // Scheduler secret required; without a configured secret only local dev may call it
  const allowed = isCronRequest(req) || (!cronSecret() && process.env.NODE_ENV !== 'production')
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rules = await find(automationRules, {
    where: [
      ['eventType', '==', 'time_trigger'],
      ['status', '==', true],
    ],
  })
  if (rules.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, fired: 0, message: 'No active time_trigger rules' })
  }
  const ruleIds = rules.map((r) => r.id)

  // Open support tickets idle for at least a day (conditions are in days)
  const oneDayAgo = new Date(Date.now() - DAY_MS)
  const candidates = (await find(tickets, { where: [['updatedAt', '<', oneDayAgo]] })).filter(
    (t) => (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE && !isClosedLikeTicketStatus(t.status)
  )

  let checked = 0
  let fired = 0
  for (const ticket of candidates) {
    const updatedMs = new Date(ticket.updatedAt).getTime()
    const firedMap = ticket.timeTriggerFired ?? {}
    const alreadyFired = (ruleId: number) => {
      const at = firedMap[String(ruleId)]
      return !!at && new Date(at).getTime() >= updatedMs
    }
    // Every rule already fired since the last update → nothing to evaluate (skip the context reads)
    if (ruleIds.every(alreadyFired)) continue

    const ctx = await loadAutomationTicketContext(ticket.id)
    if (!ctx) continue
    checked++

    const matched: number[] = []
    await runAutomationRules(
      'time_trigger',
      { ...ctx, days_since_updated: (Date.now() - updatedMs) / DAY_MS },
      { skipRule: alreadyFired, onRuleMatched: (id) => matched.push(id) }
    )
    if (matched.length > 0) {
      fired += matched.length
      const now = new Date().toISOString()
      const next = { ...firedMap }
      for (const id of matched) next[String(id)] = now
      // Not touching updatedAt: this is bookkeeping, not a ticket change
      await update(tickets, ticket.id, { timeTriggerFired: next })
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, checked, fired, rules: rules.length })
}

/** Records each run for Settings → Scheduled jobs */
export const POST = withJobRun('time-trigger', runTimeTriggers)
