/**
 * An MCP (Model Context Protocol) server for this portal's API, made from the endpoint list in `lib/api-catalog.ts`: every call
 * the API offers becomes a tool an AI assistant can use directly (`tickets_list`, `calendar_create`, `team_activity`, …).
 * This file is the protocol and the tool list with no I/O of its own (the HTTP call is handed in), so it can be tested; the
 * program that runs it over stdio is `mcp/server.mjs`.
 */
import { API_ENDPOINTS, type ApiEndpoint, type ApiParam, buildRequest, requestUrl } from './api-catalog.ts'

export const MCP_PROTOCOL_VERSION = '2025-06-18'
const MAX_TEXT = 100_000

type Json = Record<string, unknown>
export type McpMessage = { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Json }
export type McpReply = { jsonrpc: '2.0'; id: number | string | null; result?: unknown; error?: { code: number; message: string } }
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>

export const toolName = (e: ApiEndpoint): string => e.id.replace(/\./g, '_')

function propertySchema(p: ApiParam): Json {
  const description = `${p.description}${p.staffOnly ? ' (staff keys only)' : ''}${p.example ? ` Example: ${p.example}` : ''}`
  switch (p.type) {
    case 'number':
      return { type: p.where === 'path' ? 'string' : 'number', description }
    case 'boolean':
      return { type: 'boolean', description }
    case 'enum':
      return { type: 'string', enum: p.options ?? [], description }
    case 'list':
      return { type: 'array', items: { type: 'string' }, description: `${description} (a list)` }
    default:
      return { type: 'string', description }
  }
}

export function listTools(endpoints: ApiEndpoint[] = API_ENDPOINTS) {
  return endpoints.map((e) => ({
    name: toolName(e),
    title: `${e.group}: ${e.method} ${e.path}`,
    description: `${e.summary} (key permission: ${e.scope})`,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(e.params.map((p) => [p.name, propertySchema(p)])),
      required: e.params.filter((p) => p.required || p.where === 'path').map((p) => p.name),
    },
    annotations: { readOnlyHint: e.method === 'GET', destructiveHint: e.method === 'DELETE', idempotentHint: e.method === 'GET' || e.method === 'DELETE' || e.method === 'PATCH', openWorldHint: false },
  }))
}

/** What an assistant sent for a tool, as the plain strings `buildRequest` takes (lists joined by commas, booleans as 1/0). */
export function argumentValues(e: ApiEndpoint, args: Json): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of e.params) {
    const v = args[p.name]
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) out[p.name] = v.join(',')
    else if (typeof v === 'boolean') out[p.name] = p.where === 'query' ? (v ? '1' : '0') : String(v)
    else out[p.name] = String(v)
  }
  return out
}

const INSTRUCTIONS =
  'Tools for the ticketing portal: find and open tickets, comment, read and manage the calendar, and see who is working. The key acts as one portal user and sees only what that user sees. ' +
  'Ask the user before you create, change or delete anything. Prefer filters over reading everything (for ticket lists send compact=true). Do not invent ids; get them from the user or from an earlier answer. ' +
  'Stop and tell the user when a call answers 401, 403 or 429.'

const ok = (id: McpMessage['id'], result: unknown): McpReply => ({ jsonrpc: '2.0', id: id ?? null, result })
const fail = (id: McpMessage['id'], code: number, message: string): McpReply => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** Build the message handler. It answers a request and returns null for a notification (which needs no answer). */
export function createMcpHandler(opts: { baseUrl: string; apiKey: string; fetchImpl: FetchLike; endpoints?: ApiEndpoint[]; name?: string }) {
  const endpoints = opts.endpoints ?? API_ENDPOINTS
  const byTool = new Map(endpoints.map((e) => [toolName(e), e]))

  async function callTool(id: McpMessage['id'], params: Json): Promise<McpReply> {
    const e = byTool.get(String(params.name ?? ''))
    if (!e) return fail(id, -32602, `Unknown tool: ${String(params.name ?? '')}`)
    const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Json
    const req = buildRequest(e, argumentValues(e, args))
    if (req.missing.length) return ok(id, { isError: true, content: [{ type: 'text', text: `Missing: ${req.missing.join(', ')}` }] })
    try {
      const res = await opts.fetchImpl(requestUrl(opts.baseUrl, req), {
        method: req.method,
        headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: 'application/json', ...(req.body ? { 'Content-Type': 'application/json' } : {}) },
        body: req.body ? JSON.stringify(req.body) : undefined,
      })
      const raw = await res.text()
      let text = raw
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        /* not JSON: pass it on as it is */
      }
      if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n… (cut: ${text.length} characters in all; narrow the request with filters)`
      return ok(id, { isError: res.status < 200 || res.status >= 300, content: [{ type: 'text', text: res.status >= 400 ? `HTTP ${res.status}\n${text}` : text }] })
    } catch (err) {
      return ok(id, { isError: true, content: [{ type: 'text', text: `Could not reach the portal: ${(err as Error).message}` }] })
    }
  }

  return async function handle(msg: McpMessage): Promise<McpReply | null> {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg && 'id' in msg ? fail(msg.id, -32600, 'Invalid request') : null
    const isNotification = msg.id === undefined
    switch (msg.method) {
      case 'initialize':
        return ok(msg.id, {
          protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: opts.name ?? 'ticketing-portal', version: '1.0.0' },
          instructions: INSTRUCTIONS,
        })
      case 'ping':
        return ok(msg.id, {})
      case 'tools/list':
        return ok(msg.id, { tools: listTools(endpoints) })
      case 'tools/call':
        return callTool(msg.id, msg.params ?? {})
      default:
        // notifications (initialized, cancelled, …) are accepted silently; an unknown request is an error
        return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`)
    }
  }
}
