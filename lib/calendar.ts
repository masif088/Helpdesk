/**
 * Calendar on the server: reads and writes `calendar_events`, and adds the dates that come from elsewhere (ticket due dates,
 * invoice due dates). The rules (types, validation, repeating, who sees what) are in `lib/calendar-core.ts`.
 */
import { isAdminOrManager, isInternalUser } from '@/lib/auth-utils'
import {
  CALENDAR_ITEM_ORDER,
  type CalendarItem,
  type CalendarType,
  type CalendarViewer,
  canSeeEvent,
  cleanEventInput,
  DERIVED_TYPES,
  type DerivedType,
  type EventFields,
  expandOccurrences,
  isCalendarItemType,
  itemTimes,
  mayChangeEvent,
  mayCreateEvent,
  TYPE_INFO,
} from '@/lib/calendar-core'
import { forgetCalendarHolidays } from '@/lib/calendar-holidays'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { customerTicketsAccessPredicate } from '@/lib/customer-ticket-access'
import {
  calendarEvents,
  type CalendarEventsRow,
  companies,
  find,
  findBy,
  get,
  getManyMap,
  insert,
  invoices,
  remove,
  teamMembers,
  teams,
  ticketAssignees,
  tickets,
  type TicketsRow,
  update,
  users,
} from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export async function calendarViewer(user: { id: string; role?: string | null }): Promise<CalendarViewer> {
  const role = user.role ?? undefined
  const isStaff = isInternalUser(role)
  return {
    id: user.id,
    isStaff,
    isManager: isAdminOrManager(role),
    companyId: isStaff ? null : await getCustomerCompanyId(user.id),
  }
}

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : '')
const asDate = (d: Date | string) => new Date(d)

/** The event as the API takes it (so an update can be merged with the stored values and validated again). */
function rowToInput(r: CalendarEventsRow): Record<string, unknown> {
  const t = itemTimes(r.allDay, asDate(r.startAt), asDate(r.endAt))
  return {
    type: r.type,
    title: r.title,
    description: r.description,
    start: t.start,
    end: t.end,
    all_day: r.allDay,
    location: r.location,
    meeting_url: r.meetingUrl,
    color: r.color,
    visibility: r.visibility,
    owner_id: r.ownerId,
    attendee_ids: r.attendeeIds ?? [],
    company_id: r.companyId,
    ticket_id: r.ticketId,
    repeat: r.repeat,
    repeat_until: r.repeatUntil ? iso(r.repeatUntil).slice(0, 10) : null,
  }
}

const accessOf = (r: CalendarEventsRow) => ({
  type: r.type as CalendarType,
  visibility: r.visibility as EventFields['visibility'],
  ownerId: r.ownerId,
  attendeeIds: r.attendeeIds ?? [],
  companyId: r.companyId,
  createdBy: r.createdBy,
})

function toItem(r: CalendarEventsRow, start: Date, end: Date, viewer: CalendarViewer): CalendarItem {
  const t = itemTimes(r.allDay, start, end)
  const type = r.type as CalendarType
  return {
    id: r.id,
    source: 'event',
    type,
    title: r.title,
    description: r.description,
    start: t.start,
    end: t.end,
    all_day: r.allDay,
    color: r.color || TYPE_INFO[type]?.color || TYPE_INFO.other.color,
    location: r.location,
    meeting_url: r.meetingUrl,
    visibility: r.visibility as CalendarItem['visibility'],
    owner_id: r.ownerId,
    attendee_ids: r.attendeeIds ?? [],
    company_id: r.companyId,
    ticket_id: r.ticketId,
    repeat: r.repeat as CalendarItem['repeat'],
    occurrence: r.recurring ? iso(r.startAt) : null,
    editable: mayChangeEvent(accessOf(r), viewer),
  }
}

export type CalendarQuery = {
  from: Date
  to: Date
  /** Only these types (stored and derived); empty = all */
  types?: string[]
  /** Events owned by, created by or attended by these users; tickets assigned to them */
  userIds?: string[]
  companyIds?: string[]
  /** Add ticket due dates and invoice due dates (default true) */
  includeDerived?: boolean
}

const MAX_RANGE_DAYS = 400

export function parseCalendarRange(from: string | null, to: string | null, now = new Date()): { from: Date; to: Date } | { error: string } {
  const f = from ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00.000Z` : from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const t = to
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to)
    : new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return { error: 'from and to must be dates (YYYY-MM-DD) or ISO date and time' }
  if (t.getTime() < f.getTime()) return { error: 'to must not be before from' }
  if (t.getTime() - f.getTime() > MAX_RANGE_DAYS * 86_400_000) return { error: `Ask for at most ${MAX_RANGE_DAYS} days at a time` }
  return { from: f, to: t }
}

/** Staff may see tickets of public teams, teams they are in, and tickets without a team; admins and managers see all. */
async function staffTicketPredicate(viewer: CalendarViewer): Promise<(t: Pick<TicketsRow, 'teamId'>) => boolean> {
  if (viewer.isManager) return () => true
  const [memberships, publicTeams] = await Promise.all([findBy(teamMembers, { userId: viewer.id }), find(teams, { where: [['type', '==', 'public']] })])
  const visible = new Set([...memberships.map((m) => m.teamId), ...publicTeams.map((t) => t.id)])
  return (t) => !t.teamId || visible.has(t.teamId)
}

async function dueTicketItems(viewer: CalendarViewer, q: CalendarQuery): Promise<CalendarItem[]> {
  const rows = await find(tickets, { where: [['dueDate', '>=', q.from], ['dueDate', '<=', q.to]], limit: 1000 })
  const allowed = viewer.isStaff ? await staffTicketPredicate(viewer) : customerTicketsAccessPredicate(viewer.id, viewer.companyId)
  let open = rows.filter((t) => (t.ticketType ?? DEFAULT_TICKET_TYPE) === DEFAULT_TICKET_TYPE && (t.status === 'pending' || !isClosedLikeTicketStatus(t.status)) && allowed(t as TicketsRow))
  if (q.companyIds?.length) open = open.filter((t) => t.companyId && q.companyIds!.includes(t.companyId))
  if (q.userIds?.length && viewer.isStaff) {
    const links = await find(ticketAssignees, { where: [['userId', 'in', q.userIds.slice(0, 30)]], select: ['ticketId', 'userId'] })
    const mine = new Set(links.map((l) => l.ticketId))
    open = open.filter((t) => mine.has(t.id))
  }
  return open.map((t) => {
    const day = iso(t.dueDate).slice(0, 10)
    return {
      id: `ticket:${t.id}`,
      source: 'ticket' as const,
      type: 'ticket_due' as const,
      title: `#${t.id} ${t.title}`,
      description: null,
      start: day,
      end: day,
      all_day: true,
      color: TYPE_INFO.ticket_due.color,
      location: null,
      meeting_url: null,
      visibility: null,
      owner_id: null,
      attendee_ids: [],
      company_id: t.companyId ?? null,
      ticket_id: t.id,
      repeat: 'none' as const,
      occurrence: null,
      editable: false,
    }
  })
}

async function dueInvoiceItems(viewer: CalendarViewer, q: CalendarQuery): Promise<CalendarItem[]> {
  if (!viewer.isManager) return []
  const from = iso(q.from).slice(0, 10)
  const to = iso(q.to).slice(0, 10)
  const rows = await find(invoices, { where: [['dueDate', '>=', from], ['dueDate', '<=', to]], limit: 500 })
  const unpaid = rows.filter((i) => i.status === 'issued' && i.dueDate && (!q.companyIds?.length || q.companyIds.includes(i.companyId)))
  const companyById = await getManyMap(companies, unpaid.map((i) => i.companyId))
  return unpaid.map((i) => ({
    id: `invoice:${i.id}`,
    source: 'invoice' as const,
    type: 'invoice_due' as const,
    title: `Invoice ${i.number} due${companyById.get(i.companyId)?.name ? `: ${companyById.get(i.companyId)!.name}` : ''}`,
    description: null,
    start: i.dueDate!,
    end: i.dueDate!,
    all_day: true,
    color: TYPE_INFO.invoice_due.color,
    location: null,
    meeting_url: null,
    visibility: null,
    owner_id: null,
    attendee_ids: [],
    company_id: i.companyId,
    ticket_id: null,
    repeat: 'none' as const,
    occurrence: null,
    editable: false,
  }))
}

/** Everything on the calendar between `from` and `to` that this viewer may see, oldest first. */
export async function listCalendarItems(viewer: CalendarViewer, q: CalendarQuery): Promise<CalendarItem[]> {
  const wanted = new Set((q.types ?? []).filter(isCalendarItemType))
  const wants = (type: string) => wanted.size === 0 || wanted.has(type as CalendarType)

  const [ongoing, repeating] = await Promise.all([
    find(calendarEvents, { where: [['endAt', '>=', q.from]], orderBy: [['endAt', 'asc']], limit: 3000 }),
    find(calendarEvents, { where: [['recurring', '==', true]], limit: 1000 }),
  ])
  const rows = [...new Map([...ongoing, ...repeating].map((r) => [r.id, r])).values()]

  const items: CalendarItem[] = []
  for (const r of rows) {
    if (!wants(r.type) || !canSeeEvent(accessOf(r), viewer)) continue
    if (q.companyIds?.length && (!r.companyId || !q.companyIds.includes(r.companyId))) continue
    if (q.userIds?.length && !(q.userIds.includes(r.ownerId ?? '') || q.userIds.includes(r.createdBy ?? '') || (r.attendeeIds ?? []).some((a) => q.userIds!.includes(a)))) continue
    const occurrences = expandOccurrences({ startAt: asDate(r.startAt), endAt: asDate(r.endAt), repeat: r.repeat as EventFields['repeat'], repeatUntil: r.repeatUntil ? asDate(r.repeatUntil) : null }, q.from, q.to)
    for (const o of occurrences) items.push(toItem(r, o.start, o.end, viewer))
  }

  if (q.includeDerived !== false) {
    const derived = await Promise.all([wants('ticket_due') ? dueTicketItems(viewer, q) : [], wants('invoice_due') && !q.userIds?.length ? dueInvoiceItems(viewer, q) : []])
    items.push(...derived.flat())
  }
  return items.sort(CALENDAR_ITEM_ORDER)
}

/** One stored event the viewer may see (a repeating event comes back as its first occurrence). */
export async function getCalendarEvent(viewer: CalendarViewer, id: string): Promise<CalendarItem> {
  const r = await get(calendarEvents, id)
  if (!r || !canSeeEvent(accessOf(r), viewer)) throw new CalendarError('Event not found', 404)
  return toItem(r, asDate(r.startAt), asDate(r.endAt), viewer)
}

/** Checks that need the database: the people, company and ticket named must exist; wider visibility needs a manager. */
async function checkReferences(f: EventFields, viewer: CalendarViewer): Promise<void> {
  if (f.visibility === 'everyone' && !viewer.isManager) throw new CalendarError('Only a manager can make an event visible to all clients', 403)
  if (f.visibility === 'company' && !f.companyId) throw new CalendarError('company_id is required when visibility is "company"', 400)
  const ids = [...new Set([...(f.ownerId ? [f.ownerId] : []), ...f.attendeeIds])]
  if (ids.length) {
    const found = await getManyMap(users, ids)
    const missing = ids.filter((i) => !found.has(i))
    if (missing.length) throw new CalendarError(`Unknown user id: ${missing.slice(0, 3).join(', ')}`, 400)
  }
  if (f.companyId && !(await get(companies, f.companyId))) throw new CalendarError('Unknown company_id', 400)
  if (f.ticketId && !(await get(tickets, f.ticketId))) throw new CalendarError('Unknown ticket_id', 400)
}

const toRow = (f: EventFields) => ({
  type: f.type,
  title: f.title,
  description: f.description,
  startAt: f.startAt,
  endAt: f.endAt,
  allDay: f.allDay,
  location: f.location,
  meetingUrl: f.meetingUrl,
  color: f.color,
  visibility: f.visibility,
  ownerId: f.ownerId,
  attendeeIds: f.attendeeIds,
  companyId: f.companyId,
  ticketId: f.ticketId,
  repeat: f.repeat,
  repeatUntil: f.repeatUntil,
  recurring: f.repeat !== 'none',
})

export async function createCalendarEvent(viewer: CalendarViewer, body: Record<string, unknown>): Promise<CalendarItem> {
  if (!viewer.isStaff) throw new CalendarError('Only the team can add calendar events', 403)
  const cleaned = cleanEventInput(body)
  if (!cleaned.ok) throw new CalendarError(cleaned.error, 400)
  const f = cleaned.value
  // Leave and reminders are about the person who makes them unless someone else is named
  if ((f.type === 'leave' || f.type === 'reminder') && !f.ownerId) f.ownerId = viewer.id
  if (!mayCreateEvent(f.type, f.ownerId, viewer)) {
    throw new CalendarError(f.type === 'holiday' ? 'Only a manager can add holidays' : 'You can only add leave for yourself', 403)
  }
  if (f.type === 'reminder' && f.ownerId !== viewer.id) throw new CalendarError('A reminder is always your own', 400)
  await checkReferences(f, viewer)
  const row = await insert(calendarEvents, { ...toRow(f), createdBy: viewer.id })
  if (f.type === 'holiday') forgetCalendarHolidays()
  return toItem(row, asDate(row.startAt), asDate(row.endAt), viewer)
}

export async function updateCalendarEvent(viewer: CalendarViewer, id: string, patch: Record<string, unknown>): Promise<CalendarItem> {
  const existing = await get(calendarEvents, id)
  if (!existing || !canSeeEvent(accessOf(existing), viewer)) throw new CalendarError('Event not found', 404)
  if (!mayChangeEvent(accessOf(existing), viewer)) throw new CalendarError('You cannot change this event', 403)
  const cleaned = cleanEventInput({ ...rowToInput(existing), ...patch })
  if (!cleaned.ok) throw new CalendarError(cleaned.error, 400)
  const f = cleaned.value
  if (f.type !== existing.type && !mayCreateEvent(f.type, f.ownerId, viewer)) throw new CalendarError('You cannot change it into that type', 403)
  if (f.type === 'leave' && f.ownerId && f.ownerId !== viewer.id && !viewer.isManager) throw new CalendarError('You can only add leave for yourself', 403)
  await checkReferences(f, viewer)
  const row = await update(calendarEvents, id, { ...toRow(f), updatedAt: new Date() })
  if (f.type === 'holiday' || existing.type === 'holiday') forgetCalendarHolidays()
  if (!row) throw new CalendarError('Event not found', 404)
  return toItem(row, asDate(row.startAt), asDate(row.endAt), viewer)
}

export async function deleteCalendarEvent(viewer: CalendarViewer, id: string): Promise<void> {
  const existing = await get(calendarEvents, id)
  if (!existing || !canSeeEvent(accessOf(existing), viewer)) throw new CalendarError('Event not found', 404)
  if (!mayChangeEvent(accessOf(existing), viewer)) throw new CalendarError('You cannot delete this event', 403)
  await remove(calendarEvents, id)
  if (existing.type === 'holiday') forgetCalendarHolidays()
}

/** What the viewer may do and the choices for the forms: used by the page, the API builder and AI assistants. */
export function calendarLookup(viewer: CalendarViewer) {
  return {
    can_create: viewer.isStaff,
    types: (Object.keys(TYPE_INFO) as (CalendarType | DerivedType)[]).map((type) => ({
      type,
      label: TYPE_INFO[type].label,
      color: TYPE_INFO[type].color,
      description: TYPE_INFO[type].hint,
      derived: (DERIVED_TYPES as readonly string[]).includes(type),
      default_all_day: TYPE_INFO[type].allDay,
      default_visibility: TYPE_INFO[type].visibility,
      can_create: !(DERIVED_TYPES as readonly string[]).includes(type) && mayCreateEvent(type as CalendarType, null, viewer),
    })),
    repeats: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
    visibilities: ['private', 'staff', 'company', 'everyone'].filter((v) => viewer.isManager || v !== 'everyone'),
  }
}
