/**
 * The app's time zone: one IANA name (for example `Asia/Jakarta`) that decides what "today", a date filter or a time in an email means.
 * Pure helpers (no database imports) made with the built-in `Intl`, so daylight saving is handled for any zone. Stored times stay
 * real moments (UTC); only the reading of dates and the showing of times use the zone.
 */

export const DEFAULT_TIME_ZONE = 'Asia/Jakarta'

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** A usable zone: the one given when it is valid, otherwise the default. */
export const cleanTimeZone = (tz: unknown): string => (isValidTimeZone(tz) ? tz.trim() : DEFAULT_TIME_ZONE)

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    formatters.set(tz, f)
  }
  return f
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** The wall clock in the zone at an instant. */
export function zoneParts(instant: Date, tz: string): Parts {
  const out: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(instant)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return { year: out.year, month: out.month, day: out.day, hour: out.hour === 24 ? 0 : out.hour, minute: out.minute, second: out.second }
}

/** Minutes the zone is ahead of UTC at an instant (420 for Jakarta, -300 or -240 for New York depending on the date). */
export function zoneOffsetMinutes(tz: string, instant: Date): number {
  const p = zoneParts(instant, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

const two = (n: number) => String(n).padStart(2, '0')

/** The calendar date (YYYY-MM-DD) an instant falls on in the zone. */
export function localDateOf(instant: Date, tz: string): string {
  const p = zoneParts(instant, tz)
  return `${p.year}-${two(p.month)}-${two(p.day)}`
}

/** `YYYY-MM-DD` shifted by whole days (pure calendar arithmetic). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The instant a day starts in the zone (local midnight). */
export function startOfDayInZone(date: string, tz: string): Date {
  const guess = new Date(`${date}T00:00:00Z`).getTime()
  const first = guess - zoneOffsetMinutes(tz, new Date(guess)) * 60_000
  // Around a change of daylight saving the offset at the first guess can differ: ask again at the result
  const second = guess - zoneOffsetMinutes(tz, new Date(first)) * 60_000
  return new Date(second)
}

/** The last millisecond of a day in the zone. */
export const endOfDayInZone = (date: string, tz: string): Date => new Date(startOfDayInZone(addDays(date, 1), tz).getTime() - 1)

/** Today's date in the zone. */
export const todayInZone = (tz: string, now: Date = new Date()): string => localDateOf(now, tz)

/** The instant of a wall clock time in the zone (`2026-11-03` + `09:30`). */
export function instantInZone(date: string, time: string, tz: string): Date {
  const [h, m] = time.split(':').map(Number)
  const guess = new Date(`${date}T00:00:00Z`).getTime() + ((h || 0) * 60 + (m || 0)) * 60_000
  const first = guess - zoneOffsetMinutes(tz, new Date(guess)) * 60_000
  return new Date(guess - zoneOffsetMinutes(tz, new Date(first)) * 60_000)
}

/** "UTC+7", "UTC-5", "UTC+5:30" */
export function offsetLabel(minutes: number): string {
  const abs = Math.abs(minutes)
  return `UTC${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}${abs % 60 ? `:${two(abs % 60)}` : ''}`
}

/** `2026-11-03T16:00+07:00`: an instant written with the zone's offset (what the activity report uses for hours). */
export function isoInZone(instant: Date, tz: string): string {
  const p = zoneParts(instant, tz)
  const off = zoneOffsetMinutes(tz, instant)
  const abs = Math.abs(off)
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}${off < 0 ? '-' : '+'}${two(Math.floor(abs / 60))}:${two(abs % 60)}`
}

/**
 * The instant a filter value means. A plain date (`2026-11-03`) is the start (or, with `end`, the last millisecond) of that day in the
 * zone; a full time with a Z or an offset is taken as it is. Null when it is neither.
 */
export function parseDateBound(value: string | null | undefined, tz: string, end = false): Date | null {
  const v = (value ?? '').trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const probe = new Date(`${v}T00:00:00Z`)
    if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== v) return null
    return end ? endOfDayInZone(v, tz) : startOfDayInZone(v, tz)
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
