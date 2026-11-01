/**
 * Reminders for events that are about to start: run by the hourly job (`/api/cron/inbox-reminders`). Everything that starts in the
 * coming hour sends a bell notification to the people involved, once per occurrence (a repeating event is reminded for each one).
 * All-day items and holidays are not reminded.
 */
import { getAppSettings } from '@/lib/app-settings'
import { type CalendarType, expandOccurrences, formatWhen, itemTimes, REMINDER_TYPES,reminderRecipients } from '@/lib/calendar-core'
import { notifyUsers } from '@/lib/firebase/ticket-notifications-server'
import { calendarEvents, find, update } from '@/lib/fsdb'
import { cleanCalendar } from '@/lib/sla-calendar'

const WINDOW_MS = 60 * 60_000

export async function runEventReminders(now = new Date(), opts: { dryRun?: boolean } = {}): Promise<{ reminded: string[] }> {
  const until = new Date(now.getTime() + WINDOW_MS)
  const [single, repeating, settings] = await Promise.all([
    find(calendarEvents, { where: [['startAt', '>', now], ['startAt', '<=', until]], limit: 1000 }),
    find(calendarEvents, { where: [['recurring', '==', true]], limit: 1000 }),
    getAppSettings().catch(() => null),
  ])
  const offset = cleanCalendar(settings?.sla_calendar).utcOffsetMinutes
  const reminded: string[] = []

  for (const r of [...new Map([...single, ...repeating].map((e) => [e.id, e])).values()]) {
    if (r.allDay || !(REMINDER_TYPES as string[]).includes(r.type)) continue
    const next = expandOccurrences({ startAt: new Date(r.startAt), endAt: new Date(r.endAt), repeat: r.repeat as 'none', repeatUntil: r.repeatUntil ? new Date(r.repeatUntil) : null }, now, until).find((o) => o.start.getTime() > now.getTime())
    if (!next) continue
    const key = next.start.toISOString()
    if (r.reminderSentFor === key) continue
    const recipients = reminderRecipients({ type: r.type as CalendarType, ownerId: r.ownerId, attendeeIds: r.attendeeIds ?? [], createdBy: r.createdBy, responses: r.responses })
    reminded.push(`${r.title} (${key})`)
    if (opts.dryRun || !recipients.length) continue
    const t = itemTimes(false, next.start, next.end)
    await notifyUsers({
      recipientUserIds: recipients,
      type: 'calendar_reminder',
      href: `/calendar?date=${key.slice(0, 10)}`,
      label: 'Calendar',
      title: `Starting soon: ${r.title}`,
      body: `${formatWhen({ all_day: false, ...t }, offset)}${r.location ? ` · ${r.location}` : ''}`,
      actorName: 'Calendar',
    })
    await update(calendarEvents, r.id, { reminderSentFor: key })
  }
  return { reminded }
}
