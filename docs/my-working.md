# My working

**Tickets → My working** in the sidebar (every team member; not for client contacts). It shows what **you** worked on, from your own time entries
(the ticket timer and manual time), for today, yesterday, this week, the last 7 or 30 days, or any range you pick **to the minute**, up to **30 days**.

What is on the page:

- **Cards:** time tracked and the number of entries, tickets worked on, first start to last stop, meetings (from the calendar, not part of tracked time) and your open tickets now.
- **A timeline:** per hour for a period of up to 3 days, per day for a longer one.
- **Tickets worked on:** each ticket with the time you gave it and its share of the total.
- **Time entries, newest first:** the day, from and to (to the second), the duration, the ticket, its company and status. A timer that is still running shows as *running*.
- A banner when a timer is running now, when you are on leave, or when the period has a holiday.

All times are in the app time zone (Settings → Time zone). A plain date means that whole day in that zone; picking a range uses the exact moments. A time entry that crosses the
edge of the period counts only the part inside it. The page refreshes itself every minute.

## The endpoint

`GET /api/me/working?from=…&to=…` (login only: an API key cannot call it). `from` and `to` are dates (`2026-11-08`, whole days) or exact moments
(`2026-11-08T09:00:00+07:00`); without them the period is today. More than 30 days answers `400`. The answer has `from`, `to`, `time_zone`, `breakdown` (`hour` or `day`)
and `me`: the same numbers as one person of `GET /api/users/activity` (see [api.md](api.md)) plus `sessions_list`, every time entry with `ticket_id`, `title`, `status`, `company`,
`start`, `end`, `seconds` and `running` (the latest 500). Managers can ask the same of the team with `include_sessions=1` on `GET /api/users/activity`.

Where the code is: the query rules in `lib/people-activity-core.ts` (`parseMyWorkingQuery`, tested), the numbers in `lib/people-activity.ts`, the route in `app/api/me/working/route.ts`
and the page in `components/content/my-working/MyWorkingContent.tsx`.
