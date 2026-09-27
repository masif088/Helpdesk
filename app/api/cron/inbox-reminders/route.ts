/**
 * POST /api/cron/inbox-reminders — called hourly by the scheduler (see docs/cron-jobs.md).
 * One reminder per ticket that is still unassigned after Settings → Scheduled jobs → Inbox reminder hours.
 */
import { NextRequest, NextResponse } from 'next/server'

import { isCronRequest } from '@/lib/cron-auth'
import { withJobRun } from '@/lib/job-runs'
import { runInboxReminders } from '@/lib/ticket-inbox'

async function inboxReminders(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await runInboxReminders())
}

/** Records each run for Settings → Scheduled jobs */
export const POST = withJobRun('inbox-reminders', inboxReminders)
