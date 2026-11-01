/** The secret that signs links people can open without logging in (rating links, calendar feeds). */
export function linkSecret(): string {
  return process.env.CSAT_LINK_SECRET?.trim() || process.env.SYNC_INBOX_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.FIREBASE_PRIVATE_KEY?.trim() || ''
}
