import { NextRequest, NextResponse } from 'next/server'

import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { cronSecret, isCronRequest } from '@/lib/cron-auth'
import { automationRules, find, tickets } from '@/lib/fsdb'

export async function POST(req: NextRequest) {
  // Scheduler secret required; without a configured secret only local dev may call it
  const allowed = isCronRequest(req) || (!cronSecret() && process.env.NODE_ENV !== 'production')
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load all active time_trigger rules
  const rules = await find(automationRules, {
    where: [
      ['eventType', '==', 'time_trigger'],
      ['status', '==', true],
    ],
  })

  if (rules.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No active time_trigger rules' })
  }

  // Load all non-closed tickets updated more than 1 day ago (minimum window to avoid over-processing)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const candidates = (await find(tickets, { where: [['updatedAt', '<', oneDayAgo]] })).filter(
    (t) => t.status !== 'closed'
  )

  let processed = 0
  let triggered = 0

  for (const ticket of candidates) {
    const ctx = await loadAutomationTicketContext(ticket.id)
    if (!ctx) continue

    const daysSinceUpdated = ticket.updatedAt
      ? (Date.now() - new Date(ticket.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      : null

    const ctxWithTime = { ...ctx, days_since_updated: daysSinceUpdated }

    await runAutomationRules('time_trigger', ctxWithTime)
    processed++
    triggered++
  }

  return NextResponse.json({ ok: true, processed, triggered, rules: rules.length })
}
