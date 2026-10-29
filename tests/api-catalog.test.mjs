// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { API_ENDPOINTS, buildRequest, curlCommand, endpointById, paramTable, requestUrl } from '../lib/api-catalog.ts'
import { scopeForRequest } from '../lib/api-key-core.ts'

const concrete = (path) => path.replace('{id}', '42')

describe('the catalog agrees with the key allowlist', () => {
  for (const e of API_ENDPOINTS) {
    it(`${e.method} ${e.path} needs ${e.scope}`, () => {
      assert.equal(scopeForRequest(e.method, concrete(e.path)), e.scope)
    })
  }

  it('has unique ids and a path parameter for every {placeholder}', () => {
    assert.equal(new Set(API_ENDPOINTS.map((e) => e.id)).size, API_ENDPOINTS.length)
    for (const e of API_ENDPOINTS) {
      for (const [, name] of e.path.matchAll(/\{(\w+)\}/g)) assert.ok(e.params.some((p) => p.where === 'path' && p.name === name), `${e.id} lacks {${name}}`)
    }
  })
})

describe('building a request', () => {
  const list = endpointById('tickets.list')

  it('puts filled-in values in the query string and leaves the rest out', () => {
    const r = buildRequest(list, { status: 'open', assignee_ids: 'me', skills: '', compact: '1' })
    assert.equal(r.query, 'status=open&assignee_ids=me&compact=1')
    assert.equal(r.body, null)
    assert.deepEqual(r.missing, [])
  })

  it('fills a path parameter and encodes it', () => {
    const r = buildRequest(endpointById('tickets.detail'), { id: '12' })
    assert.equal(r.path, '/api/tickets/12/detail')
    assert.equal(buildRequest(endpointById('calendar.get'), { id: 'a b' }).path, '/api/calendar/events/a%20b')
  })

  it('builds a typed JSON body and reports what is missing', () => {
    const r = buildRequest(endpointById('calendar.create'), { type: 'meeting', title: 'Sync', start: '2026-11-03T09:00:00Z', all_day: 'false', ticket_id: '7', attendee_ids: 'u1, u2' })
    assert.deepEqual(r.body, { type: 'meeting', title: 'Sync', start: '2026-11-03T09:00:00Z', all_day: false, ticket_id: 7, attendee_ids: ['u1', 'u2'] })
    assert.deepEqual(buildRequest(endpointById('calendar.create'), { title: 'x' }).missing, ['type', 'start'])
  })

  it('makes a curl command without any key in it', () => {
    const c = curlCommand('https://app.test/', buildRequest(list, { status: 'open' }))
    assert.ok(c.startsWith("curl 'https://app.test/api/tickets?status=open'"))
    assert.ok(c.includes('$TICKETING_API_KEY'))
    const post = curlCommand('https://app.test', buildRequest(endpointById('comments.create'), { id: '5', comment: "<p>it's here</p>" }))
    assert.ok(post.includes('-X POST'))
    assert.ok(post.includes("it'\\''s here"))
  })

  it('shows the full url', () => {
    assert.equal(requestUrl('https://app.test/', { path: '/api/tickets', query: 'a=1' }), 'https://app.test/api/tickets?a=1')
  })
})

describe('the parameter table', () => {
  it('lists every filter of the ticket list', () => {
    const t = paramTable(endpointById('tickets.list').params)
    for (const name of ['assignee_ids', 'creator_ids', 'customer_ids', 'skills', 'company_ids', 'type_ids', 'date_from', 'updated_from', 'overdue', 'compact']) assert.ok(t.includes(`\`${name}\``), name)
  })
})
