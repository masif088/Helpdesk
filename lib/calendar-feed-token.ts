/**
 * The secret link that puts a person's calendar in Google or Apple Calendar (an iCal feed). A link is `<userId in base64url>.<signature>`;
 * the signature covers the user id and a nonce kept on the server, so a link cannot be made up, and "reset the link" (a new nonce)
 * stops the old one at once. Pure helpers: the secret and the nonce are passed in.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (secret: string, userId: string, nonce: string) => createHmac('sha256', secret).update(`ics|${userId}|${nonce}`).digest('base64url')

export function feedToken(secret: string, userId: string, nonce: string): string {
  return `${Buffer.from(userId, 'utf8').toString('base64url')}.${sign(secret, userId, nonce)}`
}

/** The user id inside a link, or null when it is not shaped like one. Says nothing about whether it is valid. */
export function feedTokenUserId(token: string): string | null {
  const m = /^([A-Za-z0-9_-]{4,200})\.[A-Za-z0-9_-]{20,64}$/.exec(token.replace(/\.ics$/i, ''))
  if (!m) return null
  try {
    const id = Buffer.from(m[1], 'base64url').toString('utf8')
    return id && Buffer.from(id, 'utf8').toString('base64url') === m[1] ? id : null
  } catch {
    return null
  }
}

/** Is this link genuinely made for this user, with the nonce they have now? A trailing `.ics` is ignored. */
export function feedTokenValid(secret: string, token: string, nonce: string | null): boolean {
  const clean = token.replace(/\.ics$/i, '')
  const userId = feedTokenUserId(clean)
  if (!secret || !nonce || userId == null) return false
  const a = Buffer.from(clean)
  const b = Buffer.from(feedToken(secret, userId, nonce))
  return a.length === b.length && timingSafeEqual(a, b)
}
