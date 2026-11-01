// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mergeAssignees, parseKeyTicketPatch, toPatchBody } from '../lib/ticket-key-update-core.ts'

describe('what a key may change', () => {
  it('accepts status, assignees and due date', () => {
    const r = parseKeyTicketPatch({ status: ' resolved ', add_assignees: ['u1', 'u1', 'u2'], due_date: '2026-11-20' })
    assert.equal(r.ok, true)
    assert.deepEqual(r.patch, { status: 'resolved', addAssignees: ['u1', 'u2'], dueDate: '2026-11-20' })
  })

  it('refuses every other field, naming it', () => {
    for (const field of ['title', 'description', 'company_id', 'ticket_type', 'priority', 'type_id', 'tag_ids', 'contact_user_id', 'hourly_rate']) {
      const r = parseKeyTicketPatch({ status: 'open', [field]: 'x' })
      assert.equal(r.ok, false, field)
      assert.ok(r.error.includes(field), field)
    }
  })

  it('refuses an empty or odd body', () => {
    assert.equal(parseKeyTicketPatch({}).ok, false)
    assert.equal(parseKeyTicketPatch(null).ok, false)
    assert.equal(parseKeyTicketPatch([]).ok, false)
    assert.equal(parseKeyTicketPatch('status').ok, false)
  })

  it('checks each value', () => {
    assert.equal(parseKeyTicketPatch({ status: '' }).ok, false)
    assert.equal(parseKeyTicketPatch({ status: 7 }).ok, false)
    assert.equal(parseKeyTicketPatch({ assignees: 'u1' }).ok, false)
    assert.equal(parseKeyTicketPatch({ assignees: [1] }).ok, false)
    assert.equal(parseKeyTicketPatch({ assignees: Array.from({ length: 21 }, (_, i) => `u${i}`) }).ok, false)
    assert.equal(parseKeyTicketPatch({ due_date: 'someday' }).ok, false)
    assert.equal(parseKeyTicketPatch({ assignees: ['a'], add_assignees: ['b'] }).ok, false)
  })

  it('clears the due date with null', () => {
    assert.deepEqual(parseKeyTicketPatch({ due_date: null }).patch, { dueDate: null })
  })
})

describe('who is assigned afterwards', () => {
  it('replaces with `assignees`, adds and removes otherwise, without duplicates', () => {
    assert.deepEqual(mergeAssignees(['a', 'b'], { assignees: ['c'] }), ['c'])
    assert.deepEqual(mergeAssignees(['a', 'b'], { addAssignees: ['b', 'c'] }), ['a', 'b', 'c'])
    assert.deepEqual(mergeAssignees(['a', 'b'], { removeAssignees: ['a'] }), ['b'])
    assert.deepEqual(mergeAssignees(['a'], { addAssignees: ['b'], removeAssignees: ['a'] }), ['b'])
    assert.deepEqual(mergeAssignees(['a', 'b'], { assignees: [] }), [])
  })
})

describe('the body for the normal ticket route', () => {
  it('has only what was asked for', () => {
    assert.deepEqual(toPatchBody({ status: 'closed' }, []), { status: 'closed' })
    assert.deepEqual(toPatchBody({ addAssignees: ['u2'], dueDate: null }, ['u1']), { assignees: ['u1', 'u2'], due_date: null })
  })
})
