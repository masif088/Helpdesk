/**
 * Telling people about calendar events: a bell notification and an email when they are invited, when an event they are in is moved
 * or cancelled, and a bell notification to the maker when someone answers. Best effort: a failure here never stops the change.
 */
import { getAppSettings } from '@/lib/app-settings'
import { type CalendarItem, formatWhen, TYPE_INFO } from '@/lib/calendar-core'
import { notifyUsers } from '@/lib/firebase/ticket-notifications-server'
import { get, getMany, users } from '@/lib/fsdb'
import { cleanCalendar } from '@/lib/sla-calendar'
import { sendHtmlEmail } from '@/lib/ticket-notification-emails'

export type CalendarNotice = 'invite' | 'update' | 'cancel'

const TITLES: Record<CalendarNotice, string> = { invite: 'Invitation', update: 'Changed', cancel: 'Cancelled' }
const BELL = { invite: 'calendar_invite', update: 'calendar_update', cancel: 'calendar_cancel' } as const

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The time zone people read times in: the one set on the SLA calendar (default UTC+7). */
async function zoneOffset(): Promise<number> {
  const s = await getAppSettings().catch(() => null)
  return cleanCalendar(s?.sla_calendar).utcOffsetMinutes
}

export async function notifyInvitees(opts: { item: CalendarItem; inviteeIds: string[]; actorId: string; kind: CalendarNotice }): Promise<void> {
  try {
    const recipients = [...new Set(opts.inviteeIds)].filter((id) => id && id !== opts.actorId)
    if (!recipients.length) return
    const [actor, people, offset] = await Promise.all([get(users, opts.actorId), getMany(users, recipients), zoneOffset()])
    const actorName = actor?.fullName || actor?.email || 'Someone'
    const when = formatWhen(opts.item, offset)
    const kindLabel = TYPE_INFO[opts.item.type].label
    const title = `${TITLES[opts.kind]}: ${opts.item.title}`
    const where = opts.item.location ? ` · ${opts.item.location}` : ''

    await notifyUsers({
      recipientUserIds: recipients,
      type: BELL[opts.kind],
      href: `/calendar?date=${opts.item.start.slice(0, 10)}`,
      label: kindLabel,
      title,
      body: `${when}${where} · ${actorName}`,
      actorName,
    })

    const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
    const link = base ? `${base}/calendar?date=${opts.item.start.slice(0, 10)}` : ''
    const html =
      `<p>${escapeHtml(actorName)} ${opts.kind === 'invite' ? 'invited you to' : opts.kind === 'update' ? 'changed' : 'cancelled'} a ${escapeHtml(kindLabel.toLowerCase())}:</p>` +
      `<p><strong>${escapeHtml(opts.item.title)}</strong><br>${escapeHtml(when)}${opts.item.location ? `<br>${escapeHtml(opts.item.location)}` : ''}</p>` +
      (opts.item.meeting_url && opts.kind !== 'cancel' ? `<p>Join: <a href="${escapeHtml(opts.item.meeting_url)}">${escapeHtml(opts.item.meeting_url)}</a></p>` : '') +
      (opts.item.description ? `<p style="white-space:pre-wrap">${escapeHtml(opts.item.description)}</p>` : '') +
      (link && opts.kind !== 'cancel' ? `<p><a href="${escapeHtml(link)}">Open the calendar</a> to accept or decline.</p>` : '')
    for (const p of people) {
      if (p.email) await sendHtmlEmail(p.email, title, html).catch((e) => console.error('[calendar] email:', e))
    }
  } catch (e) {
    console.error('[calendar] notify:', e)
  }
}

/** Tell the maker of an event how someone answered. */
export async function notifyAnswer(opts: { item: CalendarItem; makerId: string | null; answererId: string; response: string }): Promise<void> {
  try {
    if (!opts.makerId || opts.makerId === opts.answererId) return
    const [answerer, offset] = await Promise.all([get(users, opts.answererId), zoneOffset()])
    const name = answerer?.fullName || answerer?.email || 'Someone'
    await notifyUsers({
      recipientUserIds: [opts.makerId],
      type: 'calendar_response',
      href: `/calendar?date=${opts.item.start.slice(0, 10)}`,
      label: TYPE_INFO[opts.item.type].label,
      title: `${name} ${opts.response}: ${opts.item.title}`,
      body: formatWhen(opts.item, offset),
      actorName: name,
    })
  } catch (e) {
    console.error('[calendar] notify answer:', e)
  }
}
