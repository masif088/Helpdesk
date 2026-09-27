/**
 * Admin-only helpers for diagnosing / repairing the `job_types` catalog (time tracker).
 * Firestore has no grants / RLS, so diagnostics only check that the collection is readable and seeded.
 */
import { count, find, insertMany, jobTypes, removeWhere, ticketTimeTracker, update } from '@/lib/fsdb'

export type JobTypesCatalogDiagnostics = {
  ok: boolean
  current_user: string | null
  session_user?: string | null
  /** Table owner login name */
  owner: string | null
  schema_usage_public: boolean
  select_job_types: boolean
  /** null if missing */
  row_count: number | null
  /** Row-level security on job_types */
  rls_enabled: boolean | null
  messages: string[]
}

const DEFAULT_JOB_TYPES = [
  { slug: 'development', title: 'Development', sortOrder: 10 },
  { slug: 'meeting', title: 'Meeting', sortOrder: 20 },
  { slug: 'support', title: 'Support / customer care', sortOrder: 30 },
  { slug: 'review', title: 'Review / QA', sortOrder: 50 },
  { slug: 'research', title: 'Research / investigation', sortOrder: 70 },
  { slug: 'admin', title: 'Admin / internal', sortOrder: 80 },
  { slug: 'other', title: 'Other', sortOrder: 999 },
  { slug: 'ticket_work', title: 'Ticket Work', sortOrder: 10 },
  { slug: 'revision', title: 'Revision', sortOrder: 10 },
]

function serviceAccount(): string | null {
  return process.env.FIREBASE_CLIENT_EMAIL?.trim() || null
}

export async function getJobTypesCatalogDiagnostics(): Promise<JobTypesCatalogDiagnostics> {
  const messages: string[] = []
  let row_count: number | null = null
  try {
    row_count = await count(jobTypes)
  } catch (e) {
    messages.push(`Could not read job_types: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (row_count === 0) messages.push('job_types is empty. Use “Recreate catalog” to seed the defaults.')
  const readable = row_count !== null
  return {
    ok: readable && (row_count ?? 0) > 0,
    current_user: serviceAccount(),
    session_user: serviceAccount(),
    owner: null,
    schema_usage_public: readable,
    select_job_types: readable,
    row_count,
    rls_enabled: null,
    messages,
  }
}

/** Nothing to grant on Firestore — kept for the settings UI; just re-runs diagnostics. */
export async function repairJobTypesPublicGrants(): Promise<{ ok: boolean; error?: string }> {
  const d = await getJobTypesCatalogDiagnostics()
  return d.ok ? { ok: true } : { ok: false, error: d.messages.join(' ') || 'job_types is not readable' }
}

/** Delete every job type, re-seed the defaults, and point time sessions with unknown slugs to 'other'. Destructive. */
export async function recreateJobTypesCatalogTable(): Promise<{ ok: boolean; error?: string }> {
  try {
    await removeWhere(jobTypes, [['slug', '!=', '']])
    await insertMany(jobTypes, DEFAULT_JOB_TYPES.map((j) => ({ ...j, isActive: true })))
    const known = new Set(DEFAULT_JOB_TYPES.map((j) => j.slug))
    const sessions = await find(ticketTimeTracker, { where: [['jobType', '!=', null]] })
    for (const s of sessions) {
      if (s.jobType && !known.has(s.jobType)) await update(ticketTimeTracker, s.id, { jobType: 'other' })
    }
    const d = await getJobTypesCatalogDiagnostics()
    if (!d.ok && d.messages.length > 0) {
      return { ok: false, error: d.messages.join(' ') }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
