import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRateLimiter, DEFAULT_RATE_LIMIT_PER_HOUR, MAX_RATE_LIMIT_PER_HOUR, normalizeRateLimit } from '../lib/api-key-core.ts'
import { buildApiSkill } from '../lib/api-skill.ts'

test('normalizeRateLimit defaults to 100 and caps the maximum', () => {
  assert.equal(DEFAULT_RATE_LIMIT_PER_HOUR, 100)
  assert.equal(normalizeRateLimit(undefined), 100)
  assert.equal(normalizeRateLimit(null), 100)
  assert.equal(normalizeRateLimit(0), 100)
  assert.equal(normalizeRateLimit(-5), 100)
  assert.equal(normalizeRateLimit('50'), 100)
  assert.equal(normalizeRateLimit(250.9), 250)
  assert.equal(normalizeRateLimit(10 ** 9), MAX_RATE_LIMIT_PER_HOUR)
})

test('rate limiter allows the limit then refuses until the hour has room', () => {
  const rl = createRateLimiter(3_600_000)
  const t0 = 1_000_000
  for (let i = 0; i < 3; i++) assert.deepEqual(rl.hit('k', 3, t0 + i * 1000), { ok: true, remaining: 2 - i })
  const refused = rl.hit('k', 3, t0 + 10_000)
  assert.equal(refused.ok, false)
  assert.equal(refused.retryAfterSeconds, 3600 - 10)
  // the first call leaves the window after an hour
  assert.equal(rl.hit('k', 3, t0 + 3_600_001).ok, true)
})

test('rate limiter keeps keys apart and honours a changed limit', () => {
  const rl = createRateLimiter()
  assert.equal(rl.hit('a', 1, 0).ok, true)
  assert.equal(rl.hit('a', 1, 1).ok, false)
  assert.equal(rl.hit('b', 1, 1).ok, true)
  assert.equal(rl.hit('a', 5, 2).ok, true)
})

test('the skill names the portal, never a key, and lists only the allowed calls', () => {
  const skill = buildApiSkill('https://help.example.com/')
  assert.match(skill, /^---\nname: ticketing-api\n/)
  assert.ok(skill.includes('Base URL: `https://help.example.com`'))
  assert.ok(skill.includes('TICKETING_API_KEY'))
  assert.ok(!skill.includes('tk_live_'))
  for (const call of ['GET /api/tickets/lookup', 'POST /api/tickets`', '/api/tickets/{id}/detail', '/api/tickets/{id}/comments']) assert.ok(skill.includes(call), call)
})
