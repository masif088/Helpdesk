# Calendar

One calendar for the team (and, where it is meant for them, for clients): **Calendar** in the sidebar, and the API in
[api.md](api.md).

## What is on it

Events you add:

| Type | For | Default |
| --- | --- | --- |
| `meeting` | A call or meeting: time, people, link | timed, team |
| `leave` | Time off for one person (cuti) | all day, team |
| `holiday` | Public or company holiday (managers add them) | all day, everyone |
| `event` | Anything else with a date | timed, team |
| `training` | Training, workshop, onboarding | timed, team |
| `maintenance` | Planned downtime | timed, team |
| `reminder` | A personal reminder | timed, only you |
| `other` | Does not fit the rest | timed, team |

Shown next to them, computed from elsewhere (read only):

| Type | From |
| --- | --- |
| `ticket_due` | A ticket's due date (open support tickets you may see) |
| `invoice_due` | An unpaid invoice's due date (managers only) |

## Who sees what

An event has a **visibility**: `private` (only its owner or maker, not even managers), `staff` (the team), `company` (the team
and the client company in `company_id`) or `everyone` (the team and all clients, managers only). People invited to an event and
the person it is about can always see it.

Clients only read: they see `everyone` events (holidays, announcements), events for their company, and events they are invited to.
Only the team adds events. Staff change what they made (and their own leave); managers change anything. Holidays are for managers.
Ticket due dates follow ticket access: a client sees their company's tickets, staff see their teams'.

## Repeating events

`repeat` is `none`, `daily`, `weekly`, `monthly` or `yearly`, optionally until `repeat_until`. A repeating event is stored once and
unfolded into occurrences for the range you ask for; months and years keep the day of the month (the 31st becomes the 30th or 28th
in shorter months). Editing or deleting acts on the whole series. A yearly holiday needs adding only once.

## Invitations, answers and reminders

- **Invite** people by adding them as `attendee_ids` (people on the team, or clients when it is meant for them). Only a **meeting, event or training** has a guest list: a holiday, leave, reminder or
  maintenance window refuses attendees and shows no accept / decline, and changing an event into one of those kinds drops the people who were invited. New attendees get a **bell notification** and an
  **email** (sent from the connected Gmail, with the time in the time zone of the SLA calendar, default UTC+7). When an event they are in is
  **moved, renamed or cancelled**, they are told again. The person who makes the change is never notified about it.
- **Answer:** an invited person can accept, say maybe, or decline in the calendar, or with `POST /api/calendar/events/{id}/respond`. The maker gets a bell
  notification. A declined person gets no reminders. Answers of people who are removed from an event are dropped.
- **Reminders:** the hourly job (`/api/cron/inbox-reminders`) sends a bell notification for every timed event (meeting, event, training, maintenance) that starts
  within the next hour, once per occurrence, to the people invited and the maker. A personal `reminder` goes to its owner. All-day items and holidays are not reminded.
  A moved event is reminded again for its new time. Because the job runs hourly, the reminder can arrive anywhere from a minute to an hour before the start.
- Links in the notifications open the calendar on that day (`/calendar?date=YYYY-MM-DD`).

## Calendar feed (Google, Apple, Outlook)

**Calendar → Subscribe** gives each person a private link (an iCal feed) that Google Calendar, Apple Calendar or Outlook can subscribe to and keep up to date
by themselves. It shows exactly what that person sees in the portal (stored events with repeats unfolded, ticket and invoice due dates), from 30 days back to
180 days ahead. Anyone with the link can read the calendar, so it is secret: **Reset link** makes a new one and the old one stops at once, **Switch off** stops it.

- The link is `/api/calendar/ics/<token>.ics`. The token is the user id plus a signature made with the server secret (`CSAT_LINK_SECRET`, else `SYNC_INBOX_CRON_SECRET`)
  and a nonce kept in `app_settings` (`calendar_feed_nonce:<userId>`); no nonce means the feed is off.
- Subscribers poll on their own schedule. Google can take several hours to show a change.
- The feed is one way: changes made in Google do not come back. API keys cannot manage feeds (login only).

## Dates

- A **timed** event is a real moment, stored in UTC and shown in the viewer's time zone.
- An **all-day** event is a plain date. It is stored from 00:00 to 23:59:59.999 UTC of its days and shown as `YYYY-MM-DD`; in the API
  `end` is the **last** day, inclusive. It never slides to another day in another time zone.

## Where the code is

| Piece | File |
| --- | --- |
| Types, validation, repeating, who may do what (pure, tested) | `lib/calendar-core.ts` |
| Reading and writing, ticket and invoice due dates | `lib/calendar.ts` |
| Collection | `calendar_events` in `lib/fsdb/schema.ts` |
| API | `app/api/calendar/**` |
| Page | `components/content/calendar/CalendarContent.tsx` |
