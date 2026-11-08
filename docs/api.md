# API keys: tickets and calendar

For an outside tool (for example a customer's AI assistant) that needs to find, open and comment on tickets, and to read or
manage the team calendar.

**In a hurry:** connect the assistant through MCP (add `<your portal>/api/mcp` as a connector, see [mcp.md](mcp.md)). To try single calls, use **Settings → API keys → API builder** (everyone else: **Profile → API builder**); the skill file at `<your portal>/api/skill` describes the HTTP calls.

## Connecting an assistant (keys are not made by hand)

**API keys can no longer be made.** `POST /api/api-keys` and `POST /api/profile/api-keys` answer `403`. An AI assistant connects through
the portal's MCP connector at `<your portal>/api/mcp` instead: the person signs in, ticks what it may do, and the assistant gets a token that
renews itself and can be revoked. Nothing is pasted anywhere. See [mcp.md](mcp.md).

Behind the scenes that token is an ordinary key (`tk_live_…`) of kind `oauth`, so everything below (scopes, the hourly limit of 100 calls, usage,
revoking) applies to connections too. They appear in **Settings → API keys** (admins, everyone's) and **Profile** (your own) as **Connector · <assistant>**.
Keys made before this change keep working until they expire or are revoked; nobody can make a new one.

| Permission | Meaning |
| --- | --- |
| `tickets:read`, `tickets:create`, `comments:create`, `calendar:read`, `calendar:write`, `team:read`, `tickets:update` | Ticked by the person when they approve the connection. Reading is ticked from the start; `tickets:update` and `calendar:write` change data. |
| Calls per hour | Default 100, changeable per connection by an admin (in the list). More answers `429` with a `Retry-After` header. |

The key (`tk_live_…`) is shown once. Only its hash is stored. **Revoke** stops it at once (up to 30 seconds on a busy server instance).

**Who should it act as?** For a customer's AI, pick that customer's contact: the key then sees only their company's tickets, can only reply (never write internal notes) and never sees internal notes. A staff user works like that staff member does in the portal, but a comment from a key is an **internal note** unless the request says `"visibility": "reply"`.

## Calling it

```
Authorization: Bearer tk_live_xxxxxxxx
Content-Type: application/json
```

| Call | Scope | Notes |
| --- | --- | --- |
| `GET /api/tickets/lookup` | `tickets:read` | Ticket types, teams, statuses, companies: the ids to use in filters and when creating. |
| `GET /api/tickets` | `tickets:read` | List and search, with many filters (below). |
| `GET /api/tickets/{id}/detail` | `tickets:read` | The ticket with its comments. |
| `POST /api/tickets` | `tickets:create` | Body: `title`, `description` (HTML), `type_id` (**required for customers**), `priority`, `company_id`, `due_date`. |
| `PATCH /api/tickets/{id}` | `tickets:update` | Change **only** `status`, who is assigned (`add_assignees`, `remove_assignees`, or the whole `assignees` list) and `due_date`. Team keys only (below). |
| `POST /api/tickets/{id}/comments` | `comments:create` | Body: `comment` (HTML), `visibility` (`reply` or `note`, staff only). |
| `GET /api/calendar/events` | `calendar:read` | The calendar in a date range (below). |
| `GET /api/calendar/events/{id}` | `calendar:read` | One stored event. |
| `GET /api/calendar/lookup` | `calendar:read` | Event types and what the key's user may create. |
| `POST /api/calendar/events` | `calendar:write` | Add an event (the team only). |
| `POST /api/calendar/events/{id}/respond` | `calendar:write` | Answer an invitation as the key's user: `accepted`, `declined` or `tentative`. Only invited people can; the maker is told. |
| `PATCH /api/calendar/events/{id}` | `calendar:write` | Change an event: send only the fields to change. |
| `DELETE /api/calendar/events/{id}` | `calendar:write` | Delete an event (all occurrences of a repeating one). |
| `GET /api/users/activity` | `team:read` | Who worked in a period and how loaded the team is (admins and managers only, below). |
| `GET /api/openapi.json` | none | The API as an OpenAPI 3.1 file, for Postman, ChatGPT Actions and the like. Public, holds no key. |
| `GET /api/skill` | none | The skill file for an AI, with this portal's address. Public, holds no key. |

Anything else answers `403 This endpoint is not available to API keys`. An unknown, revoked, expired or out-of-scope key answers `401`.
Every parameter of every call is listed in the API builder, and in the skill file.

## Dates and the time zone

The portal has **one time zone** (Settings → Time zone, default `Asia/Jakarta`); calendar, activity and lookup answers say it as `time_zone`. A plain date in a request
(`date_from=2026-11-03`, `from=2026-11-03`) means that whole day **in that zone**, so a ticket created at 02:00 on the 3rd is on the 3rd, not the 2nd. A full time with a `Z` or an
offset (`2026-11-03T09:00:00Z`, `2026-11-03T16:00:00+07:00`) is an exact moment and is taken as it is. Times in answers are exact moments (UTC); all-day calendar items are plain dates.

## Filtering tickets

`GET /api/tickets` takes any combination of these (they are combined with AND; inside a comma separated list any value may match):

| Filter | Meaning |
| --- | --- |
| `date_from`, `date_to` | Created in this period (`YYYY-MM-DD`) |
| `updated_from`, `updated_to` | Last changed in this period (staff) |
| `due_date_from`, `due_date_to` | Due in this period |
| `company_ids` | Tickets of these client companies |
| `customer_ids` | Opened by, or with as contact, these client users (staff) |
| `creator_ids` | Opened by these users (staff) |
| `assignee_ids` | Assigned to these users; `me` is the key's user (staff) |
| `unassigned=1` | Nobody is assigned (staff) |
| `skills`, `skills_match=any\|all` | Tickets that need these skills: the ticket's own, else its client's for the type, else the defaults of its type and tags (staff) |
| `type_ids`, `status`, `team_ids`, `tag_ids` | By type, status slug, team, tag |
| `overdue=1`, `open=0\|1`, `has_due_date=0\|1` | Late, finished or not, with or without a due date (staff) |
| `search` | Words in title and description |
| `scope=inbox\|mine` | Unassigned and open; assigned to me or my teams (staff) |

Paging and shape: `limit` (max 500), `offset`, `sort_order`, `sort_by=id`, `paginated=1` (answers `{ data, total }`),
`compact=1` (short rows: id, title, status, type, company, requester, assignees, tags, dates, `url`). Use `compact=1` for lists.

```
GET /api/tickets?compact=1&paginated=1&assignee_ids=me&open=1&limit=20
GET /api/tickets?compact=1&company_ids=<id>&date_from=2026-10-01&date_to=2026-10-31
GET /api/tickets?compact=1&skills=WordPress&unassigned=1&overdue=1
```

A key is never given the people list, so ids of people come from the person asking, or from earlier answers (a ticket row has
`requester.id` and `assignees[].id`). Company ids come from `GET /api/tickets/lookup`.

## Changing tickets with a key

`PATCH /api/tickets/{id}` needs the separate permission `tickets:update`, so a key that may only read and comment can never change a ticket.
It is deliberately narrow:

- It changes **only** the status (a slug from `GET /api/tickets/lookup`), the assignees and the due date. Any other field is refused with `400` and the
  name of the field. There is no delete, and the title, description, company, type and priority cannot be changed.
- Assign with `add_assignees` / `remove_assignees` (lists of user ids), or replace everyone with `assignees`. People must be active team members.
- A key of a **client** is refused (`403`). A staff key can only change tickets its user may see (their teams, public teams, tickets without a team).
- It behaves like a person in the portal: the people involved are notified, the queue order and automation rules run, closing sends the client
  the closing email, and the activity log entry carries `via` (`API · <key name>`) and `api_key_id`.

## The calendar

See [calendar.md](calendar.md) for the event types, who sees and may change what, repeating events and how dates are stored.

```
GET /api/calendar/events?from=2026-11-01&to=2026-11-30&types=meeting,leave&user_ids=me&company_ids=…&include_derived=0
```

The answer is `{ from, to, count, events: [...] }`. It contains stored events (repeating ones unfolded into occurrences) and
items computed from elsewhere: `ticket_due` (a ticket's due date) and `invoice_due` (managers only), which cannot be edited.

## Who is working: team activity

`GET /api/users/activity` shows, for a period, what each team member did and what is on their plate. It is for admins and managers
(a key must act as one): it shows what colleagues did.

```
GET /api/users/activity?from=2026-11-03T09:00:00Z&to=2026-11-03T12:00:00Z&only_working=1
GET /api/users/activity?skills=WordPress&company_ids=<id>&from=2026-11-01&to=2026-11-30&include_tickets=1
GET /api/users/activity?agent_skills=Billing        who could take billing work, and how busy are they
```

| Parameter | Meaning |
| --- | --- |
| `from`, `to` | The period: whole days in the app time zone (`2026-11-03`) or exact moments with a Z or an offset to look at hours. Default: today. At most 62 days |
| `user_ids`, `team_ids` | Only these team members, or members of these teams (`me` = the key's user) |
| `agent_skills` | Only people who have one of these skills themselves |
| `company_ids`, `customer_ids`, `type_ids` | Only work on tickets of these companies, opened by (or with as contact) these client users, of these types |
| `skills`, `skills_match=any\|all` | Only work on tickets that need these skills (the ticket's own, else its client's for the type, else the defaults of type and tags) |
| `only_working=1` | Leave out people who did not work in the period |
| `breakdown=day\|hour` | Add the time per day or per hour (hour: at most 3 days) |
| `include_tickets=1` | List the tickets each person worked on, with the time on each |

Per person you get:

- `working`, `tracked_seconds`, `sessions`, `first_start`, `last_end`: the time they tracked **inside the period**. An entry that crosses the edge counts
  only its overlap; an entry fully inside counts its reported time (adjustments included, like billing). A running timer counts up to now.
- `active_timer`: the ticket they are working on right now.
- `load`: open support tickets assigned to them: `open`, `active` (not waiting on the client), `waiting_on_client`, `overdue`,
  `due_in_period`, and `matching_filters` (those that pass the ticket filters).
- `calendar`: `on_leave` (with the leave entries) and the meetings they are in, in the period.

`totals.unassigned_matching` counts open tickets that match the ticket filters and that nobody is assigned to: work waiting for someone.
`holidays` lists the calendar holidays in the period.

## How API activity is marked

- Ticket: **Source** reads `API · <key name>`, `created_via` is `api` (automation rules can match on it), and the activity log entry carries `via` and `api_key_id`.
- Comment: a blue tag `API · <key name>` under the text (staff view), `via` in the JSON, and `via` / `api_key_id` in the activity log.
- The author shown is the user the key acts as. The key name tells the tool apart from the person.

## Key usage

Every call a key makes is counted, per key and per day (the `api_key_usage` collection, one small record per key per day). **Settings → API keys** shows for each key the
calls of the last 7 and 30 days, a tag when it hit its hourly limit, and (open the row) a 30-day chart with the calls per permission. **Profile → API keys** shows the same
for your own keys. "Last used" is exact to the ten minutes.

- Counted: calls the key was allowed to make, and calls refused because the hourly limit was reached (shown separately). A call refused before it reaches the key check
  (an endpoint keys may not use, or an unknown key) is not counted.
- The chart and totals are per permission ("Read tickets: 120, Read calendar: 14"). To see what was actually called, open the row: **Recent calls** lists the latest 100 calls of the past
  30 days, newest first: the time (in the app time zone), what it was in words ("Opened a ticket #12", "Read the calendar"), the exact call with its filters
  (`GET /api/tickets?status=open`), whether it came through an **MCP tool** (`tickets_list`) or plain HTTP, and a tag when it was refused for the hourly limit.
  Calls made before the log was added were counted but not recorded. Admins see the log of every key (`GET /api/api-keys/{id}/calls`); you see your own
  (`GET /api/profile/api-keys/{id}/calls`). The records are in `api_key_calls` and the hourly job removes the ones older than 30 days.
- Days are UTC (the usage records are not read in the app time zone). Records are kept; only the last 30 days are shown.

## Notes

- Creating a ticket or comment through a key triggers the same emails, notifications, SLA clocks and automation as the portal.
- The hourly count is kept in memory (one server process): it starts again from zero when the app restarts or is deployed.
- Keys cannot upload attachments or delete tickets, and with `tickets:update` they change nothing but status, assignees and due date. The people list is never returned to a key, and a customer's key sees only its own company in the lookup.
- Demo reset removes the keys of the accounts it deletes.

## OpenAPI and MCP

`GET /api/openapi.json` describes the whole API for Postman, ChatGPT Actions and Swagger UI, and `mcp/server.mjs` is an MCP server that gives an
AI assistant every call as a tool. The portal is also a remote MCP connector at `/api/mcp` that signs people in (OAuth), for assistants that refuse an API key as input. See [mcp.md](mcp.md).

## Tutorial, builder and AI skill

- **API builder** (Settings → API keys → API builder; Profile → API builder for everyone else): pick a call, fill in the
  filters (with lists of people, companies, types, statuses and skills to choose from), see the URL, curl command and body,
  and try it with your own login.
- **Tutorial** (Settings → API keys → Tutorial; Profile → *How to use it*): the step by step guide and a ready `SKILL.md`.
- **Skill file:** `GET /api/skill` (add `?download=1` for a file). It holds this portal's address and never a key: the AI
  reads the key from the environment variable `TICKETING_API_KEY`. The text is generated by `lib/api-skill.ts` from the
  endpoint list in `lib/api-catalog.ts`, the same list the builder uses, so they cannot drift apart (a test checks that every
  endpoint is in the key allowlist and in the skill file).
