/**
 * Auth for scheduled jobs (Cloud Scheduler on Firebase App Hosting, or crontab + curl).
 * The caller sends the shared secret as `Authorization: Bearer <secret>` (or `x-api-key` / `x-cron-secret`).
 * Secret: SYNC_INBOX_CRON_SECRET (CRON_SECRET is accepted as a legacy alias).
 */
export function cronSecret(): string | null {
  return process.env.SYNC_INBOX_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || null
}

export function isCronRequest(req: Request): boolean {
  const secret = cronSecret()
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ')
    ? auth.slice(7).trim()
    : req.headers.get('x-api-key') ?? req.headers.get('x-cron-secret')
  return token === secret
}
