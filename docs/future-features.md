# Future features

Ideas that are not built yet, with enough context to pick them up later. Move an item out of this file (into the
code and `docs/`) when it ships.

Already built from the earlier lists: SLA per client and ticket type, automatic retainer invoices, CSAT (rating after a
ticket is closed), canned responses, online payment (Midtrans / Xendit), SLA clocks that stop while the ball is with the
client, business hours and holidays for SLA (Settings -> SLA calendar), a public rating link in the closing email, and
Slack alerts for SLA at risk / breached, the calendar (meetings, leave, holidays, events, due dates, invitations with answers and
reminders), more ticket filters in the API, the API builder, team activity (API and the Reports page), an OpenAPI file, an MCP server, changing tickets with a key and one app time zone.

---

## Knowledge base (customers)

**Goal:** answer faster and get fewer repeat tickets.

The app already has `knowledgeBaseArticles` (`lib/knowledge-base-article-roles.ts`) and `companyKnowledgeBases`. Missing
is the customer-facing side:

- a searchable "Help" page in the portal (title + body search, categories),
- "Suggested articles" while the customer types the title of a new ticket (deflection),
- "Was this helpful?" counters per article,
- a button on a ticket to insert an article link into a reply.

**Open questions:** public (no login) articles or portal-only? Per-client articles (already modelled by
`companyKnowledgeBases`) versus global ones?

## Calendar ideas

- Week and day views, and drag and drop to move an event.
- Leave requests with approval by a manager, and a yearly leave balance.
- Two-way Google Calendar sync (the iCal feed is one way).
- Show SLA due times and recurring-ticket runs on the calendar.
- Per-team business hours for SLA, fed by the same calendar.
- Repeating events that keep their local hour across daylight saving (they repeat at a fixed UTC time now).
- API: a `calendar:read` filter by team, and webhooks when an event is added or changed.

## Other ideas worth keeping

- SLA by ticket priority level (there is no High/Low level yet; `tickets.priority` is queue position).
- SLA alerts run with the hourly cron, which is coarse for 1-hour targets; consider running the SLA check every
  15 minutes.
- The stored SLA days (`slaDaily`) were built with the old calendar-time rules; a day is only recomputed while it can
  still change, so old reports keep their numbers. Use "Refresh" on the SLA report to rebuild recent days.
- Key usage per endpoint (now per permission), with the status codes, and an alert when a key suddenly makes many more calls than usual.
- A CSAT follow-up for low scores (a reply from the account manager, or a callback task).
- Retainer: usage allowance (included hours) with overage billed automatically, and proration for a mid-month start.
- Per-team business hours (the SLA calendar is one calendar for the whole app).
