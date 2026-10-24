// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { csatDayIsFinal, datesBetween, dayNeedsBuild, emptyDayCsat, emptyDaySla, mergeCsat, mergeSla, slaDayIsFinal } from '../lib/sla-daily.ts'

const tally = (met = 0, missed = 0, breached = 0, running = 0) => ({ met, missed, breached, running })
const sla = (over = {}) => ({ ...emptyDaySla(), ...over })

describe('dates', () => {
  it('lists every day of a range, both ends included', () => {
    assert.deepEqual(datesBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    assert.deepEqual(datesBetween('2026-10-05', '2026-10-05'), ['2026-10-05'])
    assert.deepEqual(datesBetween('2026-10-06', '2026-10-05'), [])
  })
})

describe('adding days up', () => {
  it('sums SLA counts in total, per company and per type', () => {
    const a = sla({ tickets: 2, respond: tally(1, 1), resolve: tally(2), byCompany: { c1: { tickets: 2, respond: tally(1, 1), resolve: tally(2) } }, byType: { t1: { tickets: 2, respond: tally(1, 1), resolve: tally(2) } } })
    const b = sla({ tickets: 1, respond: tally(0, 0, 1), resolve: tally(0, 0, 0, 1), byCompany: { c1: { tickets: 1, respond: tally(0, 0, 1), resolve: tally(0, 0, 0, 1) }, c2: { tickets: 0, respond: tally(), resolve: tally() } } })
    const m = mergeSla([a, b])
    assert.equal(m.tickets, 3)
    assert.deepEqual(m.respond, tally(1, 1, 1))
    assert.deepEqual(m.resolve, tally(2, 0, 0, 1))
    assert.equal(m.byCompany.c1.tickets, 3)
    assert.deepEqual(m.byCompany.c1.respond, tally(1, 1, 1))
    assert.ok(m.byCompany.c2)
    assert.equal(m.byType.t1.tickets, 2)
  })
  it('does not change the days it adds', () => {
    const a = sla({ tickets: 1, respond: tally(1) })
    mergeSla([a, a])
    assert.equal(a.tickets, 1)
    assert.deepEqual(a.respond, tally(1))
  })
  it('averages ratings from sums, not from averages of days', () => {
    // day 1: one rating of 5; day 2: three ratings of 1 -> overall (5+1+1+1)/4 = 2, not (5+1)/2 = 3
    const d1 = { ...emptyDayCsat(), n: 1, sum: 5, dist: [0, 0, 0, 0, 1], byAgent: { u1: { n: 1, sum: 5 } }, byCompany: { c1: { n: 1, sum: 5 } } }
    const d2 = { ...emptyDayCsat(), n: 3, sum: 3, dist: [3, 0, 0, 0, 0], byAgent: { u1: { n: 3, sum: 3 } }, byCompany: { c1: { n: 3, sum: 3 } } }
    const m = mergeCsat([d1, d2])
    assert.equal(m.n, 4)
    assert.equal(m.sum / m.n, 2)
    assert.deepEqual(m.dist, [3, 0, 0, 0, 1])
    assert.deepEqual(m.byAgent.u1, { n: 4, sum: 8 })
  })
  it('keeps the newest low comments, at most the limit', () => {
    const low = (id, at) => ({ ticketId: id, title: 't', companyId: null, rating: 1, comment: 'bad', at })
    const m = mergeCsat([{ ...emptyDayCsat(), low: [low(1, '2026-10-01T10:00:00Z'), low(2, '2026-10-03T10:00:00Z')] }, { ...emptyDayCsat(), low: [low(3, '2026-10-02T10:00:00Z')] }], 2)
    assert.deepEqual(m.low.map((l) => l.ticketId), [2, 3])
  })
})

describe('when a day is settled', () => {
  it('a past day with nothing running or overdue is final; today never is', () => {
    assert.equal(slaDayIsFinal('2026-10-20', '2026-10-25', sla({ tickets: 3, respond: tally(2, 1), resolve: tally(3) })), true)
    assert.equal(slaDayIsFinal('2026-10-20', '2026-10-25', sla({ resolve: tally(0, 0, 1) })), false) // overdue, may still be resolved
    assert.equal(slaDayIsFinal('2026-10-20', '2026-10-25', sla({ resolve: tally(0, 0, 0, 1) })), false)
    assert.equal(slaDayIsFinal('2026-10-25', '2026-10-25', sla()), false)
    assert.equal(csatDayIsFinal('2026-10-24', '2026-10-25'), true)
    assert.equal(csatDayIsFinal('2026-10-25', '2026-10-25'), false)
  })
})

describe('when a day is rebuilt', () => {
  const stored = (over = {}) => ({ slaFinal: false, csatFinal: false, computedAt: '2026-10-25T01:00:00Z', ...over })
  it('always when it was never stored', () => {
    assert.equal(dayNeedsBuild('2026-10-20', undefined, '2026-10-25', false), true)
  })
  it('never when it is settled, even on Refresh', () => {
    assert.equal(dayNeedsBuild('2026-10-20', stored({ slaFinal: true, csatFinal: true }), '2026-10-25', true), false)
  })
  it('an open day is rebuilt once a day, or on Refresh', () => {
    assert.equal(dayNeedsBuild('2026-10-25', stored(), '2026-10-25', false), false) // already built today
    assert.equal(dayNeedsBuild('2026-10-25', stored(), '2026-10-25', true), true)
    assert.equal(dayNeedsBuild('2026-10-24', stored({ computedAt: '2026-10-24T20:00:00Z' }), '2026-10-25', false), true) // built yesterday
  })
  it('a day long past that still has a clock running is left alone', () => {
    assert.equal(dayNeedsBuild('2026-05-01', stored({ computedAt: '2026-05-02T00:00:00Z' }), '2026-10-25', true), false)
  })
})
