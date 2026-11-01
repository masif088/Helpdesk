/**
 * An iCalendar (.ics) file of calendar items, for Google Calendar, Apple Calendar, Outlook and the like (RFC 5545). Pure: no
 * database imports. All-day items become date events (the end day is exclusive in iCal, so one day is added); timed ones are in UTC.
 */
import { type CalendarItem, TYPE_INFO } from './calendar-core.ts'

const CRLF = '\r\n'

/** Escape text values: backslash, semicolon, comma and line breaks. */
export const icsEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Fold a line at 75 octets, continuation lines start with one space (never inside a multi-byte character). */
export function icsFold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  const limit = () => (out.length === 0 ? 75 : 74)
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8')
    if (bytes + n > limit()) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join(CRLF)
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const dateOnly = (s: string) => s.replace(/-/g, '')
const dayAfter = (s: string) => dateOnly(new Date(new Date(`${s}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10))

export function buildIcs(items: CalendarItem[], opts: { name: string; now?: Date; host?: string; baseUrl?: string }): string {
  const now = opts.now ?? new Date()
  const host = opts.host || 'calendar.invalid'
  const base = (opts.baseUrl ?? '').replace(/\/+$/, '')
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Helpdesk//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(opts.name)}`]

  for (const i of items) {
    const label = TYPE_INFO[i.type].label
    const description = [i.description, i.meeting_url ? `Join: ${i.meeting_url}` : null].filter(Boolean).join('\n')
    const url = i.source === 'ticket' && i.ticket_id && base ? `${base}/tickets/${i.ticket_id}` : i.meeting_url || (base && i.source === 'event' ? `${base}/calendar?date=${i.start.slice(0, 10)}` : null)
    const transparent = i.type === 'holiday' || i.type === 'ticket_due' || i.type === 'invoice_due' || i.type === 'reminder'
    lines.push(
      'BEGIN:VEVENT',
      // A repeating event comes as several occurrences with one id: the start tells them apart
      `UID:${i.id}-${i.start.replace(/[^0-9A-Za-z]/g, '')}@${host}`,
      `DTSTAMP:${stamp(now)}`,
      ...(i.all_day ? [`DTSTART;VALUE=DATE:${dateOnly(i.start)}`, `DTEND;VALUE=DATE:${dayAfter(i.end)}`] : [`DTSTART:${stamp(new Date(i.start))}`, `DTEND:${stamp(new Date(i.end))}`]),
      `SUMMARY:${icsEscape(i.title)}`,
      ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
      ...(i.location ? [`LOCATION:${icsEscape(i.location)}`] : []),
      ...(url ? [`URL:${url}`] : []),
      `CATEGORIES:${icsEscape(label)}`,
      'STATUS:CONFIRMED',
      `TRANSP:${transparent ? 'TRANSPARENT' : 'OPAQUE'}`,
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(icsFold).join(CRLF) + CRLF
}
