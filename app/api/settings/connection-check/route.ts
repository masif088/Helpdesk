import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getAiChatConfig } from '@/lib/ai-chat-config'
import { isAdmin } from '@/lib/auth-utils'
import { BRANDING } from '@/lib/branding'
import { cronSecret } from '@/lib/cron-auth'
import { getFirebaseAdminAuth, isFirebaseAdminConfigured } from '@/lib/firebase/admin'
import { count, emailIntegrations, findOneBy, users } from '@/lib/fsdb'
import { getJobRuns } from '@/lib/job-runs'
import { checkBucket, storageBucketName } from '@/lib/storage-firebase'
import { getStorageProvider } from '@/lib/storage-provider'

export type ConnectionCheckGroup = 'core' | 'email' | 'jobs' | 'ai'

export type ConnectionCheckResult = {
  key: string
  group: ConnectionCheckGroup
  label: string
  status: 'ok' | 'warning' | 'error' | 'not_configured'
  message: string
  latencyMs?: number
  /** Where to fix / configure it */
  href?: string
}

export type ConnectionEnvironment = {
  runtime: string
  siteUrl: string | null
  projectId: string | null
  bucket: string | null
}

const errMsg = (e: unknown, fallback = 'Failed') => (e instanceof Error ? e.message : fallback)

async function checkDatabase(): Promise<ConnectionCheckResult> {
  const base = { key: 'database', group: 'core' as const, label: 'Firestore database' }
  const t0 = Date.now()
  try {
    const n = await count(users)
    return { ...base, status: 'ok', message: `Reachable · ${n} users`, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { ...base, status: 'error', message: errMsg(e, 'Connection failed') }
  }
}

async function checkAuth(): Promise<ConnectionCheckResult> {
  const base = { key: 'auth', group: 'core' as const, label: 'Firebase Auth (Admin SDK)' }
  if (!isFirebaseAdminConfigured()) {
    return { ...base, status: 'not_configured', message: 'FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not set' }
  }
  const t0 = Date.now()
  try {
    const a = getFirebaseAdminAuth()
    if (!a) throw new Error('Admin SDK did not initialize')
    await a.listUsers(1)
    return { ...base, status: 'ok', message: 'Sign-in and sessions available', latencyMs: Date.now() - t0 }
  } catch (e) {
    return { ...base, status: 'error', message: errMsg(e) }
  }
}

async function checkStorage(): Promise<ConnectionCheckResult> {
  const base = { key: 'storage', group: 'core' as const, label: 'File storage' }
  if (getStorageProvider() === 'local') {
    return { ...base, status: 'warning', message: 'Local filesystem (STORAGE_PROVIDER=local) — files are lost on redeploy' }
  }
  const t0 = Date.now()
  const r = await checkBucket()
  if (!r.bucket) return { ...base, status: 'not_configured', message: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET not set' }
  if (!r.ok) return { ...base, status: 'error', message: r.error || 'Bucket not reachable' }
  return { ...base, status: 'ok', message: `Firebase Storage · ${r.bucket}`, latencyMs: Date.now() - t0 }
}

async function checkGoogleOAuth(): Promise<ConnectionCheckResult> {
  const base = { key: 'google_oauth', group: 'email' as const, label: 'Google OAuth app', href: '/settings/email-integration' }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { ...base, status: 'not_configured', message: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set' }
  }
  const redirect = `${(BRANDING.siteUrl || 'http://localhost:3000').replace(/\/$/, '')}/api/email/google/callback`
  return { ...base, status: 'ok', message: `Credentials set · redirect URI ${redirect}` }
}

async function checkMailbox(): Promise<ConnectionCheckResult> {
  const base = { key: 'gmail', group: 'email' as const, label: 'Gmail mailbox', href: '/settings/email-integration' }
  try {
    const row = await findOneBy(emailIntegrations, { provider: 'google' })
    if (!row || row.isActive === false) return { ...base, status: 'not_configured', message: 'No mailbox connected' }
    if (!row.refreshToken) {
      return { ...base, status: 'warning', message: `${row.emailAddress ?? 'Mailbox'} has no refresh token — reconnect it` }
    }
    const last = row.lastSyncAt ? new Date(row.lastSyncAt) : null
    const lastText = last ? `last sync ${Math.round((Date.now() - last.getTime()) / 60000)} min ago` : 'never synced'
    return { ...base, status: 'ok', message: `${row.emailAddress ?? 'Connected'} · ${lastText}` }
  } catch (e) {
    return { ...base, status: 'error', message: errMsg(e) }
  }
}

async function checkScheduler(): Promise<ConnectionCheckResult> {
  const base = { key: 'scheduler', group: 'jobs' as const, label: 'Scheduler', href: '/settings/scheduled-jobs' }
  if (!cronSecret()) return { ...base, status: 'not_configured', message: 'SYNC_INBOX_CRON_SECRET not set — scheduled jobs cannot run' }
  try {
    const run = (await getJobRuns())['sync-inbox']
    if (!run || run.via !== 'scheduler') return { ...base, status: 'warning', message: 'Secret set, but no scheduled email sync recorded yet' }
    const mins = Math.round((Date.now() - new Date(run.at).getTime()) / 60000)
    if (!run.ok) return { ...base, status: 'error', message: `Last email sync failed (${run.status}) ${mins} min ago: ${run.summary}` }
    if (mins > 15) return { ...base, status: 'warning', message: `Last scheduled email sync ${mins} min ago — scheduler may have stopped` }
    return { ...base, status: 'ok', message: `Calling in · last email sync ${mins} min ago` }
  } catch (e) {
    return { ...base, status: 'error', message: errMsg(e) }
  }
}

async function checkAi(): Promise<ConnectionCheckResult> {
  const base = { key: 'ai', group: 'ai' as const, label: 'AI provider', href: '/settings/ai' }
  let cfg: Awaited<ReturnType<typeof getAiChatConfig>>
  try {
    cfg = await getAiChatConfig()
  } catch (e) {
    return { ...base, status: 'not_configured', message: errMsg(e, 'Not configured') }
  }
  const t0 = Date.now()
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    const label = cfg.provider === 'codex' ? 'Codex' : 'OpenAI'
    if (!res.ok) return { ...base, status: 'error', message: `${label}: HTTP ${res.status}` }
    return { ...base, status: 'ok', message: `${label} · model ${cfg.model}`, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { ...base, status: 'error', message: errMsg(e) }
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const results = await Promise.all([
    checkDatabase(),
    checkAuth(),
    checkStorage(),
    checkGoogleOAuth(),
    checkMailbox(),
    checkScheduler(),
    checkAi(),
  ])

  const environment: ConnectionEnvironment = {
    runtime: process.env.K_SERVICE ? 'Firebase App Hosting' : process.env.NODE_ENV === 'production' ? 'Production server' : 'Local development',
    siteUrl: BRANDING.siteUrl,
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    bucket: storageBucketName(),
  }

  return NextResponse.json({ results, environment, checkedAt: new Date().toISOString() })
}
