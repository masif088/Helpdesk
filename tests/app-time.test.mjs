// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addDays, cleanTimeZone, DEFAULT_TIME_ZONE, endOfDayInZone, instantInZone, isoInZone, isValidTimeZone, localDateOf, offsetLabel, parseDateBound, startOfDayInZone, todayInZone, zoneOffsetMinutes } from '../lib/app-time.ts'

const d = (s) => new Date(s)

describe('zone names', () => {
  it('knows real zones and refuses nonsense', () => {
    assert.equal(isValidTimeZone('Asia/Jakarta'), true)
    assert.equal(isValidTimeZone('America/New_York'), true)
    assert.equal(isValidTimeZone('UTC'), true)
    for (const bad of ['Mars/Olympus', '', '  ', null, undefined, 7]) assert.equal(isValidTimeZone(bad), false, String(bad))
  })

  it('falls back to the default', () => {
    assert.equal(cleanTimeZone('Asia/Makassar'), 'Asia/Makassar')
    assert.equal(cleanTimeZone('nope'), DEFAULT_TIME_ZONE)
    assert.equal(cleanTimeZone(null), DEFAULT_TIME_ZONE)
  })
})

describe('offsets', () => {
  it('Jakarta is always +7', () => {
    assert.equal(zoneOffsetMinutes('Asia/Jakarta', d('2026-11-03T00:00:00Z')), 420)
    assert.equal(zoneOffsetMinutes('Asia/Jakarta', d('2026-06-03T00:00:00Z')), 420)
  })

  it('New York follows daylight saving', () => {
    assert.equal(zoneOffsetMinutes('America/New_York', d('2026-07-01T12:00:00Z')), -240)
    assert.equal(zoneOffsetMinutes('America/New_York', d('2026-12-01T12:00:00Z')), -300)
  })

  it('has half-hour zones', () => {
    assert.equal(zoneOffsetMinutes('Asia/Kolkata', d('2026-11-03T00:00:00Z')), 330)
  })

  it('writes them as labels', () => {
    assert.equal(offsetLabel(420), 'UTC+7')
    assert.equal(offsetLabel(-300), 'UTC-5')
    assert.equal(offsetLabel(330), 'UTC+5:30')
    assert.equal(offsetLabel(0), 'UTC+0')
  })
})

describe('reading a filter value', () => {
  it('takes a plain date as a whole day in the zone', () => {
    assert.equal(parseDateBound('2026-11-03', 'Asia/Jakarta').toISOString(), '2026-11-02T17:00:00.000Z')
    assert.equal(parseDateBound('2026-11-03', 'Asia/Jakarta', true).toISOString(), '2026-11-03T16:59:59.999Z')
  })

  it('takes a full moment as it is, not as a day', () => {
    assert.equal(parseDateBound('2026-11-03T16:59:59.999Z', 'Asia/Jakarta', true).toISOString(), '2026-11-03T16:59:59.999Z')
    assert.equal(parseDateBound('2026-11-03T09:30:00+07:00', 'UTC').toISOString(), '2026-11-03T02:30:00.000Z')
  })

  it('refuses nonsense and impossible dates', () => {
    for (const bad of ['yesterday', '', null, undefined, '2026-02-30', '2026-13-01']) assert.equal(parseDateBound(bad, 'UTC'), null, String(bad))
  })
})

describe('dates in a zone', () => {
  it('reads the date an instant falls on, even when UTC says another day', () => {
    // 02:47 in Jakarta on 30 Oct is still 29 Oct in UTC
    assert.equal(localDateOf(d('2026-10-29T19:47:00Z'), 'Asia/Jakarta'), '2026-10-30')
    assert.equal(localDateOf(d('2026-10-29T19:47:00Z'), 'UTC'), '2026-10-29')
    assert.equal(localDateOf(d('2026-11-02T17:00:00Z'), 'Asia/Jakarta'), '2026-11-03')
  })

  it('finds the start and end of a day', () => {
    assert.equal(startOfDayInZone('2026-11-03', 'Asia/Jakarta').toISOString(), '2026-11-02T17:00:00.000Z')
    assert.equal(endOfDayInZone('2026-11-03', 'Asia/Jakarta').toISOString(), '2026-11-03T16:59:59.999Z')
    assert.equal(startOfDayInZone('2026-11-03', 'UTC').toISOString(), '2026-11-03T00:00:00.000Z')
  })

  it('copes with the day daylight saving ends', () => {
    // New York leaves daylight saving on Sunday 1 Nov 2026 at 02:00: that day has 25 hours
    assert.equal(startOfDayInZone('2026-11-01', 'America/New_York').toISOString(), '2026-11-01T04:00:00.000Z')
    assert.equal(startOfDayInZone('2026-11-02', 'America/New_York').toISOString(), '2026-11-02T05:00:00.000Z')
    assert.equal(endOfDayInZone('2026-11-01', 'America/New_York').toISOString(), '2026-11-02T04:59:59.999Z')
  })

  it('does day arithmetic', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  })

  it('says what today is in the zone', () => {
    assert.equal(todayInZone('Asia/Jakarta', d('2026-11-01T18:00:00Z')), '2026-11-02')
    assert.equal(todayInZone('UTC', d('2026-11-01T18:00:00Z')), '2026-11-01')
  })

  it('turns a wall clock time into an instant', () => {
    assert.equal(instantInZone('2026-11-03', '09:30', 'Asia/Jakarta').toISOString(), '2026-11-03T02:30:00.000Z')
    assert.equal(instantInZone('2026-11-03', '00:00', 'Asia/Jakarta').toISOString(), '2026-11-02T17:00:00.000Z')
  })

  it('writes an instant with the zone offset', () => {
    assert.equal(isoInZone(d('2026-11-03T09:00:00Z'), 'Asia/Jakarta'), '2026-11-03T16:00+07:00')
    assert.equal(isoInZone(d('2026-11-03T09:00:00Z'), 'Asia/Kolkata'), '2026-11-03T14:30+05:30')
    assert.equal(isoInZone(d('2026-12-01T12:00:00Z'), 'America/New_York'), '2026-12-01T07:00-05:00')
  })
})
