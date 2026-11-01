// Pure logic and a real process: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'

import { API_ENDPOINTS } from '../lib/api-catalog.ts'
import { argumentValues, createMcpHandler, listTools, toolName } from '../lib/mcp-server.ts'

const call = (handle, name, args, id = 1) => handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })

function recorder(status = 200, body = '{"ok":true}') {
  const seen = []
  return { seen, fetchImpl: async (url, init) => (seen.push({ url, ...init }), { status, text: async () => body }) }
}

describe('the tool list', () => {
  const tools = listTools()

  it('has one tool per endpoint, with a unique name', () => {
    assert.equal(tools.length, API_ENDPOINTS.length)
    assert.equal(new Set(tools.map((t) => t.name)).size, tools.length)
    assert.ok(tools.every((t) => /^[a-z0-9_]+$/.test(t.name)))
    assert.ok(tools.some((t) => t.name === 'tickets_list') && tools.some((t) => t.name === 'calendar_create') && tools.some((t) => t.name === 'team_activity'))
  })

  it('describes the inputs, and what is required', () => {
    const create = tools.find((t) => t.name === 'calendar_create')
    assert.deepEqual(create.inputSchema.required, ['type', 'title', 'start'])
    assert.equal(create.inputSchema.properties.attendee_ids.type, 'array')
    assert.equal(create.inputSchema.properties.type.enum[0], 'meeting')
    assert.deepEqual(tools.find((t) => t.name === 'tickets_detail').inputSchema.required, ['id'])
  })

  it('marks reads as read only and deletes as destructive', () => {
    assert.equal(tools.find((t) => t.name === 'tickets_list').annotations.readOnlyHint, true)
    assert.equal(tools.find((t) => t.name === 'calendar_delete').annotations.destructiveHint, true)
    assert.equal(tools.find((t) => t.name === 'calendar_create').annotations.readOnlyHint, false)
  })

  it('turns what an assistant sends into request values', () => {
    const e = API_ENDPOINTS.find((x) => x.id === 'tickets.list')
    assert.deepEqual(argumentValues(e, { status: ['open', 'question'], compact: true, overdue: false, limit: 20, search: '' }), { status: 'open,question', compact: '1', overdue: '0', limit: '20' })
  })
})

describe('the protocol', () => {
  it('answers initialize, ping and tools/list, and stays quiet on notifications', async () => {
    const handle = createMcpHandler({ baseUrl: 'https://p.test', apiKey: 'tk_live_x', ...recorder() })
    const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
    assert.equal(init.result.protocolVersion, '2025-03-26')
    assert.ok(init.result.capabilities.tools)
    assert.ok(init.result.instructions.includes('Ask the user'))
    assert.deepEqual((await handle({ jsonrpc: '2.0', id: 2, method: 'ping' })).result, {})
    assert.equal((await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).result.tools.length, API_ENDPOINTS.length)
    assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
    assert.equal((await handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' })).error.code, -32601)
  })

  it('refuses an unknown tool', async () => {
    const handle = createMcpHandler({ baseUrl: 'https://p.test', apiKey: 'k', ...recorder() })
    assert.equal((await call(handle, 'nope', {})).error.code, -32602)
  })
})

describe('calling a tool', () => {
  it('sends the right request with the key, and returns the answer', async () => {
    const r = recorder(200, '{"count":0,"events":[]}')
    const handle = createMcpHandler({ baseUrl: 'https://p.test/', apiKey: 'tk_live_secret', fetchImpl: r.fetchImpl })
    const out = await call(handle, 'calendar_list', { from: '2026-11-01', to: '2026-11-30', types: ['meeting', 'leave'], user_ids: ['me'] })
    assert.equal(r.seen[0].url, 'https://p.test/api/calendar/events?from=2026-11-01&to=2026-11-30&types=meeting%2Cleave&user_ids=me')
    assert.equal(r.seen[0].method, 'GET')
    assert.equal(r.seen[0].headers.Authorization, 'Bearer tk_live_secret')
    assert.equal(out.result.isError, false)
    assert.ok(out.result.content[0].text.includes('"events"'))
  })

  it('sends a JSON body for a create, with real types', async () => {
    const r = recorder(201, '{"event":{"id":"e1"}}')
    const handle = createMcpHandler({ baseUrl: 'https://p.test', apiKey: 'k', fetchImpl: r.fetchImpl })
    await call(handle, 'calendar_create', { type: 'meeting', title: 'Sync', start: '2026-11-03T09:00:00Z', all_day: false, ticket_id: 7, attendee_ids: ['u1', 'u2'] })
    assert.equal(r.seen[0].method, 'POST')
    assert.equal(r.seen[0].headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(r.seen[0].body), { type: 'meeting', title: 'Sync', start: '2026-11-03T09:00:00Z', all_day: false, ticket_id: 7, attendee_ids: ['u1', 'u2'] })
  })

  it('reports what is missing without calling the portal', async () => {
    const r = recorder()
    const handle = createMcpHandler({ baseUrl: 'https://p.test', apiKey: 'k', fetchImpl: r.fetchImpl })
    const out = await call(handle, 'calendar_create', { title: 'x' })
    assert.equal(out.result.isError, true)
    assert.ok(out.result.content[0].text.includes('type'))
    assert.equal(r.seen.length, 0)
  })

  it('passes an error answer on, marked as an error', async () => {
    const handle = createMcpHandler({ baseUrl: 'https://p.test', apiKey: 'k', ...recorder(403, '{"error":"Only admins and managers can see the team activity"}') })
    const out = await call(handle, 'team_activity', {})
    assert.equal(out.result.isError, true)
    assert.ok(out.result.content[0].text.startsWith('HTTP 403'))
  })

  it('survives a portal that cannot be reached', async () => {
    const handle = createMcpHandler({ baseUrl: 'https://p.test', apiKey: 'k', fetchImpl: async () => { throw new Error('connection refused') } })
    const out = await call(handle, 'tickets_list', {})
    assert.equal(out.result.isError, true)
    assert.ok(out.result.content[0].text.includes('connection refused'))
  })

  it('never puts the key in a tool name or description', () => {
    assert.ok(!JSON.stringify(listTools()).includes('tk_live_'))
    assert.equal(toolName(API_ENDPOINTS[0]), API_ENDPOINTS[0].id.replace('.', '_'))
  })
})

describe('the program over stdio', () => {
  it('talks to a portal with the key and speaks MCP on stdin and stdout', async () => {
    const hits = []
    const portal = createServer((req, res) => {
      hits.push({ url: req.url, auth: req.headers.authorization })
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, path: req.url }))
    })
    await new Promise((r) => portal.listen(0, '127.0.0.1', r))
    const port = portal.address().port
    const child = spawn(process.execPath, ['mcp/server.mjs'], { env: { ...process.env, TICKETING_BASE_URL: `http://127.0.0.1:${port}`, TICKETING_API_KEY: 'tk_live_e2e' }, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = []
    let buf = ''
    child.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)))
        buf = buf.slice(i + 1)
      }
    })
    const waitFor = async (id) => {
      for (let n = 0; n < 100; n++) {
        const m = lines.find((l) => l.id === id)
        if (m) return m
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`no answer for ${id}`)
    }
    try {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`)
      assert.ok((await waitFor(1)).result.serverInfo)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'tickets_list', arguments: { compact: true, assignee_ids: ['me'] } } })}\n`)
      const answer = await waitFor(2)
      assert.equal(answer.result.isError, false)
      assert.deepEqual(hits, [{ url: '/api/tickets?assignee_ids=me&compact=1', auth: 'Bearer tk_live_e2e' }])
    } finally {
      child.kill()
      await new Promise((r) => portal.close(r))
    }
  })

  it('refuses to start without a key', async () => {
    const child = spawn(process.execPath, ['mcp/server.mjs'], { env: { ...process.env, TICKETING_BASE_URL: '', TICKETING_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => (err += d))
    const code = await new Promise((r) => child.on('exit', r))
    assert.equal(code, 1)
    assert.ok(err.includes('TICKETING_API_KEY'))
  })
})
