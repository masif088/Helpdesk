// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { API_ENDPOINTS } from '../lib/api-catalog.ts'
import { callDetailFromHeaders, callDocId, callIdRange, cleanQuery, cleanTool, describeCall } from '../lib/api-key-calls-core.ts'
import { API_KEY_SCOPE_SHORT, API_KEY_SCOPES, API_KEY_WRITE_SCOPES } from '../lib/api-key-core.ts'

describe('describeCall', () => {
  it('has words for every endpoint of the catalog', () => {
    for (const e of API_ENDPOINTS) {
      const path = e.path.replace('{id}', '42')
      const text = describeCall(e.method, path)
      assert.notEqual(text, `${e.method} ${path}`, `${e.method} ${e.path} has no label`)
    }
  })
  it('says what a call was', () => {
    assert.equal(describeCall('GET', '/api/tickets'), 'Searched tickets')
    assert.equal(describeCall('GET', '/api/tickets/lookup'), 'Looked up types, teams and statuses')
    assert.equal(describeCall('GET', '/api/tickets/12/detail'), 'Opened a ticket #12')
    assert.equal(describeCall('PATCH', '/api/tickets/12'), 'Changed a ticket #12')
    assert.equal(describeCall('POST', '/api/tickets/12/comments'), 'Commented on a ticket #12')
    assert.equal(describeCall('POST', '/api/tickets'), 'Created a ticket')
    assert.equal(describeCall('GET', '/api/calendar/events'), 'Read the calendar')
    assert.equal(describeCall('DELETE', '/api/calendar/events/abc-1'), 'Deleted a calendar event')
    assert.equal(describeCall('GET', '/api/users/activity'), 'Read team activity')
  })
  it('falls back to the raw call for what it does not know', () => {
    assert.equal(describeCall('get', '/api/other'), 'GET /api/other')
  })
})

describe('what the proxy hands over', () => {
  const headers = (h) => (name) => h[name] ?? null
  it('reads the call, the query and the MCP tool', () => {
    assert.deepEqual(callDetailFromHeaders(headers({ 'x-api-call': 'GET /api/tickets', 'x-api-query': '?status=open&limit=2', 'x-mcp-tool': 'tickets_list' })), {
      method: 'GET',
      path: '/api/tickets',
      query: 'status=open&limit=2',
      tool: 'tickets_list',
    })
  })
  it('a plain call has no tool, and rubbish gives nothing', () => {
    assert.equal(callDetailFromHeaders(headers({ 'x-api-call': 'GET /api/tickets' })).tool, null)
    assert.equal(callDetailFromHeaders(headers({ 'x-mcp-tool': '<script>' })).tool, null)
    assert.equal(callDetailFromHeaders(headers({})).method, '')
    assert.equal(callDetailFromHeaders(headers({ 'x-api-call': 'nonsense' })).path, '')
  })
  it('cleans the tool and the query', () => {
    assert.equal(cleanTool('calendar_list'), 'calendar_list')
    assert.equal(cleanTool('Calendar List'), null)
    assert.equal(cleanTool('a'.repeat(41)), null)
    assert.equal(cleanQuery('?q=hello%20world+x'), 'q=hello world x')
    assert.equal(cleanQuery('?bad=%E0%A4%A'), 'bad=%E0%A4%A')
    assert.equal(cleanQuery('x'.repeat(500)).length, 300)
    assert.equal(cleanQuery(null), '')
  })
})

describe('record ids', () => {
  it('sort newest first within a key and stay inside that key range', () => {
    const a = callDocId('key1', new Date('2026-11-08T10:00:00Z'), 'aaaaaa')
    const b = callDocId('key1', new Date('2026-11-08T10:00:01Z'), 'bbbbbb')
    const { from, to } = callIdRange('key1')
    assert.ok(b < a) // later call, smaller id: read first
    assert.ok(a >= from && b < to)
    assert.ok(!(callDocId('key10', new Date(), 'x') >= from && callDocId('key10', new Date(), 'x') < to))
  })
})

describe('permissions in words', () => {
  it('every permission has a short name, and the changing ones are marked', () => {
    for (const s of API_KEY_SCOPES) assert.ok(API_KEY_SCOPE_SHORT[s], s)
    assert.deepEqual([...API_KEY_WRITE_SCOPES].sort(), ['calendar:write', 'comments:create', 'tickets:create', 'tickets:update'])
  })
})
