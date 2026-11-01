// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cleanEventInput, INVITABLE_TYPES, isInvitable } from '../lib/calendar-core.ts'

describe('which kinds have a guest list', () => {
  it('only meeting, event and training', () => {
    assert.deepEqual([...INVITABLE_TYPES], ['meeting', 'event', 'training'])
    for (const t of ['meeting', 'event', 'training']) assert.equal(isInvitable(t), true, t)
    for (const t of ['holiday', 'leave', 'reminder', 'maintenance', 'other', 'ticket_due']) assert.equal(isInvitable(t), false, t)
  })

  it('accepts invited people on those kinds', () => {
    for (const type of ['meeting', 'event', 'training']) {
      const r = cleanEventInput({ type, title: 'x', start: '2026-11-03T09:00:00Z', attendee_ids: ['u1', 'u2'] })
      assert.equal(r.ok, true, type)
      assert.deepEqual(r.value.attendeeIds, ['u1', 'u2'])
    }
  })

  it('refuses invited people on the others, saying why', () => {
    for (const type of ['holiday', 'leave', 'reminder', 'maintenance', 'other']) {
      const r = cleanEventInput({ type, title: 'x', start: '2026-11-03', attendee_ids: ['u1'] })
      assert.equal(r.ok, false, type)
      assert.ok(r.error.includes('meeting') && r.error.includes(type), type)
    }
  })

  it('an empty list is fine on any kind', () => {
    assert.equal(cleanEventInput({ type: 'holiday', title: 'x', start: '2026-11-03', attendee_ids: [] }).ok, true)
    assert.equal(cleanEventInput({ type: 'holiday', title: 'x', start: '2026-11-03' }).ok, true)
  })
})
