/**
 * The skill file (SKILL.md) an AI assistant loads to work with the ticket and calendar API. The base URL is filled in by the
 * caller; the key itself is never part of it: the assistant reads it from the environment variable TICKETING_API_KEY.
 * The endpoint reference at the end is generated from `lib/api-catalog.ts`, so it never drifts from the API builder.
 */
// Relative, with the extension, on purpose: the tests load this file with plain Node, which knows no `@/` alias
import { API_ENDPOINTS, paramTable } from './api-catalog.ts'

export function buildApiSkill(baseUrl: string, callsPerHour = 100): string {
  const base = baseUrl.replace(/\/+$/, '')
  const reference = (['Tickets', 'Calendar', 'Team'] as const)
    .map((group) => {
      const endpoints = API_ENDPOINTS.filter((e) => e.group === group)
      return `### ${group}\n\n${endpoints
        .map((e) => {
          const path = e.params.filter((p) => p.where === 'path')
          const query = e.params.filter((p) => p.where === 'query')
          const body = e.params.filter((p) => p.where === 'body')
          return [
            `#### \`${e.method} ${e.path}\``,
            '',
            `${e.summary} Key permission: \`${e.scope}\`.`,
            ...(path.length ? ['', 'Path:', '', paramTable(path)] : []),
            ...(query.length ? ['', 'Query parameters:', '', paramTable(query)] : []),
            ...(body.length ? ['', 'JSON body:', '', paramTable(body)] : []),
          ].join('\n')
        })
        .join('\n\n')}`
    })
    .join('\n\n')

  return `---
name: ticketing-api
description: Work with the support tickets and the team calendar of the portal at ${base} through its API. Use when the user asks to find, open, check or comment on tickets (by date, client, person, skill, type or status), or to look up, add, move or cancel meetings, leave, holidays, due dates and other calendar events.
---

# Ticketing portal API (tickets and calendar)

Base URL: \`${base}\`
Authentication: header \`Authorization: Bearer $TICKETING_API_KEY\` on every call. The key is in the environment variable \`TICKETING_API_KEY\`. Never print it, never put it in a ticket, comment or event, never send it anywhere except this base URL.

The key acts as one portal user, so you only see and do what that user may (a client contact sees only their own company's tickets and the calendar items meant for them). Bodies are JSON (\`Content-Type: application/json\`). Text fields called \`description\` or \`comment\` on tickets are HTML: wrap paragraphs in \`<p>…</p>\` and escape \`<\` and \`&\` in plain text. Calendar \`description\` is plain text. This file is also served, always current, at \`${base}/api/skill\`.

## What you can do

| Goal | Call |
| --- | --- |
| Valid ticket types, teams, statuses | \`GET /api/tickets/lookup\` |
| Find tickets (many filters) | \`GET /api/tickets?compact=1&…\` |
| Read one ticket with its comments | \`GET /api/tickets/{id}/detail\` |
| Open a ticket | \`POST /api/tickets\` |
| Comment on a ticket | \`POST /api/tickets/{id}/comments\` |
| Change status, assignees or due date (team keys) | \`PATCH /api/tickets/{id}\` |
| See the calendar for a period | \`GET /api/calendar/events?from=…&to=…\` |
| Valid calendar types, and what you may create | \`GET /api/calendar/lookup\` |
| Add, change, delete an event | \`POST\` / \`PATCH\` / \`DELETE /api/calendar/events[/{id}]\` |
| Who is working, how loaded is the team (admins and managers) | \`GET /api/users/activity?from=…&to=…\` |

Not available to a key: editing anything but the status, assignees and due date, deleting tickets, uploads, and anything else. If the user wants that, tell them to do it in the portal.

## Finding tickets

Always send \`compact=1\` for lists: you get short rows (\`id\`, \`title\`, \`status\`, \`type\`, \`company\`, \`requester\`, \`assignees\`, \`tags\`, dates, \`url\`) instead of whole tickets. Add \`paginated=1\` to get \`{ data, total }\` and page with \`limit\` (max 500) and \`offset\`. Filters combine with AND; inside a list (\`a,b\`) any value may match.

| The user asks for | Use |
| --- | --- |
| Tickets of a period | \`date_from=2026-11-01&date_to=2026-11-30\` (created); \`updated_from\` / \`updated_to\` (last change); \`due_date_from\` / \`due_date_to\` |
| Tickets of a client company | \`company_ids=<id>\` |
| Tickets a client person opened or is the contact of | \`customer_ids=<user id>\` (\`creator_ids\` = opened by) |
| Tickets of a team member | \`assignee_ids=<user id>\`, or \`me\` for the key's own user |
| Nobody works on it yet | \`unassigned=1\` |
| Tickets that need a skill | \`skills=WordPress,Billing\` (any), add \`skills_match=all\` for every one |
| Tickets of a type or status | \`type_ids=<id>\` (from the lookup), \`status=open,question\` |
| Late tickets | \`overdue=1\`; \`open=1\` for unfinished only; \`has_due_date=1\` |
| A word or phrase | \`search=printer\` |

Examples:

\`\`\`
GET /api/tickets?compact=1&paginated=1&assignee_ids=me&open=1&limit=20
GET /api/tickets?compact=1&company_ids=<id>&date_from=2026-10-01&date_to=2026-10-31
GET /api/tickets?compact=1&skills=WordPress&unassigned=1&overdue=1
\`\`\`

Ids for companies come from \`GET /api/tickets/lookup\` (\`companies[]\`), and for people from the user or from an earlier answer (a ticket row has \`company.id\`, \`requester.id\`, \`assignees[].id\`); a key is never given the people list. The filters on people and skills (\`assignee_ids\`, \`unassigned\`, \`creator_ids\`, \`customer_ids\`, \`skills\`, \`updated_*\`, \`overdue\`, \`open\`, \`has_due_date\`) are for staff keys; a client key is already limited to its own company. Do not invent ids: if you need one you do not have, ask the user. Summarise results instead of pasting raw JSON.

## Creating a ticket

1. \`GET /api/tickets/lookup\` once and pick the type that fits (\`ticketTypes[].id\`). A type is required for clients.
2. Search first (\`GET /api/tickets?compact=1&search=<keywords>\`). If the same problem is already open, add a comment there instead of a duplicate.
3. \`POST /api/tickets\`:

\`\`\`json
{ "title": "Printer on floor 2 is offline", "description": "<p>Since this morning. Error E-102.</p>", "type_id": 3, "priority": 2 }
\`\`\`

The answer contains the new ticket \`id\`. Tell the user the number and the link: \`${base}/tickets/{id}\`.

## Commenting

\`POST /api/tickets/{id}/comments\` with \`{ "comment": "<p>Still happening after a restart.</p>" }\`. Customers' comments are visible to the support team and the customer's colleagues. Staff keys write internal notes by default; add \`"visibility": "reply"\` only when the user asks for a reply to the customer.

## Changing a ticket

\`PATCH /api/tickets/{id}\` (key permission \`tickets:update\`, team keys only) can change exactly three things: the status, who is assigned, and the due date. Nothing else: not the title, description, company, type or priority, and a client's key cannot use it at all (403).

| To | Send |
| --- | --- |
| Move to another status | \`{ "status": "resolved" }\`: the slug from \`GET /api/tickets/lookup\` (\`statuses[].slug\`) |
| Add someone | \`{ "add_assignees": ["<user id>"] }\` |
| Take someone off | \`{ "remove_assignees": ["<user id>"] }\` |
| Set the whole list | \`{ "assignees": ["<user id>", "<user id>"] }\` (replaces who is there now; \`[]\` clears it) |
| Set or clear the due date | \`{ "due_date": "2026-11-20" }\` or \`{ "due_date": null }\` |

It does what a person does in the portal: the people involved are notified, the queue and automation rules run, and the activity log says the change came from the key (\`API · <key name>\`). People must be active team members, and the status must exist. Closing a ticket sends the client the closing email, so ask first.

Always ask the user before you change a ticket, say which ticket and what changes, and never assign work to someone the user did not name. Get people's ids from the user or from earlier answers (\`assignees[].id\` on a ticket row), never guess them.

## The calendar

Event types: \`meeting\`, \`leave\` (cuti), \`holiday\`, \`event\`, \`training\`, \`maintenance\`, \`reminder\` (personal, only its owner sees it), \`other\`. The list also contains items computed from elsewhere, which you cannot change: \`ticket_due\` (a ticket's due date) and \`invoice_due\` (managers only). \`GET /api/calendar/lookup\` says which types the key's user may create.

How to read an item (\`GET /api/calendar/events\` answers \`{ events: [...] }\`):

- All-day items (\`all_day: true\`) have plain dates: \`start\` \`2026-12-28\`, \`end\` \`2026-12-31\` means four days and \`end\` is the LAST day. Timed items have ISO moments in UTC (\`2026-11-03T09:00:00.000Z\`); convert to the user's time zone when you tell them.
- A repeating event appears once per occurrence inside the range, all with the same \`id\`; \`occurrence\` tells them apart. \`PATCH\` and \`DELETE\` act on the whole series.
- \`editable: false\` means the key's user may not change it.
- \`source\` is \`event\`, \`ticket\` or \`invoice\`; ids like \`ticket:12\` are not events and cannot be fetched or changed.

Workflows:

- "What is on next week?": \`GET /api/calendar/events?from=2026-11-09&to=2026-11-15\`. Add \`types=meeting,leave\`, \`user_ids=me\` or \`company_ids=<id>\` to narrow it. Ask for at most 400 days.
- "Who is off on the 25th?": \`GET /api/calendar/events?from=2026-12-25&to=2026-12-25&types=leave,holiday&include_derived=0\`.
- "Book a meeting": check the period first for clashes, then \`POST /api/calendar/events\`:

\`\`\`json
{ "type": "meeting", "title": "Weekly sync with Acme", "start": "2026-11-03T09:00:00Z", "end": "2026-11-03T09:30:00Z", "meeting_url": "https://meet.google.com/abc-defg-hij", "repeat": "weekly", "repeat_until": "2026-12-29" }
\`\`\`

- "Put me on leave 28 to 31 December": \`{ "type": "leave", "title": "Annual leave", "start": "2026-12-28", "end": "2026-12-31" }\`.
- A holiday needs a manager's key: \`{ "type": "holiday", "title": "New Year", "start": "2027-01-01", "repeat": "yearly" }\`. Holidays also stop the SLA clocks when business hours are on.
- Move or rename: \`PATCH /api/calendar/events/{id}\` with only the changed fields. Cancel: \`DELETE\`.

Who sees an event is the \`visibility\`: \`private\` (only you), \`staff\` (the team), \`company\` (the team and the client company in \`company_id\`), \`everyone\` (managers only). Only the team can add events; a client key can read what is meant for them but is refused when it writes.

## Who is working and how loaded the team is

\`GET /api/users/activity\` answers, for a period, which team members worked, for how long, on what, and what is on their plate. Only a key of an admin or manager may call it (it shows what colleagues did); anyone else gets \`403\`.

- \`from\` / \`to\`: whole days (\`2026-11-03\`) or UTC moments to look at hours (\`from=2026-11-03T09:00:00Z&to=2026-11-03T12:00:00Z\`). Default is today. At most 62 days.
- Narrow it with \`user_ids\` (\`me\` for the key's user), \`agent_skills\` (people who have the skill), \`team_ids\`, and the ticket filters \`company_ids\`, \`customer_ids\`, \`skills\` (what the ticket needs), \`type_ids\`: then only work on matching tickets counts. \`only_working=1\` leaves out people who did nothing in the period; \`breakdown=day|hour\` adds time per day or hour; \`include_tickets=1\` lists the tickets each person worked on.
- Each person has \`working\` (worked in the period or has a timer running), \`tracked_seconds\` (only the part inside the period), \`active_timer\` (the ticket they are on right now), \`load\` (open tickets assigned: \`open\`, \`active\`, \`waiting_on_client\`, \`overdue\`, \`due_in_period\`, \`matching_filters\`) and \`calendar\` (\`on_leave\`, meetings). \`totals.unassigned_matching\` counts open tickets matching your filters that nobody has.

Examples:

\`\`\`
GET /api/users/activity?from=2026-11-03T09:00:00Z&to=2026-11-03T12:00:00Z&only_working=1   who worked that morning
GET /api/users/activity?skills=WordPress&company_ids=<id>&from=2026-11-01&to=2026-11-30&include_tickets=1
GET /api/users/activity?agent_skills=Billing                                              who could take billing work, and how busy are they
\`\`\`

Report times to the user as hours and minutes, in their time zone, and say what the period was. A person on leave (\`calendar.on_leave\`) is not available even when they show no work.

## Rules

- Ask the user before creating or changing anything (a ticket, a comment, an event) unless they clearly told you to. Show them the text or the details first when it is long, sensitive or affects other people (invited attendees, holidays, visibility \`everyone\`). Never delete an event without the user saying so.
- Do not invent ids. Ticket and event ids come from the user or from a search; type ids from the lookups.
- Make as few calls as you can. The key is limited to ${callsPerHour} calls per hour by default (your admin may have set another limit). Do not poll and do not loop over all tickets: narrow with filters and page with \`limit\`.
- Status codes: \`401\` key missing, wrong, revoked, expired or without permission for that call; \`403\` not available to keys, or this user may not do that; \`404\` not found or not yours; \`400\` read \`error\` and fix the request; \`429\` limit reached, stop and tell the user when to retry (\`Retry-After\` seconds). Never retry a 401, 403 or 429 in a loop.

## Reference

Generated from the same list as the API builder (Settings → API keys → API builder).

${reference}
`
}
