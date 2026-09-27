/** Scheduled job definitions (client-safe). Server helpers: lib/job-runs.ts. Setup: docs/cron-jobs.md. */
export const SCHEDULED_JOBS = [
  {
    key: 'sync-inbox',
    title: 'Email sync',
    description: 'Reads new Gmail messages: creates tickets and adds replies.',
    path: '/api/email/sync-inbox',
    schedule: 'Every 5 minutes',
    appsScriptFunction: 'syncInbox',
  },
  {
    key: 'recurring-tickets',
    title: 'Recurring tickets',
    description: 'Creates tickets from recurring rules that are due.',
    path: '/api/cron/process-recurring-tickets',
    schedule: 'Every 5 minutes',
    appsScriptFunction: 'recurringTickets',
  },
  {
    key: 'time-trigger',
    title: 'Time-trigger automations',
    description: 'Runs "Time Trigger" automation rules; each fires once per idle period of a ticket.',
    path: '/api/automation/time-trigger',
    schedule: 'Daily, 06:00 (Asia/Jakarta)',
    appsScriptFunction: 'timeTrigger',
  },
] as const

export type ScheduledJobKey = (typeof SCHEDULED_JOBS)[number]['key']

export type JobRun = {
  at: string
  ok: boolean
  status: number
  /** scheduler = called with the cron secret; manual = session user or "Run now" */
  via: 'scheduler' | 'manual'
  durationMs: number
  /** Short response excerpt (counts or error message) */
  summary: string
}
