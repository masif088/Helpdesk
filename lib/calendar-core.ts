/**
 * Calendar: the kinds of events, how input is validated, how repeating events unfold, and who may see or change what.
 * Pure helpers (no database imports), used by `lib/calendar.ts`, the calendar page, the API builder and the tests.
 *
 * Dates: a timed event is a real moment (stored as UTC). An all-day event is a plain date: it is stored from 00:00:00 UTC of
 * its first day to 23:59:59.999 UTC of its last day and shown as `YYYY-MM-DD`, so it never slides to another day in
 * another time zone.
 */
// Relative, with the extension, on purpose: the tests load this file with plain Node, which knows no `@/` alias
import { localDateOf, parseDateBound } from './app-time.ts'

export const CALENDAR_TYPES = ['meeting', 'leave', 'holiday', 'event', 'training', 'maintenance', 'reminder', 'other'] as const
export type CalendarType = (typeof CALENDAR_TYPES)[number]

/** Shown in the calendar next to the stored events, computed from tickets and invoices. They cannot be edited here. */
export const DERIVED_TYPES = ['ticket_due', 'invoice_due'] as const
export type DerivedType = (typeof DERIVED_TYPES)[number]

export const CALENDAR_VISIBILITIES = ['private', 'staff', 'company', 'everyone'] as const
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number]

export const CALENDAR_REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const
export type CalendarRepeat = (typeof CALENDAR_REPEATS)[number]

export const VISIBILITY_LABELS: Record<CalendarVisibility, string> = {
  private: 'Only me',
  staff: 'The team',
  company: 'The team and the client company',
  everyone: 'The team and all clients',
}

export const TYPE_INFO: Record<CalendarType | DerivedType, { label: string; color: string; hint: string; allDay: boolean; visibility: CalendarVisibility }> = {
  meeting: { label: 'Meeting', color: '#3B82F6', hint: 'A call or meeting with a time, people and a link', allDay: false, visibility: 'staff' },
  leave: { label: 'Leave', color: '#F59E0B', hint: 'Time off for one person (cuti)', allDay: true, visibility: 'staff' },
  holiday: { label: 'Holiday', color: '#EF4444', hint: 'A public or company holiday, for everyone (managers only)', allDay: true, visibility: 'everyone' },
  event: { label: 'Event', color: '#8B5CF6', hint: 'Anything else with a date', allDay: false, visibility: 'staff' },
  training: { label: 'Training', color: '#14B8A6', hint: 'Training, workshop or onboarding session', allDay: false, visibility: 'staff' },
  maintenance: { label: 'Maintenance', color: '#64748B', hint: 'Planned downtime or maintenance window', allDay: false, visibility: 'staff' },
  reminder: { label: 'Reminder', color: '#EC4899', hint: 'A personal reminder, only you see it', allDay: false, visibility: 'private' },
  other: { label: 'Other', color: '#6B7280', hint: 'Does not fit the rest', allDay: false, visibility: 'staff' },
  ticket_due: { label: 'Ticket due', color: '#F97316', hint: 'A ticket reaches its due date (from the ticket)', allDay: true, visibility: 'staff' },
  invoice_due: { label: 'Invoice due', color: '#0EA5E9', hint: 'An unpaid invoice reaches its due date (from billing)', allDay: true, visibility: 'staff' },
}

/** Only these can have invited people (and so accept / decline and reminders for the invited). A holiday, leave, a reminder or a maintenance window has no guest list. */
export const INVITABLE_TYPES: readonly CalendarType[] = ['meeting', 'event', 'training']
export const isInvitable = (type: string): boolean => (INVITABLE_TYPES as readonly string[]).includes(type)

export const isCalendarType = (v: unknown): v is CalendarType => typeof v === 'string' && (CALENDAR_TYPES as readonly string[]).includes(v)
export const isCalendarItemType = (v: unknown): v is CalendarType | DerivedType =>
  isCalendarType(v) || (typeof v === 'string' && (DERIVED_TYPES as readonly string[]).includes(v))

const DAY = 86_400_000
const MAX_SPAN_DAYS = 366
const MAX_ATTENDEES = 50

/** What an event looks like once validated, ready to store. */
export type EventFields = {
  type: CalendarType
  title: string
  description: string | null
  startAt: Date
  endAt: Date
  allDay: boolean
  location: string | null
  meetingUrl: string | null
  color: string | null
  visibility: CalendarVisibility
  ownerId: string | null
  attendeeIds: string[]
  companyId: string | null
  ticketId: number | null
  repeat: CalendarRepeat
  repeatUntil: Date | null
}

export type CleanResult = { ok: true; value: EventFields } | { ok: false; error: string }

const text = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` or a full ISO moment; null when it is neither. */
function parseMoment(v: unknown): { date: Date; dateOnly: boolean } | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const d = new Date(DATE_ONLY.test(s) ? `${s}T00:00:00.000Z` : s)
  return Number.isNaN(d.getTime()) ? null : { date: d, dateOnly: DATE_ONLY.test(s) }
}

const startOfDayUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const endOfDayUtc = (d: Date) => new Date(startOfDayUtc(d).getTime() + DAY - 1)

/** Validate the body of "create event" (snake_case keys, as the API takes them). Update merges first, then calls this again. */
export function cleanEventInput(body: Record<string, unknown>): CleanResult {
  if (!isCalendarType(body.type)) return { ok: false, error: `type must be one of: ${CALENDAR_TYPES.join(', ')}` }
  const type = body.type
  const info = TYPE_INFO[type]

  const title = text(body.title, 200)
  if (!title) return { ok: false, error: 'title is required' }

  const start = parseMoment(body.start)
  if (!start) return { ok: false, error: 'start must be a date (YYYY-MM-DD) or an ISO date and time' }
  const allDay = typeof body.all_day === 'boolean' ? body.all_day : start.dateOnly || info.allDay

  const endRaw = body.end === undefined || body.end === null || body.end === '' ? null : parseMoment(body.end)
  if (body.end !== undefined && body.end !== null && body.end !== '' && !endRaw) return { ok: false, error: 'end must be a date (YYYY-MM-DD) or an ISO date and time' }

  let startAt: Date
  let endAt: Date
  if (allDay) {
    startAt = startOfDayUtc(start.date)
    endAt = endOfDayUtc(endRaw ? endRaw.date : start.date)
  } else {
    startAt = start.date
    endAt = endRaw ? endRaw.date : new Date(startAt.getTime() + 3_600_000)
  }
  if (endAt.getTime() < startAt.getTime()) return { ok: false, error: 'end must not be before start' }
  if (endAt.getTime() - startAt.getTime() > MAX_SPAN_DAYS * DAY) return { ok: false, error: `An event can last at most ${MAX_SPAN_DAYS} days` }

  const visibility = body.visibility === undefined || body.visibility === null ? info.visibility : body.visibility
  if (!(CALENDAR_VISIBILITIES as readonly unknown[]).includes(visibility)) return { ok: false, error: `visibility must be one of: ${CALENDAR_VISIBILITIES.join(', ')}` }

  const repeat = body.repeat === undefined || body.repeat === null || body.repeat === '' ? 'none' : body.repeat
  if (!(CALENDAR_REPEATS as readonly unknown[]).includes(repeat)) return { ok: false, error: `repeat must be one of: ${CALENDAR_REPEATS.join(', ')}` }
  let repeatUntil: Date | null = null
  if (repeat !== 'none' && body.repeat_until !== undefined && body.repeat_until !== null && body.repeat_until !== '') {
    const u = parseMoment(body.repeat_until)
    if (!u) return { ok: false, error: 'repeat_until must be a date (YYYY-MM-DD)' }
    repeatUntil = endOfDayUtc(u.date)
    if (repeatUntil.getTime() < startAt.getTime()) return { ok: false, error: 'repeat_until must not be before start' }
  }

  const color = text(body.color, 7)
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, error: 'color must look like #3B82F6' }

  const meetingUrl = text(body.meeting_url, 500)
  if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) return { ok: false, error: 'meeting_url must start with http:// or https://' }

  const attendees = body.attendee_ids === undefined || body.attendee_ids === null ? [] : body.attendee_ids
  if (!Array.isArray(attendees) || attendees.some((a) => typeof a !== 'string' || !a.trim())) return { ok: false, error: 'attendee_ids must be a list of user ids' }
  const attendeeIds = [...new Set(attendees.map((a) => String(a).trim()))]
  if (attendeeIds.length > MAX_ATTENDEES) return { ok: false, error: `At most ${MAX_ATTENDEES} attendees` }
  if (attendeeIds.length && !isInvitable(type)) return { ok: false, error: `Only ${INVITABLE_TYPES.join(', ')} can have invited people (attendee_ids); a ${type} cannot` }

  let ticketId: number | null = null
  if (body.ticket_id !== undefined && body.ticket_id !== null && body.ticket_id !== '') {
    ticketId = Number(body.ticket_id)
    if (!Number.isInteger(ticketId) || ticketId < 1) return { ok: false, error: 'ticket_id must be a ticket number' }
  }

  return {
    ok: true,
    value: {
      type,
      title,
      description: text(body.description, 5000),
      startAt,
      endAt,
      allDay,
      location: text(body.location, 200),
      meetingUrl,
      color: color ? color.toUpperCase() : null,
      visibility: visibility as CalendarVisibility,
      ownerId: text(body.owner_id, 100),
      attendeeIds,
      companyId: text(body.company_id, 100),
      ticketId,
      repeat: repeat as CalendarRepeat,
      repeatUntil,
    },
  }
}

// ── Repeating events ─────────────────────────────────────────────────────────

/** The k-th start of a repeating event (k = 0 is the first). Months and years keep the day of the month, clamped (31st -> 30th/28th). */
function nthStart(first: Date, repeat: CalendarRepeat, k: number): Date {
  if (repeat === 'daily') return new Date(first.getTime() + k * DAY)
  if (repeat === 'weekly') return new Date(first.getTime() + k * 7 * DAY)
  const months = repeat === 'monthly' ? k : k * 12
  const y = first.getUTCFullYear() + Math.floor((first.getUTCMonth() + months) / 12)
  const m = (first.getUTCMonth() + months) % 12
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(first.getUTCDate(), lastDay), first.getUTCHours(), first.getUTCMinutes(), first.getUTCSeconds(), first.getUTCMilliseconds()))
}

export type Occurrence = { start: Date; end: Date; index: number }

/** The occurrences of an event that touch [from, to]. A single event gives one occurrence (or none). */
export function expandOccurrences(
  ev: { startAt: Date; endAt: Date; repeat: CalendarRepeat; repeatUntil: Date | null },
  from: Date,
  to: Date,
  cap = 400
): Occurrence[] {
  const duration = ev.endAt.getTime() - ev.startAt.getTime()
  const touches = (s: Date) => s.getTime() <= to.getTime() && s.getTime() + duration >= from.getTime()
  if (ev.repeat === 'none') return touches(ev.startAt) ? [{ start: ev.startAt, end: ev.endAt, index: 0 }] : []

  const out: Occurrence[] = []
  let k = 0
  if (ev.repeat === 'daily' || ev.repeat === 'weekly') {
    // Jump straight to the first occurrence that can still reach `from`
    const step = ev.repeat === 'daily' ? DAY : 7 * DAY
    k = Math.max(0, Math.floor((from.getTime() - duration - ev.startAt.getTime()) / step))
  } else {
    // Months and years: few steps, but do not walk from 1970
    const months = (from.getUTCFullYear() - ev.startAt.getUTCFullYear()) * 12 + (from.getUTCMonth() - ev.startAt.getUTCMonth())
    const per = ev.repeat === 'monthly' ? 1 : 12
    k = Math.max(0, Math.floor(months / per) - 1 - Math.ceil(duration / (31 * DAY * per)))
  }
  for (let guard = 0; guard < 5000 && out.length < cap; guard++, k++) {
    const s = nthStart(ev.startAt, ev.repeat, k)
    if (s.getTime() > to.getTime()) break
    if (ev.repeatUntil && s.getTime() > ev.repeatUntil.getTime()) break
    if (touches(s)) out.push({ start: s, end: new Date(s.getTime() + duration), index: k })
  }
  return out
}

// ── Who may see and change events ────────────────────────────────────────────

export type CalendarViewer = {
  id: string
  /** Admin, manager or staff (anyone who is not a client) */
  isStaff: boolean
  isManager: boolean
  /** A client's own company, for company-visible events */
  companyId: string | null
}

type EventAccess = Pick<EventFields, 'type' | 'visibility' | 'ownerId' | 'attendeeIds' | 'companyId'> & { createdBy: string | null }

export function canSeeEvent(ev: EventAccess, viewer: CalendarViewer): boolean {
  if (ev.visibility === 'private') return ev.ownerId === viewer.id || ev.createdBy === viewer.id
  if (viewer.isStaff) return true
  if (ev.attendeeIds.includes(viewer.id) || ev.ownerId === viewer.id) return true
  if (ev.visibility === 'everyone') return true
  return ev.visibility === 'company' && !!ev.companyId && ev.companyId === viewer.companyId
}

/** Who may add an event of this type (for `ownerId`: whom it is about, mainly for leave). */
export function mayCreateEvent(type: CalendarType, ownerId: string | null, viewer: CalendarViewer): boolean {
  if (!viewer.isStaff) return false
  if (type === 'holiday') return viewer.isManager
  if (type === 'leave') return !ownerId || ownerId === viewer.id || viewer.isManager
  return true
}

export function mayChangeEvent(ev: Pick<EventAccess, 'type' | 'ownerId' | 'createdBy'>, viewer: CalendarViewer): boolean {
  if (!viewer.isStaff) return false
  if (viewer.isManager) return true
  if (ev.type === 'holiday') return false
  return ev.createdBy === viewer.id || (ev.type === 'leave' && ev.ownerId === viewer.id)
}

// ── What the API returns ─────────────────────────────────────────────────────

export type CalendarItem = {
  /** Event id; `ticket:12` / `invoice:abc` for items computed from tickets and invoices */
  id: string
  source: 'event' | 'ticket' | 'invoice'
  type: CalendarType | DerivedType
  title: string
  description: string | null
  /** `YYYY-MM-DD` for all-day items, otherwise an ISO date and time */
  start: string
  /** Last day (inclusive) for all-day items, otherwise the end moment */
  end: string
  all_day: boolean
  color: string
  location: string | null
  meeting_url: string | null
  visibility: CalendarVisibility | null
  owner_id: string | null
  attendee_ids: string[]
  company_id: string | null
  ticket_id: number | null
  repeat: CalendarRepeat
  /** For a repeating event: the start of the first occurrence, to tell occurrences of one event apart */
  occurrence: string | null
  /** The viewer may edit or delete it */
  editable: boolean
  /** How the invited people answered: user id to accepted / declined / tentative */
  responses: Record<string, string>
  /** The viewer's own answer when they are invited */
  my_response: string | null
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

/** The `start` and `end` strings of an item: plain dates for all-day, ISO moments otherwise. */
export function itemTimes(allDay: boolean, start: Date, end: Date): { start: string; end: string } {
  return allDay ? { start: dateOnly(start), end: dateOnly(end) } : { start: start.toISOString(), end: end.toISOString() }
}

/** Sort order of a calendar: by day, all-day items first, then by time, then by title. */
export const CALENDAR_ITEM_ORDER = (a: Pick<CalendarItem, 'start' | 'all_day' | 'title'>, b: Pick<CalendarItem, 'start' | 'all_day' | 'title'>) =>
  a.start.slice(0, 10).localeCompare(b.start.slice(0, 10)) || Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title)

// ── Invitations: answers, a readable time, and reminders ─────────────────────

export const CALENDAR_RESPONSES = ['accepted', 'declined', 'tentative'] as const
export type CalendarResponse = (typeof CALENDAR_RESPONSES)[number]
export const isCalendarResponse = (v: unknown): v is CalendarResponse => typeof v === 'string' && (CALENDAR_RESPONSES as readonly string[]).includes(v)

export type ResponseSummary = { accepted: number; declined: number; tentative: number; awaiting: number }

/** How the invited people answered: only answers of people who are still invited count. */
export function summarizeResponses(attendeeIds: string[], responses: Record<string, string> | null | undefined): ResponseSummary {
  const out: ResponseSummary = { accepted: 0, declined: 0, tentative: 0, awaiting: 0 }
  for (const id of attendeeIds) {
    const r = responses?.[id]
    if (isCalendarResponse(r)) out[r]++
    else out.awaiting++
  }
  return out
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

/** "Tue 3 Nov 2026, 16:00 to 17:00 (UTC+7)" or "Mon 28 Dec to Thu 31 Dec 2026" for a time zone fixed at `offsetMinutes` east of UTC. */
export function formatWhen(item: { all_day: boolean; start: string; end: string }, offsetMinutes = 0): string {
  const shift = (d: Date) => new Date(d.getTime() + offsetMinutes * 60_000)
  const day = (d: Date) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  const zone = `UTC${offsetMinutes < 0 ? '-' : '+'}${Math.floor(Math.abs(offsetMinutes) / 60)}${Math.abs(offsetMinutes) % 60 ? `:${two(Math.abs(offsetMinutes) % 60)}` : ''}`
  if (item.all_day) {
    const s = new Date(`${item.start}T00:00:00Z`)
    const e = new Date(`${item.end}T00:00:00Z`)
    return item.start === item.end ? `${day(s)} ${s.getUTCFullYear()}` : `${day(s)} to ${day(e)} ${e.getUTCFullYear()}`
  }
  const s = shift(new Date(item.start))
  const e = shift(new Date(item.end))
  const time = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
  const sameDay = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth() && s.getUTCDate() === e.getUTCDate()
  return sameDay ? `${day(s)} ${s.getUTCFullYear()}, ${time(s)} to ${time(e)} (${zone})` : `${day(s)} ${time(s)} to ${day(e)} ${time(e)} ${e.getUTCFullYear()} (${zone})`
}

/** Types that get a reminder shortly before they start (all-day items and holidays do not) */
export const REMINDER_TYPES: CalendarType[] = ['meeting', 'event', 'training', 'maintenance', 'reminder']

/** Who is reminded of an event: a personal reminder goes to its owner; the others to the people invited and the one who made it, minus those who declined. */
export function reminderRecipients(ev: { type: CalendarType; ownerId: string | null; attendeeIds: string[]; createdBy: string | null; responses?: Record<string, string> | null }): string[] {
  if (ev.type === 'reminder') return ev.ownerId ? [ev.ownerId] : ev.createdBy ? [ev.createdBy] : []
  const people = new Set([...ev.attendeeIds, ...(ev.createdBy ? [ev.createdBy] : [])])
  return [...people].filter((id) => ev.responses?.[id] !== 'declined')
}

/** People newly invited by a change: those in `after` who were not in `before`. */
export const newlyInvited = (before: string[], after: string[]): string[] => after.filter((id) => !before.includes(id))

// ── Reading a range of dates in the app's time zone ──────────────────────────

const MAX_RANGE_DAYS = 400

export type CalendarRange = {
  from: Date
  to: Date
  /** Set when the range was given as plain dates (or left out): the first and last day in the zone. Then an item is in the range when its day is. */
  days: { from: string; to: string } | null
  timeZone: string
}

const isPlainDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && parseDateBound(v, 'UTC') !== null

/**
 * `from` and `to` as the API takes them: plain dates mean whole days in `tz`; a full time with a Z or an offset is an exact moment. Left
 * out they default to the current month in `tz`.
 */
export function parseCalendarRange(from: string | null, to: string | null, now = new Date(), tz = 'UTC'): CalendarRange | { error: string } {
  const bad = { error: 'from and to must be dates (YYYY-MM-DD) or ISO date and time' }
  if ((from && !isPlainDate(from) && !parseDateBound(from, tz)) || (to && !isPlainDate(to) && !parseDateBound(to, tz))) return bad
  const today = localDateOf(now, tz)
  const fromDay = from ? (isPlainDate(from) ? from : null) : `${today.slice(0, 7)}-01`
  const f = parseDateBound(fromDay ?? from, tz)
  if (!f) return bad
  const fromLocal = localDateOf(f, tz)
  const lastOfMonth = (day: string) => {
    const [y, m] = day.split('-').map(Number)
    return `${day.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  }
  const toDay = to ? (isPlainDate(to) ? to : null) : lastOfMonth(fromLocal)
  const t = parseDateBound(toDay ?? to, tz, true)
  if (!t) return bad
  if (t.getTime() < f.getTime()) return { error: 'to must not be before from' }
  if (t.getTime() - f.getTime() > MAX_RANGE_DAYS * DAY) return { error: `Ask for at most ${MAX_RANGE_DAYS} days at a time` }
  return { from: f, to: t, days: fromDay && toDay ? { from: fromDay, to: toDay } : null, timeZone: tz }
}

/** Is an item on one of the days (YYYY-MM-DD)? All-day items carry plain dates; timed ones are placed on the day they start and end in the zone. */
export function itemInDays(item: { all_day: boolean; start: string; end: string }, days: { from: string; to: string }, tz: string): boolean {
  if (item.all_day) return item.start <= days.to && item.end >= days.from
  const start = new Date(item.start)
  const end = new Date(item.end)
  const last = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : end
  return localDateOf(start, tz) <= days.to && localDateOf(last, tz) >= days.from
}
