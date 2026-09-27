import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Signed OAuth `state`: carries who started "Connect Gmail" to the callback, even when the callback lands on a
 * different host than the one the user was logged in on (e.g. *.hosted.app → custom domain), so no session cookie.
 */
const TTL_MS = 15 * 60 * 1000

function key(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || process.env.SYNC_INBOX_CRON_SECRET?.trim() || ''
}

function sign(payload: string): string {
  return createHmac('sha256', key()).update(payload).digest('base64url')
}

export function createOAuthState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + TTL_MS, n: randomBytes(8).toString('hex') })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** User id from a valid, unexpired state; null otherwise. */
export function readOAuthState(state: string | null): string | null {
  if (!state || !key()) return null
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; e?: number }
    if (!data.u || !data.e || data.e < Date.now()) return null
    return data.u
  } catch {
    return null
  }
}
