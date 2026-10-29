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
