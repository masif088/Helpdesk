/**
 * The call log of API keys and connections: what each call was, in words a person can read. One small record per call is kept for
 * 30 days (`api_key_calls`); the storage is in `lib/api-key-calls.ts`. Pure helpers (no database), so they can be tested.
 */
import { API_ENDPOINTS } from './api-catalog.ts'

export const CALL_LOG_DAYS = 30
export const CALL_LOG_LIMIT = 100

export type CallEntry = {
  id: string
  /** ISO moment of the call */
  at: string
  method: string
  path: string
  /** The query string as sent, decoded, without the leading "?" */
  query: string
  scope: string
  /** The MCP tool the assistant used (`tickets_list`), or null for a plain HTTP call */
  tool: string | null
  /** The call was refused for the hourly limit */
  limited: boolean
}

/**
 * Record ids start with the key id, then the moment counted backwards, so one key's calls are a range of ids and the newest sorts first
 * (Firestore reads a range of ids in ascending order without any index; descending would need one).
 */
export const callDocId = (keyId: string, at: Date, rand: string): string => `${keyId}~${String(10_000_000_000_000 - at.getTime()).padStart(14, '0')}~${rand}`
export const callIdRange = (keyId: string): { from: string; to: string } => ({ from: `${keyId}~`, to: `${keyId}~` })

const LABELS: Record<string, string> = {
  'tickets.list': 'Searched tickets',
  'tickets.lookup': 'Looked up types, teams and statuses',
  'tickets.detail': 'Opened a ticket',
  'tickets.create': 'Created a ticket',
  'tickets.update': 'Changed a ticket',
  'comments.create': 'Commented on a ticket',
  'calendar.list': 'Read the calendar',
  'calendar.lookup': 'Looked up calendar options',
  'calendar.get': 'Opened a calendar event',
  'calendar.create': 'Added a calendar event',
  'calendar.update': 'Changed a calendar event',
  'calendar.respond': 'Answered an invitation',
  'calendar.delete': 'Deleted a calendar event',
  'team.activity': 'Read team activity',
}

const matchers = API_ENDPOINTS.map((e) => ({ id: e.id, method: e.method, re: new RegExp(`^${e.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{id\}/g, '[^/]+')}$`) }))

/** A call in words: "Opened a ticket #12", "Read the calendar". Falls back to the method and path for anything the catalog does not know. */
export function describeCall(method: string, path: string): string {
  const m = method.toUpperCase()
  const hit = matchers.find((x) => x.method === m && x.re.test(path))
  if (!hit) return `${m} ${path}`
  const label = LABELS[hit.id] ?? hit.id
  const ticket = /^\/api\/tickets\/(\d+)(\/|$)/.exec(path)
  return ticket ? `${label} #${ticket[1]}` : label
}

/** The MCP tool name sent by the connector: lowercase words with underscores, or null. */
export function cleanTool(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : null
}

/** The query string for the log: decoded, without "?", cut to 300 characters. */
export function cleanQuery(search: string | null | undefined): string {
  const raw = (search ?? '').replace(/^\?/, '')
  let text = raw
  try {
    text = decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    /* keep it as sent */
  }
  return text.slice(0, 300)
}

/** What the proxy handed over: `x-api-call` ("GET /api/tickets"), `x-api-query` and the connector's `x-mcp-tool`. */
export function callDetailFromHeaders(get: (name: string) => string | null): { method: string; path: string; query: string; tool: string | null } {
  const m = /^([A-Z]+) (\/\S*)$/.exec(get('x-api-call') ?? '')
  return { method: m?.[1] ?? '', path: m?.[2] ?? '', query: cleanQuery(get('x-api-query')), tool: cleanTool(get('x-mcp-tool')) }
}
