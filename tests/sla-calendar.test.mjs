// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cleanCalendar, DEFAULT_SLA_CALENDAR, dueAtMs, isRunningAt, pausedIntervals, runningMs } from '../lib/sla-calendar.ts'

const MIN = 60_000
const HOUR = 60 * MIN
// Jakarta (UTC+7), Monday-Friday 09:00-17:00 local
const cal = { ...DEFAULT_SLA_CALENDAR, enabled: true, holidays: ['2026-10-30'] }
/** Local Jakarta time as epoch ms */
const at = (iso) => Date.parse(`${iso}+07:00`)

describe('always on', () => {
  it('counts every minute when the calendar is off', () => {
    assert.equal(runningMs(DEFAULT_SLA_CALENDAR, 0, 90 * MIN), 90 * MIN)
    assert.equal(dueAtMs(undefined, 1000, 60), 1000 + 60 * MIN)
  })
})

describe('business hours', () => {
  it('counts only opening hours', () => {
    // Monday 2026-10-26 16:00 -> Tuesday 10:00 = 1h (Mon) + 1h (Tue)
    assert.equal(runningMs(cal, at('2026-10-26T16:00:00'), at('2026-10-27T10:00:00')), 2 * HOUR)
  })

  it('skips the weekend', () => {
    // Friday 2026-10-23 16:00 -> Monday 10:00 = 1h + 1h
    assert.equal(runningMs(cal, at('2026-10-23T16:00:00'), at('2026-10-26T10:00:00')), 2 * HOUR)
  })

  it('skips holidays', () => {
    // Thursday 2026-10-29 16:00, holiday on Friday 30th -> Monday 2026-11-02 10:00
    assert.equal(runningMs(cal, at('2026-10-29T16:00:00'), at('2026-11-02T10:00:00')), 2 * HOUR)
  })

  it('finds the due time across a night', () => {
    // 2 working hours from Monday 16:00 -> Tuesday 10:00
    assert.equal(dueAtMs(cal, at('2026-10-26T16:00:00'), 120), at('2026-10-27T10:00:00'))
  })

  it('starts a ticket created at night on the next opening', () => {
    assert.equal(dueAtMs(cal, at('2026-10-26T22:00:00'), 60), at('2026-10-27T10:00:00'))
  })

  it('tells whether a clock is running', () => {
    assert.equal(isRunningAt(cal, at('2026-10-26T12:00:00')), true)
    assert.equal(isRunningAt(cal, at('2026-10-26T18:00:00')), false)
    assert.equal(isRunningAt(cal, at('2026-10-25T12:00:00')), false)
  })
})

describe('pauses', () => {
  it('does not count paused time', () => {
    const paused = [[at('2026-10-26T10:00:00'), at('2026-10-26T12:00:00')]]
    assert.equal(runningMs(cal, at('2026-10-26T09:00:00'), at('2026-10-26T13:00:00'), paused), 2 * HOUR)
    assert.equal(dueAtMs(cal, at('2026-10-26T09:00:00'), 180, paused), at('2026-10-26T14:00:00'))
  })

  it('stops the clock while paused', () => {
    const paused = [[at('2026-10-26T10:00:00'), at('2026-10-26T12:00:00')]]
    assert.equal(isRunningAt(cal, at('2026-10-26T11:00:00'), paused), false)
  })

  it('builds pauses from status changes', () => {
    const waiting = new Set(['waiting'])
    const changes = [
      { at: 2000, from: 'open', to: 'waiting' },
      { at: 5000, from: 'waiting', to: 'open' },
      { at: 8000, from: 'open', to: 'waiting' },
    ]
    assert.deepEqual(pausedIntervals(changes, 'waiting', 1000, 10_000, waiting), [
      [2000, 5000],
      [8000, 10_000],
    ])
  })

  it('knows a ticket that never changed status', () => {
    const waiting = new Set(['waiting'])
    assert.deepEqual(pausedIntervals([], 'waiting', 1000, 4000, waiting), [[1000, 4000]])
    assert.deepEqual(pausedIntervals([], 'open', 1000, 4000, waiting), [])
  })

  it('counts the time before the first change in that change\'s old status', () => {
    const waiting = new Set(['waiting'])
    assert.deepEqual(pausedIntervals([{ at: 3000, from: 'waiting', to: 'open' }], 'open', 1000, 9000, waiting), [[1000, 3000]])
  })
})

describe('cleaning the stored calendar', () => {
  it('falls back to the default for junk', () => {
    assert.deepEqual(cleanCalendar('not json'), DEFAULT_SLA_CALENDAR)
    assert.deepEqual(cleanCalendar(null), DEFAULT_SLA_CALENDAR)
  })

  it('drops bad days, times and holidays', () => {
    const c = cleanCalendar(JSON.stringify({ enabled: true, utcOffsetMinutes: 60, week: [{ open: '18:00', close: '09:00' }, { open: '08:30', close: '12:00' }], holidays: ['2026-12-25', 'x', '2026-12-25'] }))
    assert.equal(c.enabled, true)
    assert.equal(c.utcOffsetMinutes, 60)
    assert.equal(c.week[0], null)
    assert.deepEqual(c.week[1], { open: '08:30', close: '12:00' })
    assert.equal(c.week.length, 7)
    assert.deepEqual(c.holidays, ['2026-12-25'])
  })
})
