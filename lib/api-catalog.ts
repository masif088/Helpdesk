/**
 * The API as data: every endpoint an API key may call, with its parameters. One list feeds the API builder page, the skill file
 * an AI assistant reads (`lib/api-skill.ts`) and the tests that keep it honest (each endpoint must match the key allowlist in
 * `lib/api-key-core.ts`). Pure: no database imports.
 */
import type { ApiKeyScope } from '@/lib/api-key-core'

export type ApiParamType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'list' | 'enum' | 'html'

export type ApiParam = {
  name: string
  where: 'path' | 'query' | 'body'
  type: ApiParamType
  description: string
  example?: string
  /** For `enum`, and for `list` when only some values are valid */
  options?: string[]
  required?: boolean
  /** Only staff can use it (a client's key ignores or refuses it) */
  staffOnly?: boolean
}

export type ApiEndpoint = {
  id: string
  group: 'Tickets' | 'Calendar' | 'Team'
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** With `{id}` placeholders */
  path: string
  scope: ApiKeyScope
  summary: string
  params: ApiParam[]
}

const CALENDAR_TYPES = ['meeting', 'leave', 'holiday', 'event', 'training', 'maintenance', 'reminder', 'other']

const id = (what: string, example: string): ApiParam => ({ name: 'id', where: 'path', type: 'text', required: true, description: what, example })

const eventBody = (create: boolean): ApiParam[] => [
  { name: 'type', where: 'body', type: 'enum', options: CALENDAR_TYPES, required: create, description: 'What kind of event. Holidays need a manager; leave is for yourself unless you are a manager.', example: 'meeting' },
  { name: 'title', where: 'body', type: 'text', required: create, description: 'Short title (max 200 characters)', example: 'Weekly sync with Acme' },
  { name: 'start', where: 'body', type: 'text', required: create, description: 'A date `YYYY-MM-DD` (all-day) or an ISO date and time in UTC, e.g. `2026-11-03T09:00:00Z`', example: '2026-11-03T09:00:00Z' },
  { name: 'end', where: 'body', type: 'text', description: 'Same format. For all-day events this is the LAST day (inclusive). Defaults to one hour, or the start day.', example: '2026-11-03T10:00:00Z' },
  { name: 'all_day', where: 'body', type: 'boolean', description: 'Default: true for holiday and leave or when `start` is a plain date', example: 'false' },
  { name: 'description', where: 'body', type: 'text', description: 'Plain text notes (max 5000 characters)' },
  { name: 'location', where: 'body', type: 'text', description: 'Place or room', example: 'Meeting room 2' },
  { name: 'meeting_url', where: 'body', type: 'text', description: 'Video call link, must start with http(s)://', example: 'https://meet.google.com/abc-defg-hij' },
  { name: 'attendee_ids', where: 'body', type: 'list', description: 'User ids of the people invited (max 50)' },
  { name: 'owner_id', where: 'body', type: 'text', description: 'Whom it is about (leave). Defaults to you for leave and reminders.' },
  { name: 'company_id', where: 'body', type: 'text', description: 'The client company it concerns (needed when visibility is `company`)' },
  { name: 'ticket_id', where: 'body', type: 'number', description: 'A ticket it relates to', example: '123' },
  { name: 'visibility', where: 'body', type: 'enum', options: ['private', 'staff', 'company', 'everyone'], description: 'Who sees it. Default depends on the type (reminder: private, holiday: everyone, others: staff). `everyone` needs a manager.', example: 'staff' },
  { name: 'repeat', where: 'body', type: 'enum', options: ['none', 'daily', 'weekly', 'monthly', 'yearly'], description: 'Repeat it (default none)', example: 'weekly' },
  { name: 'repeat_until', where: 'body', type: 'date', description: 'Last day a repeating event may start on; empty = for ever', example: '2026-12-31' },
  { name: 'color', where: 'body', type: 'text', description: 'Hex color such as #3B82F6; default depends on the type' },
]

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'tickets.list',
    group: 'Tickets',
    method: 'GET',
    path: '/api/tickets',
    scope: 'tickets:read',
    summary: 'List and search tickets. Every filter is optional; filters combine with AND, and inside a list any value may match (OR).',
    params: [
      { name: 'search', where: 'query', type: 'text', description: 'Words to find in title and description (a ticket number also works)', example: 'printer' },
      { name: 'status', where: 'query', type: 'list', description: 'Status slugs (see lookup), e.g. open,question', example: 'open' },
      { name: 'type_ids', where: 'query', type: 'list', description: 'Ticket type ids (see lookup)', example: '3' },
      { name: 'company_ids', where: 'query', type: 'list', description: 'Client company ids', example: '' },
      { name: 'team_ids', where: 'query', type: 'list', description: 'Team ids', staffOnly: true },
      { name: 'tag_ids', where: 'query', type: 'list', description: 'Tag ids' },
      { name: 'assignee_ids', where: 'query', type: 'list', description: 'Assigned to any of these users; the word `me` means the user behind the key', example: 'me', staffOnly: true },
      { name: 'unassigned', where: 'query', type: 'boolean', description: '1 = nobody is assigned (cannot be combined with assignee_ids)', example: '1', staffOnly: true },
      { name: 'creator_ids', where: 'query', type: 'list', description: 'Opened by any of these users', staffOnly: true },
      { name: 'customer_ids', where: 'query', type: 'list', description: 'Opened by, or with as contact, any of these client users', staffOnly: true },
      { name: 'skills', where: 'query', type: 'list', description: 'Tickets that need these skills (the ticket\'s own, else its client\'s for the type, else the defaults of type and tags)', example: 'WordPress', staffOnly: true },
      { name: 'skills_match', where: 'query', type: 'enum', options: ['any', 'all'], description: 'any (default): one of the skills is enough; all: every skill', staffOnly: true },
      { name: 'date_from', where: 'query', type: 'date', description: 'Created on or after this day', example: '2026-11-01' },
      { name: 'date_to', where: 'query', type: 'date', description: 'Created on or before this day', example: '2026-11-30' },
      { name: 'due_date_from', where: 'query', type: 'date', description: 'Due on or after this day (tickets without a due date are left out)' },
      { name: 'due_date_to', where: 'query', type: 'date', description: 'Due on or before this day' },
      { name: 'updated_from', where: 'query', type: 'date', description: 'Last changed on or after this day', staffOnly: true },
      { name: 'updated_to', where: 'query', type: 'date', description: 'Last changed on or before this day', staffOnly: true },
      { name: 'overdue', where: 'query', type: 'boolean', description: '1 = not finished and past its due date', example: '1', staffOnly: true },
      { name: 'open', where: 'query', type: 'boolean', description: '1 = not finished, 0 = finished', staffOnly: true },
      { name: 'has_due_date', where: 'query', type: 'boolean', description: '1 = has a due date, 0 = has none', staffOnly: true },
      { name: 'scope', where: 'query', type: 'enum', options: ['inbox', 'mine'], description: 'inbox = unassigned and open; mine = assigned to the key\'s user or their teams', staffOnly: true },
      { name: 'compact', where: 'query', type: 'boolean', description: '1 = short rows (id, title, status, type, company, requester, assignees, tags, dates, url). Use this for lists.', example: '1' },
      { name: 'limit', where: 'query', type: 'number', description: 'Rows per page, 1 to 500 (default 50)', example: '20' },
      { name: 'offset', where: 'query', type: 'number', description: 'Rows to skip (paging)', example: '0' },
      { name: 'paginated', where: 'query', type: 'boolean', description: '1 = answer {data, total} so you know how many match in all', example: '1' },
      { name: 'sort_order', where: 'query', type: 'enum', options: ['desc', 'asc'], description: 'Order by queue position; desc (default) or asc' },
      { name: 'sort_by', where: 'query', type: 'enum', options: ['id'], description: 'id = newest or oldest ticket number first (with sort_order)' },
    ],
  },
  {
    id: 'tickets.lookup',
    group: 'Tickets',
    method: 'GET',
    path: '/api/tickets/lookup',
    scope: 'tickets:read',
    summary: 'The ids to use in filters and when creating: ticket types, teams, statuses and more.',
    params: [],
  },
  {
    id: 'tickets.detail',
    group: 'Tickets',
    method: 'GET',
    path: '/api/tickets/{id}/detail',
    scope: 'tickets:read',
    summary: 'One ticket with its comments.',
    params: [id('Ticket number', '123')],
  },
  {
    id: 'tickets.create',
    group: 'Tickets',
    method: 'POST',
    path: '/api/tickets',
    scope: 'tickets:create',
    summary: 'Open a ticket. A client must give `type_id`.',
    params: [
      { name: 'title', where: 'body', type: 'text', required: true, description: 'Short title', example: 'Printer on floor 2 is offline' },
      { name: 'description', where: 'body', type: 'html', description: 'HTML: wrap paragraphs in <p>…</p>', example: '<p>Since this morning. Error E-102.</p>' },
      { name: 'type_id', where: 'body', type: 'number', description: 'Ticket type id from the lookup (required for clients)', example: '3' },
      { name: 'priority', where: 'body', type: 'number', description: 'Queue position, 0 = default', example: '0' },
      { name: 'company_id', where: 'body', type: 'text', description: 'Client company (staff only; a client\'s company is automatic)', staffOnly: true },
      { name: 'due_date', where: 'body', type: 'datetime', description: 'ISO date, e.g. 2026-11-20', example: '2026-11-20' },
    ],
  },
  {
    id: 'tickets.update',
    group: 'Tickets',
    method: 'PATCH',
    path: '/api/tickets/{id}',
    scope: 'tickets:update',
    summary: 'Change a ticket: its status, who is assigned, or its due date, and nothing else. Team keys only; a client key is refused. Ask the user first.',
    params: [
      id('Ticket number', '123'),
      { name: 'status', where: 'body', type: 'text', description: 'Status slug from the lookup (statuses[].slug). Closing sends the client the closing email.', example: 'resolved', staffOnly: true },
      { name: 'add_assignees', where: 'body', type: 'list', description: 'User ids of team members to add as assignees', staffOnly: true },
      { name: 'remove_assignees', where: 'body', type: 'list', description: 'User ids to take off', staffOnly: true },
      { name: 'assignees', where: 'body', type: 'list', description: 'The whole list of assignees (replaces the current one; empty clears it). Do not combine with add/remove', staffOnly: true },
      { name: 'due_date', where: 'body', type: 'datetime', description: 'New due date (YYYY-MM-DD); leave out to keep it', example: '2026-11-20', staffOnly: true },
    ],
  },
  {
    id: 'comments.create',
    group: 'Tickets',
    method: 'POST',
    path: '/api/tickets/{id}/comments',
    scope: 'comments:create',
    summary: 'Add a comment. Staff keys write an internal note unless `visibility` is `reply`.',
    params: [
      id('Ticket number', '123'),
      { name: 'comment', where: 'body', type: 'html', required: true, description: 'HTML: wrap paragraphs in <p>…</p>', example: '<p>Still happening after a restart.</p>' },
      { name: 'visibility', where: 'body', type: 'enum', options: ['note', 'reply'], description: 'Staff only. note = internal (default), reply = the client sees it', staffOnly: true },
    ],
  },
  {
    id: 'calendar.list',
    group: 'Calendar',
    method: 'GET',
    path: '/api/calendar/events',
    scope: 'calendar:read',
    summary: 'Everything on the calendar in a range: meetings, leave, holidays, events, plus ticket and invoice due dates. Repeating events are unfolded into their occurrences.',
    params: [
      { name: 'from', where: 'query', type: 'date', description: 'First day, or an ISO moment. Default: the first of this month', example: '2026-11-01' },
      { name: 'to', where: 'query', type: 'date', description: 'Last day (inclusive). Default: the end of that month. At most 400 days apart', example: '2026-11-30' },
      { name: 'types', where: 'query', type: 'list', options: [...CALENDAR_TYPES, 'ticket_due', 'invoice_due'], description: 'Only these kinds', example: 'meeting,leave' },
      { name: 'user_ids', where: 'query', type: 'list', description: 'Events owned, made or attended by these users; tickets assigned to them. `me` = the key\'s user', example: 'me' },
      { name: 'company_ids', where: 'query', type: 'list', description: 'Only things about these client companies' },
      { name: 'include_derived', where: 'query', type: 'boolean', description: '0 = leave out ticket and invoice due dates (default 1)', example: '1' },
    ],
  },
  {
    id: 'calendar.lookup',
    group: 'Calendar',
    method: 'GET',
    path: '/api/calendar/lookup',
    scope: 'calendar:read',
    summary: 'The event types, repeat choices and visibilities, and which of them the key\'s user may create.',
    params: [],
  },
  {
    id: 'calendar.get',
    group: 'Calendar',
    method: 'GET',
    path: '/api/calendar/events/{id}',
    scope: 'calendar:read',
    summary: 'One stored event (a repeating event comes back as its first occurrence).',
    params: [id('Event id (from the list)', '3f2b8a9c-1d4e-4f6a-9b0c-123456789abc')],
  },
  {
    id: 'calendar.create',
    group: 'Calendar',
    method: 'POST',
    path: '/api/calendar/events',
    scope: 'calendar:write',
    summary: 'Add an event. Only the team can; clients\' keys are refused.',
    params: eventBody(true),
  },
  {
    id: 'calendar.update',
    group: 'Calendar',
    method: 'PATCH',
    path: '/api/calendar/events/{id}',
    scope: 'calendar:write',
    summary: 'Change an event: send only the fields to change.',
    params: [id('Event id', '3f2b8a9c-1d4e-4f6a-9b0c-123456789abc'), ...eventBody(false)],
  },
  {
    id: 'calendar.delete',
    group: 'Calendar',
    method: 'DELETE',
    path: '/api/calendar/events/{id}',
    scope: 'calendar:write',
    summary: 'Delete an event (all occurrences of a repeating one).',
    params: [id('Event id', '3f2b8a9c-1d4e-4f6a-9b0c-123456789abc')],
  },
  {
    id: 'team.activity',
    group: 'Team',
    method: 'GET',
    path: '/api/users/activity',
    scope: 'team:read',
    summary: 'Who worked in a period, and how loaded the team is. Per team member: time tracked (clipped to the period), tickets worked on, a running timer, open tickets assigned, and leave and meetings from the calendar. Admins and managers only.',
    params: [
      { name: 'from', where: 'query', type: 'text', description: 'Start of the period: a date `YYYY-MM-DD` (whole days) or an ISO moment in UTC to look at hours, e.g. `2026-11-03T09:00:00Z`. Default: today', example: '2026-11-03T09:00:00Z' },
      { name: 'to', where: 'query', type: 'text', description: 'End of the period, same format (a date means the end of that day). At most 62 days apart', example: '2026-11-03T17:00:00Z' },
      { name: 'user_ids', where: 'query', type: 'list', description: "Only these team members; `me` = the key's user", example: 'me' },
      { name: 'agent_skills', where: 'query', type: 'list', description: 'Only team members who have one of these skills themselves', example: 'WordPress' },
      { name: 'team_ids', where: 'query', type: 'list', description: 'Only members of these teams' },
      { name: 'company_ids', where: 'query', type: 'list', description: 'Only work on tickets of these client companies' },
      { name: 'customer_ids', where: 'query', type: 'list', description: 'Only work on tickets opened by, or with as contact, these client users' },
      { name: 'skills', where: 'query', type: 'list', description: "Only work on tickets that need these skills (the ticket's own, else its client's for the type, else the defaults of type and tags)", example: 'WordPress' },
      { name: 'skills_match', where: 'query', type: 'enum', options: ['any', 'all'], description: 'any (default): one skill is enough; all: every skill' },
      { name: 'type_ids', where: 'query', type: 'list', description: 'Only work on tickets of these types (see the ticket lookup)', example: '3' },
      { name: 'only_working', where: 'query', type: 'boolean', description: '1 = leave out people who did not work in the period', example: '1' },
      { name: 'breakdown', where: 'query', type: 'enum', options: ['none', 'day', 'hour'], description: 'Add the time per day or per hour (hour: at most 3 days)', example: 'hour' },
      { name: 'include_tickets', where: 'query', type: 'boolean', description: '1 = list the tickets each person worked on, with the time on each (max 25)', example: '1' },
    ],
  },
]

export const endpointById = (endpointId: string): ApiEndpoint | undefined => API_ENDPOINTS.find((e) => e.id === endpointId)

const typedValue = (p: ApiParam, raw: string): unknown => {
  if (p.type === 'number') return Number(raw)
  if (p.type === 'boolean') return raw === '1' || raw === 'true'
  if (p.type === 'list' && p.where === 'body') return raw.split(',').map((s) => s.trim()).filter(Boolean)
  return raw
}

/** The request for an endpoint and the values typed in: path with ids filled in, query string, JSON body. Empty values are left out. */
export function buildRequest(endpoint: ApiEndpoint, values: Record<string, string>): { method: string; path: string; query: string; body: Record<string, unknown> | null; missing: string[] } {
  const missing: string[] = []
  let path = endpoint.path
  const query = new URLSearchParams()
  const body: Record<string, unknown> = {}
  for (const p of endpoint.params) {
    const raw = (values[p.name] ?? '').trim()
    if (!raw) {
      if (p.required) missing.push(p.name)
      continue
    }
    if (p.where === 'path') path = path.replace(`{${p.name}}`, encodeURIComponent(raw))
    else if (p.where === 'query') query.set(p.name, raw)
    else body[p.name] = typedValue(p, raw)
  }
  const hasBody = endpoint.method === 'POST' || endpoint.method === 'PATCH'
  return { method: endpoint.method, path, query: query.toString(), body: hasBody ? body : null, missing }
}

/** `https://app/api/tickets?status=open` for a built request */
export function requestUrl(baseUrl: string, r: { path: string; query: string }): string {
  return `${baseUrl.replace(/\/+$/, '')}${r.path}${r.query ? `?${r.query}` : ''}`
}

/** A curl command that reads the key from the environment variable, never with the key itself in it. */
export function curlCommand(baseUrl: string, r: { method: string; path: string; query: string; body: Record<string, unknown> | null }): string {
  const parts = [`curl${r.method === 'GET' ? '' : ` -X ${r.method}`} '${requestUrl(baseUrl, r)}'`, `  -H "Authorization: Bearer $TICKETING_API_KEY"`]
  if (r.body) {
    parts.push(`  -H "Content-Type: application/json"`)
    parts.push(`  -d '${JSON.stringify(r.body).replace(/'/g, `'\\''`)}'`)
  }
  return parts.join(' \\\n')
}

/** A parameter table in Markdown, for the skill file and the docs. */
export function paramTable(params: ApiParam[], where?: ApiParam['where']): string {
  const rows = params.filter((p) => !where || p.where === where)
  if (!rows.length) return '_No parameters._'
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [
    '| Name | Type | Description |',
    '| --- | --- | --- |',
    ...rows.map((p) => {
      const type = p.options ? p.options.join(' \\| ') : p.type
      return `| \`${p.name}\`${p.required ? ' **required**' : ''} | ${cell(type)} | ${cell(p.description)}${p.staffOnly ? ' _(staff keys)_' : ''}${p.example ? ` e.g. \`${cell(p.example)}\`` : ''} |`
    }),
  ].join('\n')
}
