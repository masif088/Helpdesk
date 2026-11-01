// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { itemInDays, parseCalendarRange } from '../lib/calendar-core.ts'

const WIB = 'Asia/Jakarta'
const now = new Date('2026-11-01T18:00:00Z') // already the 2nd in Jakarta

describe('reading a calendar range', () => {
  it('turns plain dates into whole days in the zone', () => {
    const r = parseCalendarRange('2026-11-03', '2026-11-05', now, WIB)
    assert.equal(r.from.toISOString(), '2026-11-02T17:00:00.000Z')
    assert.equal(r.to.toISOString(), '2026-11-05T16:59:59.999Z')
    assert.deepEqual(r.days, { from: '2026-11-03', to: '2026-11-05' })
    assert.equal(r.timeZone, WIB)
  })

  it('defaults to the current month in the zone', () => {
    const r = parseCalendarRange(null, null, new Date('2026-10-31T20:00:00Z'), WIB) // 1 Nov in Jakarta
    assert.deepEqual(r.days, { from: '2026-11-01', to: '2026-11-30' })
    assert.equal(r.from.toISOString(), '2026-10-31T17:00:00.000Z')
    assert.equal(r.to.toISOString(), '2026-11-30T16:59:59.999Z')
  })

  it('ends the month from a given start', () => {
    assert.deepEqual(parseCalendarRange('2026-02-10', null, now, WIB).days, { from: '2026-02-10', to: '2026-02-28' })
  })

  it('keeps exact moments exact, and has no day range then', () => {
    const r = parseCalendarRange('2026-11-03T09:00:00Z', '2026-11-03T12:00:00Z', now, WIB)
    assert.equal(r.from.toISOString(), '2026-11-03T09:00:00.000Z')
    assert.equal(r.to.toISOString(), '2026-11-03T12:00:00.000Z')
    assert.equal(r.days, null)
  })

  it('refuses nonsense, a backwards range and too long a range', () => {
    assert.ok(parseCalendarRange('tomorrow', null, now, WIB).error)
    assert.ok(parseCalendarRange('2026-02-30', null, now, WIB).error)
    assert.ok(parseCalendarRange('2026-11-05', '2026-11-01', now, WIB).error)
    assert.ok(parseCalendarRange('2026-01-01', '2027-06-01', now, WIB).error)
  })
})

describe('which day an item is on', () => {
  const days = { from: '2026-11-03', to: '2026-11-03' }

  it('an all-day item by its dates, never by a time zone', () => {
    assert.equal(itemInDays({ all_day: true, start: '2026-11-03', end: '2026-11-03' }, days, WIB), true)
    assert.equal(itemInDays({ all_day: true, start: '2026-11-02', end: '2026-11-02' }, days, WIB), false)
    assert.equal(itemInDays({ all_day: true, start: '2026-11-02', end: '2026-11-04' }, days, WIB), true)
  })

  it('a timed item by the local day it starts and ends on', () => {
    // 02:00 local on the 3rd is still the 2nd in UTC
    assert.equal(itemInDays({ all_day: false, start: '2026-11-02T19:00:00.000Z', end: '2026-11-02T20:00:00.000Z' }, days, WIB), true)
    assert.equal(itemInDays({ all_day: false, start: '2026-11-02T19:00:00.000Z', end: '2026-11-02T20:00:00.000Z' }, days, 'UTC'), false)
    // 23:30 local on the 3rd is the 3rd; 00:30 local on the 4th is not
    assert.equal(itemInDays({ all_day: false, start: '2026-11-03T16:30:00.000Z', end: '2026-11-03T16:45:00.000Z' }, days, WIB), true)
    assert.equal(itemInDays({ all_day: false, start: '2026-11-03T17:30:00.000Z', end: '2026-11-03T18:00:00.000Z' }, days, WIB), false)
  })

  it('an event that ends exactly at local midnight does not spill into the next day', () => {
    const next = { from: '2026-11-04', to: '2026-11-04' }
    assert.equal(itemInDays({ all_day: false, start: '2026-11-03T15:00:00.000Z', end: '2026-11-03T17:00:00.000Z' }, next, WIB), false)
  })
})
