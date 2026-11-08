// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bucketOf, hasTicketFilters, parseActivityQuery, parseMyWorkingQuery, sessionInRange, splitIntoBuckets, ticketPassesActivityFilters, unionSeconds } from '../lib/people-activity-core.ts'

const d = (s) => new Date(s)
const parse = (qs, me = 'u-me', now = d('2026-11-04T10:00:00Z')) => parseActivityQuery(new URLSearchParams(qs), me, now)

describe('reading the query', () => {
  it('defaults to today in UTC', () => {
    const q = parse('')
    assert.equal(q.from.toISOString(), '2026-11-04T00:00:00.000Z')
    assert.equal(q.to.toISOString(), '2026-11-04T23:59:59.999Z')
    assert.equal(q.breakdown, 'none')
    assert.equal(hasTicketFilters(q), false)
  })

  it('takes dates as whole days and moments as they are', () => {
    const q = parse('from=2026-11-02&to=2026-11-03')
    assert.equal(q.from.toISOString(), '2026-11-02T00:00:00.000Z')
    assert.equal(q.to.toISOString(), '2026-11-03T23:59:59.999Z')
    const h = parse('from=2026-11-02T09:00:00Z&to=2026-11-02T12:00:00Z')
    assert.equal(h.from.toISOString(), '2026-11-02T09:00:00.000Z')
    assert.equal(h.to.toISOString(), '2026-11-02T12:00:00.000Z')
  })

  it('turns `me` into the caller and reads the filters', () => {
    const q = parse('user_ids=me,u2&company_ids=c1&customer_ids=k1&skills=WordPress,SEO&skills_match=all&type_ids=3,4&agent_skills=Billing&only_working=1&include_tickets=1&breakdown=day')
    assert.deepEqual(q.userIds, ['u-me', 'u2'])
    assert.deepEqual(q.typeIds, [3, 4])
    assert.equal(q.skillsMatch, 'all')
    assert.equal(q.onlyWorking, true)
    assert.equal(q.includeTickets, true)
    assert.equal(q.breakdown, 'day')
    assert.equal(hasTicketFilters(q), true)
  })

  it('refuses nonsense and too long periods', () => {
    assert.ok(parse('from=tomorrow').error)
    assert.ok(parse('from=2026-11-05&to=2026-11-01').error)
    assert.ok(parse('from=2026-01-01&to=2026-12-31').error)
    assert.ok(parse('breakdown=week').error)
    assert.ok(parse('from=2026-11-01&to=2026-11-20&breakdown=hour').error)
    assert.ok(parse('type_ids=a').error)
    assert.ok(parse('skills_match=most').error)
  })
})

describe('which tickets count', () => {
  const t = { companyId: 'c1', typeId: 3, createdBy: 'k1', contactUserId: null }

  it('passes everything without filters', () => {
    assert.equal(ticketPassesActivityFilters(t, parse(''), []), true)
  })

  it('by company, type and customer', () => {
    assert.equal(ticketPassesActivityFilters(t, parse('company_ids=c1'), []), true)
    assert.equal(ticketPassesActivityFilters(t, parse('company_ids=c2'), []), false)
    assert.equal(ticketPassesActivityFilters(t, parse('type_ids=3'), []), true)
    assert.equal(ticketPassesActivityFilters(t, parse('type_ids=4'), []), false)
    assert.equal(ticketPassesActivityFilters(t, parse('customer_ids=k1'), []), true)
    assert.equal(ticketPassesActivityFilters({ ...t, contactUserId: 'k9' }, parse('customer_ids=k9'), []), true)
    assert.equal(ticketPassesActivityFilters(t, parse('customer_ids=k2'), []), false)
  })

  it('by the skills the ticket needs', () => {
    assert.equal(ticketPassesActivityFilters(t, parse('skills=wordpress'), ['WordPress']), true)
    assert.equal(ticketPassesActivityFilters(t, parse('skills=wordpress,seo&skills_match=all'), ['WordPress']), false)
    assert.equal(ticketPassesActivityFilters(t, parse('skills=seo'), []), false)
  })

  it('combines with AND', () => {
    assert.equal(ticketPassesActivityFilters(t, parse('company_ids=c1&type_ids=4'), []), false)
    assert.equal(ticketPassesActivityFilters(t, parse('company_ids=c1&type_ids=3&skills=seo'), ['SEO']), true)
  })
})

describe('time entries in a period', () => {
  const from = d('2026-11-02T09:00:00Z')
  const to = d('2026-11-02T12:00:00Z')

  it('counts the reported time of an entry fully inside, adjustment included', () => {
    const r = sessionInRange({ startTime: '2026-11-02T10:00:00Z', stopTime: '2026-11-02T11:00:00Z', durationSeconds: 3600, durationAdjustment: 1800 }, from, to)
    assert.equal(r.seconds, 1800)
  })

  it('counts only the overlap of an entry that crosses the edge', () => {
    const r = sessionInRange({ startTime: '2026-11-02T08:00:00Z', stopTime: '2026-11-02T10:00:00Z', durationSeconds: 7200 }, from, to)
    assert.equal(r.seconds, 3600)
    assert.equal(r.start.toISOString(), '2026-11-02T09:00:00.000Z')
  })

  it('ignores entries outside', () => {
    assert.equal(sessionInRange({ startTime: '2026-11-02T13:00:00Z', stopTime: '2026-11-02T14:00:00Z', durationSeconds: 3600 }, from, to), null)
    assert.equal(sessionInRange({ startTime: '2026-11-02T06:00:00Z', stopTime: '2026-11-02T08:59:00Z', durationSeconds: 3600 }, from, to), null)
  })

  it('counts a running timer up to now', () => {
    const r = sessionInRange({ startTime: '2026-11-02T10:00:00Z', stopTime: null }, from, to, d('2026-11-02T10:30:00Z'))
    assert.equal(r.running, true)
    assert.equal(r.seconds, 1800)
    // and up to the end of the period when now is later
    assert.equal(sessionInRange({ startTime: '2026-11-02T10:00:00Z', stopTime: null }, from, to, d('2026-11-03T00:00:00Z')).seconds, 7200)
  })
})

describe('buckets', () => {
  it('names days and hours in UTC', () => {
    assert.equal(bucketOf(d('2026-11-02T09:41:00Z'), 'day'), '2026-11-02')
    assert.equal(bucketOf(d('2026-11-02T09:41:00Z'), 'hour'), '2026-11-02T09:00+00:00')
  })

  it('splits time across the hours it spans without losing a second', () => {
    const m = splitIntoBuckets(d('2026-11-02T09:30:00Z'), d('2026-11-02T11:15:00Z'), 6300, 'hour')
    assert.deepEqual([...m.entries()], [['2026-11-02T09:00+00:00', 1800], ['2026-11-02T10:00+00:00', 3600], ['2026-11-02T11:00+00:00', 900]])
    assert.equal([...m.values()].reduce((a, b) => a + b, 0), 6300)
  })

  it('splits a night over two days', () => {
    const m = splitIntoBuckets(d('2026-11-02T23:00:00Z'), d('2026-11-03T01:00:00Z'), 7200, 'day')
    assert.deepEqual([...m.entries()], [['2026-11-02', 3600], ['2026-11-03', 3600]])
  })

  it('does not split without a breakdown', () => {
    assert.equal(splitIntoBuckets(d('2026-11-02T09:00:00Z'), d('2026-11-02T10:00:00Z'), 3600, 'none').size, 0)
  })
})

describe('in the app time zone', () => {
  const WIB = 'Asia/Jakarta'

  it('reads a plain date as a whole day there, and defaults to today there', () => {
    const q = parseActivityQuery(new URLSearchParams('from=2026-11-03&to=2026-11-03'), 'me', d('2026-11-04T10:00:00Z'), WIB)
    assert.equal(q.from.toISOString(), '2026-11-02T17:00:00.000Z')
    assert.equal(q.to.toISOString(), '2026-11-03T16:59:59.999Z')
    assert.equal(q.timeZone, WIB)
    // 18:00 UTC on the 1st is already the 2nd in Jakarta
    const today = parseActivityQuery(new URLSearchParams(''), 'me', d('2026-11-01T18:00:00Z'), WIB)
    assert.equal(today.from.toISOString(), '2026-11-01T17:00:00.000Z')
    assert.equal(today.to.toISOString(), '2026-11-02T16:59:59.999Z')
  })

  it('names days and hours on the local clock', () => {
    assert.equal(bucketOf(d('2026-11-02T20:00:00Z'), 'day', WIB), '2026-11-03')
    assert.equal(bucketOf(d('2026-11-03T09:41:00Z'), 'hour', WIB), '2026-11-03T16:00+07:00')
  })

  it('splits a night over two local days', () => {
    // 23:00-01:00 local on 3-4 Nov is 16:00-18:00 UTC
    const m = splitIntoBuckets(d('2026-11-03T16:00:00Z'), d('2026-11-03T18:00:00Z'), 7200, 'day', WIB)
    assert.deepEqual([...m.entries()], [['2026-11-03', 3600], ['2026-11-04', 3600]])
  })

  it('splits hours on a half-hour zone', () => {
    const m = splitIntoBuckets(d('2026-11-03T09:00:00Z'), d('2026-11-03T10:00:00Z'), 3600, 'hour', 'Asia/Kolkata')
    assert.deepEqual([...m.entries()], [['2026-11-03T14:00+05:30', 1800], ['2026-11-03T15:00+05:30', 1800]])
  })
})

describe('overlapping work', () => {
  const iv = (a, b) => ({ start: d(a), end: d(b) })

  it('does not count overlapping entries twice', () => {
    assert.equal(unionSeconds([iv('2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z'), iv('2026-11-02T09:30:00Z', '2026-11-02T10:30:00Z')]), 5400)
  })

  it('adds separate stretches and handles none', () => {
    assert.equal(unionSeconds([iv('2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z'), iv('2026-11-02T11:00:00Z', '2026-11-02T11:30:00Z')]), 5400)
    assert.equal(unionSeconds([]), 0)
  })
})

describe('My working query', () => {
  const my = (qs, now = d('2026-11-04T10:00:00Z'), tz = 'Asia/Jakarta') => parseMyWorkingQuery(new URLSearchParams(qs), 'u-me', now, tz)

  it('is only the caller, with tickets and every time entry', () => {
    const q = my('user_ids=someone-else&company_ids=c1&only_working=0')
    assert.deepEqual(q.userIds, ['u-me'])
    assert.deepEqual(q.companyIds, [])
    assert.equal(q.includeTickets, true)
    assert.equal(q.includeSessions, true)
  })
  it('is today in the app zone, per hour', () => {
    const q = my('')
    assert.equal(q.from.toISOString(), '2026-11-03T17:00:00.000Z')
    assert.equal(q.to.toISOString(), '2026-11-04T16:59:59.999Z')
    assert.equal(q.breakdown, 'hour')
  })
  it('shows up to 3 days per hour and longer per day, unless asked', () => {
    assert.equal(my('from=2026-11-02&to=2026-11-04').breakdown, 'hour')
    assert.equal(my('from=2026-11-01&to=2026-11-07').breakdown, 'day')
    assert.equal(my('from=2026-11-02&to=2026-11-02&breakdown=day').breakdown, 'day')
  })
  it('takes an exact range', () => {
    const q = my('from=2026-11-04T09:00:00%2B07:00&to=2026-11-04T12:30:00%2B07:00')
    assert.equal(q.from.toISOString(), '2026-11-04T02:00:00.000Z')
    assert.equal(q.to.toISOString(), '2026-11-04T05:30:00.000Z')
  })
  it('allows 30 days and refuses more', () => {
    assert.ok(!my('from=2026-10-06&to=2026-11-04').error)
    assert.match(my('from=2026-10-01&to=2026-11-04').error, /30 days/)
    assert.match(my('from=2026-09-01&to=2026-11-04').error, /at most/)
  })
  it('refuses nonsense', () => {
    assert.ok(my('from=tomorrow').error)
    assert.ok(my('from=2026-11-05&to=2026-11-04').error)
  })
})

describe('sessions flag', () => {
  it('is off unless asked', () => {
    assert.equal(parse('').includeSessions, false)
    assert.equal(parse('include_sessions=1').includeSessions, true)
  })
})
