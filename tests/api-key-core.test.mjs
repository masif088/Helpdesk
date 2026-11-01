import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apiKeyUsable, apiViaLabel, bearerApiKey, isPublicApiRoute, keyPreview, normalizeScopes, scopeForRequest } from '../lib/api-key-core.ts'

test('scopeForRequest maps the three allowed uses', () => {
  assert.equal(scopeForRequest('GET', '/api/tickets'), 'tickets:read')
  assert.equal(scopeForRequest('GET', '/api/tickets/lookup'), 'tickets:read')
  assert.equal(scopeForRequest('GET', '/api/tickets/42/detail'), 'tickets:read')
  assert.equal(scopeForRequest('POST', '/api/tickets'), 'tickets:create')
  assert.equal(scopeForRequest('POST', '/api/tickets/42/comments'), 'comments:create')
  assert.equal(scopeForRequest('post', '/api/tickets/42/comments/'), 'comments:create')
})

test('scopeForRequest maps the calendar', () => {
  assert.equal(scopeForRequest('GET', '/api/calendar/events'), 'calendar:read')
  assert.equal(scopeForRequest('GET', '/api/calendar/lookup'), 'calendar:read')
  assert.equal(scopeForRequest('GET', '/api/calendar/events/3f2b8a9c-1d4e-4f6a-9b0c-123456789abc'), 'calendar:read')
  assert.equal(scopeForRequest('POST', '/api/calendar/events'), 'calendar:write')
  assert.equal(scopeForRequest('PATCH', '/api/calendar/events/abc-123'), 'calendar:write')
  assert.equal(scopeForRequest('DELETE', '/api/calendar/events/abc-123'), 'calendar:write')
  assert.equal(scopeForRequest('DELETE', '/api/calendar/events'), null)
  assert.equal(scopeForRequest('GET', '/api/calendar/events/a/b'), null)
})

test('scopeForRequest maps the team activity and nothing else under /api/users', () => {
  assert.equal(scopeForRequest('GET', '/api/users/activity'), 'team:read')
  assert.equal(scopeForRequest('POST', '/api/users/activity'), null)
  assert.equal(scopeForRequest('GET', '/api/users/skills'), null)
  assert.equal(scopeForRequest('GET', '/api/users/time-tracker'), null)
})

test('the skill file is public even when a key is sent along', () => {
  assert.equal(isPublicApiRoute('GET', '/api/skill'), true)
  assert.equal(isPublicApiRoute('GET', '/api/skill/'), true)
  assert.equal(isPublicApiRoute('POST', '/api/skill'), false)
  assert.equal(isPublicApiRoute('GET', '/api/users'), false)
})

test('scopeForRequest refuses everything else', () => {
  assert.equal(scopeForRequest('DELETE', '/api/tickets/42'), null)
  assert.equal(scopeForRequest('PATCH', '/api/tickets/42'), null)
  assert.equal(scopeForRequest('GET', '/api/users'), null)
  assert.equal(scopeForRequest('GET', '/api/settings/users'), null)
  assert.equal(scopeForRequest('POST', '/api/api-keys'), null)
  assert.equal(scopeForRequest('GET', '/api/tickets/42/comments'), null)
  assert.equal(scopeForRequest('GET', '/api/tickets/abc/detail'), null)
  assert.equal(scopeForRequest('POST', '/api/tickets/42/detail'), null)
  assert.equal(scopeForRequest('GET', '/api/tickets/purge'), null)
})

test('bearerApiKey only accepts tk_live_ keys', () => {
  assert.equal(bearerApiKey('Bearer tk_live_abc123'), 'tk_live_abc123')
  assert.equal(bearerApiKey('bearer tk_live_abc123'), 'tk_live_abc123')
  assert.equal(bearerApiKey('Bearer sk_other'), null)
  assert.equal(bearerApiKey('Basic tk_live_abc'), null)
  assert.equal(bearerApiKey(null), null)
  assert.equal(bearerApiKey(''), null)
})

test('normalizeScopes drops unknown scopes and defaults to read-only', () => {
  assert.deepEqual(normalizeScopes(['tickets:create', 'tickets:create', 'admin:all']), ['tickets:create'])
  assert.deepEqual(normalizeScopes(['nope']), ['tickets:read'])
  assert.deepEqual(normalizeScopes(undefined), ['tickets:read'])
})

test('apiKeyUsable respects revoked and expired', () => {
  const now = new Date('2026-10-25T00:00:00Z')
  assert.equal(apiKeyUsable({}, now), true)
  assert.equal(apiKeyUsable({ revokedAt: new Date('2026-10-01') }, now), false)
  assert.equal(apiKeyUsable({ expiresAt: new Date('2026-10-24') }, now), false)
  assert.equal(apiKeyUsable({ expiresAt: new Date('2026-11-24') }, now), true)
})

test('labels', () => {
  assert.equal(apiViaLabel('Claude (Acme)'), 'API · Claude (Acme)')
  assert.equal(apiViaLabel('  '), 'API · unnamed key')
  assert.equal(keyPreview('tk_live_AbCdEfGh'), 'tk_live_AbCd')
})
