import { NextRequest, NextResponse } from 'next/server'

import { POST as runTimeTrigger } from '@/app/api/automation/time-trigger/route'
import { POST as runRecurringTickets } from '@/app/api/cron/process-recurring-tickets/route'
import { POST as runSyncInbox } from '@/app/api/email/sync-inbox/route'
import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { cronSecret } from '@/lib/cron-auth'
import { getJobRuns, MANUAL_RUN_HEADER, SCHEDULED_JOBS, type ScheduledJobKey } from '@/lib/job-runs'

const HANDLERS: Record<ScheduledJobKey, (req: NextRequest) => Promise<Response>> = {
  'sync-inbox': runSyncInbox,
  'recurring-tickets': runRecurringTickets,
  'time-trigger': runTimeTrigger,
}

/** POST /api/settings/scheduled-jobs/run { job } — admin "Run now": calls the job in-process with the scheduler secret. */
export async function POST(request: Request) {
  const session = await auth()
  if (!isAdmin((session?.user as { role?: string } | undefined)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { job } = (await request.json().catch(() => ({}))) as { job?: string }
  const def = SCHEDULED_JOBS.find((j) => j.key === job)
  if (!def) return NextResponse.json({ error: 'Unknown job' }, { status: 400 })
  const secret = cronSecret()
  if (!secret) {
    return NextResponse.json({ error: 'SYNC_INBOX_CRON_SECRET is not set on the server' }, { status: 503 })
  }
  const res = await HANDLERS[def.key](
    new NextRequest(new URL(def.path, request.url), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, [MANUAL_RUN_HEADER]: 'manual' },
    })
  )
  const body = await res.json().catch(() => ({}))
  const run = (await getJobRuns())[def.key] ?? null
  return NextResponse.json({ status: res.status, body, run }, { status: res.ok ? 200 : 502 })
}
