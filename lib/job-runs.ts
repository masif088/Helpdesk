/**
 * Scheduled jobs (called by Apps Script / Cloud Scheduler, see docs/cron-jobs.md) and their last run.
 * Each run overwrites one small doc in app_settings (`job_run:<key>`), shown in Settings → Scheduled jobs.
 */
import { isCronRequest } from '@/lib/cron-auth'
import { appSettings, find, upsert } from '@/lib/fsdb'
import { type JobRun, SCHEDULED_JOBS, type ScheduledJobKey } from '@/lib/scheduled-jobs'

export { type JobRun, SCHEDULED_JOBS, type ScheduledJobKey } from '@/lib/scheduled-jobs'

const settingKey = (job: ScheduledJobKey) => `job_run:${job}`

/** Header set by "Run now" so a manual run is not reported as a scheduler run. */
export const MANUAL_RUN_HEADER = 'x-job-trigger'

export async function getJobRuns(): Promise<Partial<Record<ScheduledJobKey, JobRun>>> {
  const rows = await find(appSettings)
  const out: Partial<Record<ScheduledJobKey, JobRun>> = {}
  for (const job of SCHEDULED_JOBS) {
    const raw = rows.find((r) => r.key === settingKey(job.key))?.value
    if (!raw) continue
    try {
      out[job.key] = JSON.parse(raw) as JobRun
    } catch {
      /* ignore a bad row */
    }
  }
  return out
}

function summarize(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  if (typeof b.error === 'string') return b.error.slice(0, 300)
  if (typeof b.message === 'string' && Object.keys(b).length <= 3) return b.message.slice(0, 300)
  // Keep the numbers (created, processed, fired…)
  const parts = Object.entries(b)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
  return parts.join(' · ').slice(0, 300)
}

/** Wrap a job route handler: records status, duration and a summary of the response. */
export function withJobRun<R extends Request>(job: ScheduledJobKey, handler: (req: R) => Promise<Response>) {
  return async (req: R): Promise<Response> => {
    const started = Date.now()
    const via: JobRun['via'] = isCronRequest(req) && req.headers.get(MANUAL_RUN_HEADER) !== 'manual' ? 'scheduler' : 'manual'
    let res: Response
    try {
      res = await handler(req)
    } catch (e) {
      await record(job, { ok: false, status: 500, via, durationMs: Date.now() - started, summary: (e as Error)?.message ?? 'Error' })
      throw e
    }
    // Unauthorized calls are not runs
    if (res.status === 401 || res.status === 403) return res
    let summary = ''
    try {
      summary = summarize(await res.clone().json())
    } catch {
      /* not JSON */
    }
    await record(job, { ok: res.status < 400, status: res.status, via, durationMs: Date.now() - started, summary })
    return res
  }
}

async function record(job: ScheduledJobKey, run: Omit<JobRun, 'at'>): Promise<void> {
  try {
    await upsert(appSettings, { key: settingKey(job), value: JSON.stringify({ at: new Date().toISOString(), ...run }), updatedAt: new Date() })
  } catch (e) {
    console.error('[job-runs] record failed:', job, e)
  }
}

