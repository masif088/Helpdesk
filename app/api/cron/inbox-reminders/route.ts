/**
 * POST /api/cron/inbox-reminders — called hourly by the scheduler (see docs/cron-jobs.md).
 * One reminder per ticket that is still unassigned after Settings → Scheduled jobs → Inbox reminder hours,
 * plus the billing reminders (invoices past their due date, deposits that no longer cover what is owed),
 * the SLA alerts (clocks about to run out / run out) and the monthly retainer invoices.
 */
import { NextRequest, NextResponse } from 'next/server'

import { runBillingReminders } from '@/lib/billing-reminders'
import { isCronRequest } from '@/lib/cron-auth'
import { withJobRun } from '@/lib/job-runs'
import { runRetainerInvoices } from '@/lib/retainer'
import { runSlaAlerts } from '@/lib/sla-alerts'
import { runInboxReminders } from '@/lib/ticket-inbox'

async function inboxReminders(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const inbox = await runInboxReminders()
  // A billing hiccup must not fail the inbox reminders
  const billing = await runBillingReminders().catch((e) => {
    console.error('[billing-reminders]', e)
    return null
  })
  const sla = await runSlaAlerts().catch((e) => {
    console.error('[sla-alerts]', e)
    return null
  })
  const retainer = await runRetainerInvoices().catch((e) => {
    console.error('[retainer]', e)
    return null
  })
  return NextResponse.json({
    ...inbox,
    sla_warned: sla?.warned.length ?? null,
    sla_breached: sla?.breached.length ?? null,
    retainer_invoices: retainer?.created.length ?? null,
    overdue_invoices: billing?.overdueInvoices.length ?? null,
    low_deposits: billing?.lowDeposit.length ?? null,
  })
}

/** Records each run for Settings → Scheduled jobs */
export const POST = withJobRun('inbox-reminders', inboxReminders)
