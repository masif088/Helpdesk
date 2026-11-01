// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatWhen, isCalendarResponse, newlyInvited, reminderRecipients, summarizeResponses } from '../lib/calendar-core.ts'

describe('answers to an invitation', () => {
  it('knows the three answers', () => {
    assert.equal(isCalendarResponse('accepted'), true)
    assert.equal(isCalendarResponse('maybe'), false)
    assert.equal(isCalendarResponse(undefined), false)
  })

  it('counts answers of invited people, the rest are awaiting', () => {
    assert.deepEqual(summarizeResponses(['a', 'b', 'c', 'd'], { a: 'accepted', b: 'declined', c: 'tentative', gone: 'accepted' }), { accepted: 1, declined: 1, tentative: 1, awaiting: 1 })
    assert.deepEqual(summarizeResponses([], { a: 'accepted' }), { accepted: 0, declined: 0, tentative: 0, awaiting: 0 })
    assert.deepEqual(summarizeResponses(['a'], null), { accepted: 0, declined: 0, tentative: 0, awaiting: 1 })
  })
})

describe('a readable time', () => {
  it('shows a timed event in the zone given', () => {
    const w = formatWhen({ all_day: false, start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T10:30:00.000Z' }, 420)
    assert.equal(w, 'Tue 3 Nov 2026, 16:00 to 17:30 (UTC+7)')
  })

  it('handles a half-hour zone and one that crosses midnight', () => {
    assert.equal(formatWhen({ all_day: false, start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T10:00:00.000Z' }, 330), 'Tue 3 Nov 2026, 14:30 to 15:30 (UTC+5:30)')
    assert.equal(formatWhen({ all_day: false, start: '2026-11-03T16:00:00.000Z', end: '2026-11-03T18:00:00.000Z' }, 420), 'Tue 3 Nov 23:00 to Wed 4 Nov 01:00 2026 (UTC+7)')
  })

  it('shows all-day items as dates without a zone', () => {
    assert.equal(formatWhen({ all_day: true, start: '2026-08-17', end: '2026-08-17' }), 'Mon 17 Aug 2026')
    assert.equal(formatWhen({ all_day: true, start: '2026-12-28', end: '2026-12-31' }), 'Mon 28 Dec to Thu 31 Dec 2026')
  })

  it('shows UTC when no offset is given', () => {
    assert.equal(formatWhen({ all_day: false, start: '2026-11-03T09:00:00.000Z', end: '2026-11-03T10:00:00.000Z' }), 'Tue 3 Nov 2026, 09:00 to 10:00 (UTC+0)')
  })
})

describe('reminders', () => {
  it('a personal reminder goes to its owner only', () => {
    assert.deepEqual(reminderRecipients({ type: 'reminder', ownerId: 'u1', attendeeIds: ['u2'], createdBy: 'u1' }), ['u1'])
  })

  it('a meeting goes to the invited and the maker, minus those who declined', () => {
    assert.deepEqual(reminderRecipients({ type: 'meeting', ownerId: null, attendeeIds: ['a', 'b'], createdBy: 'm', responses: { b: 'declined' } }).sort(), ['a', 'm'])
    assert.deepEqual(reminderRecipients({ type: 'meeting', ownerId: null, attendeeIds: ['a'], createdBy: 'a' }), ['a'])
  })
})

describe('who is new', () => {
  it('lists the people added by a change', () => {
    assert.deepEqual(newlyInvited(['a'], ['a', 'b', 'c']), ['b', 'c'])
    assert.deepEqual(newlyInvited(['a', 'b'], ['a']), [])
  })
})
