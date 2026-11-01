/**
 * Calendar feeds on the server: each person can switch on a secret link (an iCal feed) and reset it. The nonce behind the link lives
 * in `app_settings` (`calendar_feed_nonce:<userId>`); no nonce means the feed is off. Token rules: `lib/calendar-feed-token.ts`.
 */
import { randomBytes } from 'node:crypto'

import { feedToken, feedTokenUserId, feedTokenValid } from '@/lib/calendar-feed-token'
import { appSettings, findOneBy, get, upsert, users } from '@/lib/fsdb'
import { linkSecret } from '@/lib/link-secret'

const key = (userId: string) => `calendar_feed_nonce:${userId}`

async function nonceOf(userId: string): Promise<string | null> {
  return (await findOneBy(appSettings, { key: key(userId) }))?.value ?? null
}

export const feedUrl = (baseUrl: string, userId: string, nonce: string): string => `${baseUrl.replace(/\/+$/, '')}/api/calendar/ics/${feedToken(linkSecret(), userId, nonce)}.ics`

/** The person's feed link, or null when it is switched off (or the server has no signing secret). */
export async function currentFeedUrl(baseUrl: string, userId: string): Promise<string | null> {
  if (!linkSecret()) return null
  const nonce = await nonceOf(userId)
  return nonce ? feedUrl(baseUrl, userId, nonce) : null
}

/** Switch the feed on, or give it a new link (the old one stops working at once). */
export async function resetFeed(baseUrl: string, userId: string): Promise<string> {
  if (!linkSecret()) throw new Error('The server has no signing secret for calendar links (set CSAT_LINK_SECRET)')
  const nonce = randomBytes(18).toString('base64url')
  await upsert(appSettings, { key: key(userId), value: nonce, updatedAt: new Date() })
  return feedUrl(baseUrl, userId, nonce)
}

/** Switch the feed off: the link stops working. */
export async function disableFeed(userId: string): Promise<void> {
  await upsert(appSettings, { key: key(userId), value: null, updatedAt: new Date() })
}

/** The active person behind a feed link, or null when the link is not valid (wrong, reset, switched off, or the account is gone). */
export async function userForFeedToken(token: string) {
  const userId = feedTokenUserId(token.replace(/\.ics$/i, ''))
  if (!userId) return null
  if (!feedTokenValid(linkSecret(), token, await nonceOf(userId))) return null
  const user = await get(users, userId)
  return user && !user.deletedAt && user.status === 'active' ? user : null
}
