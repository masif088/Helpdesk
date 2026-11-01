# API keys: tickets and calendar

For an outside tool (for example a customer's AI assistant) that needs to find, open and comment on tickets, and to read or
manage the team calendar.

**In a hurry:** build a call in **Settings → API keys → API builder** (everyone else: **Profile → API builder**), and give an
AI the skill file at `<your portal>/api/skill`.

## Getting a key

Admin: **Settings → API keys → New key**.

| Field | Meaning |
| --- | --- |
| Name | Shown on every ticket and comment made with the key, e.g. `Claude (Acme)`. Use `<tool> (<who>)`. |
| Acts as | The user the key works as. Their role and company decide what the key sees. |
| Allowed | `tickets:read`, `tickets:create`, `comments:create`, `calendar:read`, `calendar:write`, `team:read`, `tickets:update`. Give only what is needed (`tickets:update` and `calendar:write` change data). |
| Calls per hour | Default 100, changeable per key (also later, in the list). More answers `429` with a `Retry-After` header. |
| Expires | Days; empty means no expiry. |

**Everyone else makes their own** under **Profile → API keys for your AI**: the key acts as that user, lasts 14 days, allows 100 calls per hour (neither can be changed by the user; an admin can raise the limit on the Settings page), and a person can hold 5 active keys at most. An admin sees and can revoke all keys on the Settings page.

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
| `PATCH /api/calendar/events/{id}` | `calendar:write` | Change an event: send only the fields to change. |
| `DELETE /api/calendar/events/{id}` | `calendar:write` | Delete an event (all occurrences of a repeating one). |
| `GET /api/users/activity` | `team:read` | Who worked in a period and how loaded the team is (admins and managers only, below). |
| `GET /api/openapi.json` | none | The API as an OpenAPI 3.1 file, for Postman, ChatGPT Actions and the like. Public, holds no key. |
| `GET /api/skill` | none | The skill file for an AI, with this portal's address. Public, holds no key. |

Anything else answers `403 This endpoint is not available to API keys`. An unknown, revoked, expired or out-of-scope key answers `401`.
Every parameter of every call is listed in the API builder, and in the skill file.

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
| `from`, `to` | The period: whole days (`2026-11-03`) or UTC moments to look at hours. Default: today. At most 62 days |
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

## Notes

- Creating a ticket or comment through a key triggers the same emails, notifications, SLA clocks and automation as the portal.
- The hourly count is kept in memory (one server process): it starts again from zero when the app restarts or is deployed.
- Keys cannot upload attachments or delete tickets, and with `tickets:update` they change nothing but status, assignees and due date. The people list is never returned to a key, and a customer's key sees only its own company in the lookup.
- Demo reset removes the keys of the accounts it deletes.

## OpenAPI and MCP

`GET /api/openapi.json` describes the whole API for Postman, ChatGPT Actions and Swagger UI, and `mcp/server.mjs` is an MCP server that gives an
AI assistant every call as a tool. See [mcp.md](mcp.md).

## Tutorial, builder and AI skill

- **API builder** (Settings → API keys → API builder; Profile → API builder for everyone else): pick a call, fill in the
  filters (with lists of people, companies, types, statuses and skills to choose from), see the URL, curl command and body,
  and try it with your own login.
- **Tutorial** (Settings → API keys → Tutorial; Profile → *How to use it*): the step by step guide and a ready `SKILL.md`.
- **Skill file:** `GET /api/skill` (add `?download=1` for a file). It holds this portal's address and never a key: the AI
  reads the key from the environment variable `TICKETING_API_KEY`. The text is generated by `lib/api-skill.ts` from the
  endpoint list in `lib/api-catalog.ts`, the same list the builder uses, so they cannot drift apart (a test checks that every
  endpoint is in the key allowlist and in the skill file).
