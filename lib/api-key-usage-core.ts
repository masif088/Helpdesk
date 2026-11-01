/**
 * API key usage: one small record per key per day (calls, calls refused for the hourly limit, calls per permission), added up here
 * for the keys page. Pure helpers (no database imports) so they can be tested.
 */

export type UsageDay = { keyId: string; date: string; calls: number; limited: number; scopes: Record<string, number> | null }

export type KeyUsage = {
  calls7d: number
  calls30d: number
  limited30d: number
  byScope: Record<string, number>
  /** The last 30 days, oldest first, every day present (0 when nothing) */
  byDay: { date: string; calls: number }[]
}

export const USAGE_DAYS = 30
const DAY = 86_400_000

export const usageDate = (d: Date = new Date()): string => d.toISOString().slice(0, 10)
export const usageDocId = (keyId: string, date: string): string => `${keyId}~${date}`

/** The dates (UTC) of the last `days` days up to and including `today`, oldest first. */
export function lastDates(today: Date, days = USAGE_DAYS): string[] {
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Array.from({ length: days }, (_, i) => usageDate(new Date(end - (days - 1 - i) * DAY)))
}

const empty = (dates: string[]): KeyUsage => ({ calls7d: 0, calls30d: 0, limited30d: 0, byScope: {}, byDay: dates.map((date) => ({ date, calls: 0 })) })

/** Usage per key id from the daily records. Keys with no records are absent from the map. */
export function summarizeUsage(rows: UsageDay[], today: Date = new Date()): Map<string, KeyUsage> {
  const dates = lastDates(today)
  const index = new Map(dates.map((d, i) => [d, i]))
  const last7 = new Set(dates.slice(-7))
  const out = new Map<string, KeyUsage>()
  for (const r of rows) {
    const i = index.get(r.date)
    if (i === undefined) continue
    const u = out.get(r.keyId) ?? empty(dates)
    u.calls30d += r.calls
    u.limited30d += r.limited
    if (last7.has(r.date)) u.calls7d += r.calls
    u.byDay[i].calls += r.calls
    for (const [scope, n] of Object.entries(r.scopes ?? {})) u.byScope[scope] = (u.byScope[scope] ?? 0) + n
    out.set(r.keyId, u)
  }
  return out
}

/** The usage of a key that has none yet. */
export const noUsage = (today: Date = new Date()): KeyUsage => empty(lastDates(today))

/** Remembers request ids for a minute so a call that asks for the session several times is counted once. */
export function createDeduper(ttlMs = 60_000, max = 1000) {
  const seen = new Map<string, number>()
  return (requestId: string | null, now = Date.now()): boolean => {
    if (!requestId) return true
    if (seen.has(requestId)) return false
    seen.set(requestId, now)
    if (seen.size > max) for (const [id, at] of seen) if (now - at > ttlMs) seen.delete(id)
    return true
  }
}
