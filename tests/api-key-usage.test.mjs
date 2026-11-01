// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createDeduper, lastDates, noUsage, summarizeUsage, usageDate, usageDocId } from '../lib/api-key-usage-core.ts'

const today = new Date('2026-11-10T15:00:00Z')

describe('the days', () => {
  it('lists the last 30 days oldest first, ending today', () => {
    const d = lastDates(today)
    assert.equal(d.length, 30)
    assert.equal(d[0], '2026-10-12')
    assert.equal(d[29], '2026-11-10')
  })

  it('names a record by key and day', () => {
    assert.equal(usageDate(new Date('2026-11-10T23:59:59Z')), '2026-11-10')
    assert.equal(usageDocId('k1', '2026-11-10'), 'k1~2026-11-10')
  })
})

describe('adding the days up', () => {
  const rows = [
    { keyId: 'k1', date: '2026-11-10', calls: 5, limited: 1, scopes: { 'tickets:read': 4, 'calendar:read': 1 } },
    { keyId: 'k1', date: '2026-11-05', calls: 3, limited: 0, scopes: { 'tickets:read': 3 } },
    { keyId: 'k1', date: '2026-10-20', calls: 10, limited: 2, scopes: { 'tickets:create': 10 } },
    { keyId: 'k1', date: '2026-09-01', calls: 99, limited: 0, scopes: null },
    { keyId: 'k2', date: '2026-11-09', calls: 2, limited: 0, scopes: null },
  ]
  const u = summarizeUsage(rows, today)

  it('counts 7 and 30 days and ignores older ones', () => {
    assert.equal(u.get('k1').calls7d, 8)
    assert.equal(u.get('k1').calls30d, 18)
    assert.equal(u.get('k1').limited30d, 3)
  })

  it('splits calls by permission', () => {
    assert.deepEqual(u.get('k1').byScope, { 'tickets:read': 7, 'calendar:read': 1, 'tickets:create': 10 })
  })

  it('has every day, with zeros where nothing happened', () => {
    const days = u.get('k1').byDay
    assert.equal(days.length, 30)
    assert.equal(days.find((d) => d.date === '2026-11-10').calls, 5)
    assert.equal(days.find((d) => d.date === '2026-11-09').calls, 0)
    assert.equal(days.reduce((n, d) => n + d.calls, 0), 18)
  })

  it('keeps keys apart and leaves out keys without records', () => {
    assert.equal(u.get('k2').calls30d, 2)
    assert.equal(u.has('k3'), false)
    assert.equal(noUsage(today).calls30d, 0)
  })
})

describe('counting a call once', () => {
  it('lets a request id through once, and always lets one without an id through', () => {
    const once = createDeduper()
    assert.equal(once('r1'), true)
    assert.equal(once('r1'), false)
    assert.equal(once('r2'), true)
    assert.equal(once(null), true)
    assert.equal(once(null), true)
  })

  it('forgets old ids', () => {
    const once = createDeduper(1000, 2)
    assert.equal(once('a', 0), true)
    assert.equal(once('b', 0), true)
    assert.equal(once('c', 5000), true)
    assert.equal(once('a', 5001), true)
  })
})
