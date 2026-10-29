// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CALENDAR_ITEM_ORDER, canSeeEvent, cleanEventInput, expandOccurrences, itemTimes, mayChangeEvent, mayCreateEvent } from '../lib/calendar-core.ts'

const d = (s) => new Date(s)
const staff = { id: 'u1', isStaff: true, isManager: false, companyId: null }
const manager = { id: 'm1', isStaff: true, isManager: true, companyId: null }
const client = { id: 'c1', isStaff: false, isManager: false, companyId: 'co1' }

describe('cleaning an event', () => {
  it('needs a known type, a title and a start', () => {
    assert.equal(cleanEventInput({ title: 'x', start: '2026-11-02' }).ok, false)
    assert.equal(cleanEventInput({ type: 'meeting', start: '2026-11-02T09:00:00Z' }).ok, false)
    assert.equal(cleanEventInput({ type: 'meeting', title: 'x' }).ok, false)
    assert.equal(cleanEventInput({ type: 'party', title: 'x', start: '2026-11-02' }).ok, false)
  })

  it('makes a meeting one hour long by default', () => {
    const r = cleanEventInput({ type: 'meeting', title: ' Standup ', start: '2026-11-02T09:00:00Z' })
    assert.equal(r.ok, true)
    assert.equal(r.value.title, 'Standup')
    assert.equal(r.value.allDay, false)
    assert.equal(r.value.endAt.getTime() - r.value.startAt.getTime(), 3_600_000)
    assert.equal(r.value.visibility, 'staff')
  })

  it('stores a holiday as whole days, visible to everyone', () => {
    const r = cleanEventInput({ type: 'holiday', title: 'Independence Day', start: '2026-08-17' })
    assert.equal(r.ok, true)
    assert.equal(r.value.allDay, true)
    assert.equal(r.value.startAt.toISOString(), '2026-08-17T00:00:00.000Z')
    assert.equal(r.value.endAt.toISOString(), '2026-08-17T23:59:59.999Z')
    assert.equal(r.value.visibility, 'everyone')
  })

  it('keeps the last day of a multi-day leave', () => {
    const r = cleanEventInput({ type: 'leave', title: 'Annual leave', start: '2026-12-28', end: '2026-12-31' })
    assert.equal(r.ok, true)
    assert.equal(r.value.endAt.toISOString(), '2026-12-31T23:59:59.999Z')
  })

  it('refuses an end before the start, bad colors and links', () => {
    assert.equal(cleanEventInput({ type: 'event', title: 'x', start: '2026-11-05', end: '2026-11-01' }).ok, false)
    assert.equal(cleanEventInput({ type: 'event', title: 'x', start: '2026-11-05', color: 'red' }).ok, false)
    assert.equal(cleanEventInput({ type: 'meeting', title: 'x', start: '2026-11-05T10:00:00Z', meeting_url: 'javascript:alert(1)' }).ok, false)
  })

  it('a personal reminder is private by default', () => {
    assert.equal(cleanEventInput({ type: 'reminder', title: 'Call bank', start: '2026-11-05T10:00:00Z' }).value.visibility, 'private')
  })
})

describe('repeating events', () => {
  const weekly = { startAt: d('2026-11-02T09:00:00Z'), endAt: d('2026-11-02T10:00:00Z'), repeat: 'weekly', repeatUntil: null }

  it('lists the occurrences inside a range', () => {
    const o = expandOccurrences(weekly, d('2026-11-01T00:00:00Z'), d('2026-11-30T00:00:00Z'))
    assert.deepEqual(o.map((x) => x.start.toISOString().slice(0, 10)), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'])
  })

  it('jumps far ahead without walking every week', () => {
    const o = expandOccurrences(weekly, d('2030-01-01T00:00:00Z'), d('2030-01-31T00:00:00Z'))
    assert.ok(o.length >= 4 && o.length <= 5)
    assert.ok(o.every((x) => x.start.getUTCDay() === 1))
  })

  it('stops at repeat_until', () => {
    const o = expandOccurrences({ ...weekly, repeatUntil: d('2026-11-10T23:59:59Z') }, d('2026-11-01T00:00:00Z'), d('2026-12-31T00:00:00Z'))
    assert.equal(o.length, 2)
  })

  it('repeats a holiday every year', () => {
    const holiday = { startAt: d('2026-08-17T00:00:00Z'), endAt: d('2026-08-17T23:59:59.999Z'), repeat: 'yearly', repeatUntil: null }
    const o = expandOccurrences(holiday, d('2028-08-01T00:00:00Z'), d('2028-08-31T00:00:00Z'))
    assert.equal(o.length, 1)
    assert.equal(o[0].start.toISOString().slice(0, 10), '2028-08-17')
  })

  it('clamps the 31st in shorter months', () => {
    const monthly = { startAt: d('2026-01-31T09:00:00Z'), endAt: d('2026-01-31T10:00:00Z'), repeat: 'monthly', repeatUntil: null }
    const o = expandOccurrences(monthly, d('2026-02-01T00:00:00Z'), d('2026-02-28T23:59:59Z'))
    assert.equal(o[0].start.toISOString().slice(0, 10), '2026-02-28')
  })

  it('a single event is in range or not', () => {
    const one = { startAt: d('2026-11-02T09:00:00Z'), endAt: d('2026-11-02T10:00:00Z'), repeat: 'none', repeatUntil: null }
    assert.equal(expandOccurrences(one, d('2026-11-01T00:00:00Z'), d('2026-11-03T00:00:00Z')).length, 1)
    assert.equal(expandOccurrences(one, d('2026-11-03T00:00:00Z'), d('2026-11-04T00:00:00Z')).length, 0)
  })

  it('catches a multi-day event that started before the range', () => {
    const leave = { startAt: d('2026-12-28T00:00:00Z'), endAt: d('2026-12-31T23:59:59.999Z'), repeat: 'none', repeatUntil: null }
    assert.equal(expandOccurrences(leave, d('2026-12-30T00:00:00Z'), d('2027-01-05T00:00:00Z')).length, 1)
  })
})

describe('who sees what', () => {
  const base = { type: 'meeting', ownerId: null, attendeeIds: [], companyId: null, createdBy: 'u1' }

  it('a private event is only for its owner or creator, even managers do not see it', () => {
    const ev = { ...base, type: 'reminder', visibility: 'private', ownerId: 'u1' }
    assert.equal(canSeeEvent(ev, staff), true)
    assert.equal(canSeeEvent(ev, manager), false)
  })

  it('staff see team events, clients do not', () => {
    const ev = { ...base, visibility: 'staff' }
    assert.equal(canSeeEvent(ev, staff), true)
    assert.equal(canSeeEvent(ev, client), false)
  })

  it('a client sees everyone-events, their own company events and meetings they are in', () => {
    assert.equal(canSeeEvent({ ...base, visibility: 'everyone' }, client), true)
    assert.equal(canSeeEvent({ ...base, visibility: 'company', companyId: 'co1' }, client), true)
    assert.equal(canSeeEvent({ ...base, visibility: 'company', companyId: 'co2' }, client), false)
    assert.equal(canSeeEvent({ ...base, visibility: 'staff', attendeeIds: ['c1'] }, client), true)
  })
})

describe('who may change what', () => {
  it('only managers add holidays, anyone on the team adds their own leave', () => {
    assert.equal(mayCreateEvent('holiday', null, staff), false)
    assert.equal(mayCreateEvent('holiday', null, manager), true)
    assert.equal(mayCreateEvent('leave', null, staff), true)
    assert.equal(mayCreateEvent('leave', 'someone-else', staff), false)
    assert.equal(mayCreateEvent('leave', 'someone-else', manager), true)
    assert.equal(mayCreateEvent('meeting', null, client), false)
  })

  it('staff change what they made, managers change anything, clients nothing', () => {
    const mine = { type: 'meeting', ownerId: null, createdBy: 'u1' }
    const theirs = { type: 'meeting', ownerId: null, createdBy: 'other' }
    assert.equal(mayChangeEvent(mine, staff), true)
    assert.equal(mayChangeEvent(theirs, staff), false)
    assert.equal(mayChangeEvent(theirs, manager), true)
    assert.equal(mayChangeEvent(mine, client), false)
    assert.equal(mayChangeEvent({ type: 'holiday', ownerId: null, createdBy: 'u1' }, staff), false)
  })
})

describe('what the API shows', () => {
  it('shows all-day items as plain dates and timed ones as moments', () => {
    assert.deepEqual(itemTimes(true, d('2026-08-17T00:00:00Z'), d('2026-08-18T23:59:59.999Z')), { start: '2026-08-17', end: '2026-08-18' })
    assert.deepEqual(itemTimes(false, d('2026-11-02T09:00:00Z'), d('2026-11-02T10:00:00Z')), { start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T10:00:00.000Z' })
  })

  it('sorts a day with all-day items first, then by time', () => {
    const items = [
      { start: '2026-11-02T09:00:00.000Z', all_day: false, title: 'B' },
      { start: '2026-11-02', all_day: true, title: 'A' },
      { start: '2026-11-01T15:00:00.000Z', all_day: false, title: 'Z' },
    ]
    assert.deepEqual(items.sort(CALENDAR_ITEM_ORDER).map((i) => i.title), ['Z', 'A', 'B'])
  })
})
