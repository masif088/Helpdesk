// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compactTicket, hasApiFilters, parseTicketApiFilters, skillsMatchTicket, ticketMatchesApiFilters } from '../lib/ticket-api-filters.ts'

const parse = (qs, me = 'u-me') => parseTicketApiFilters(new URLSearchParams(qs), me)
const now = new Date('2026-11-10T12:00:00Z')
const isOpen = (s) => !['resolved', 'closed'].includes(s)
const ticket = (over = {}) => ({ status: 'open', createdBy: 'c1', contactUserId: null, updatedAt: '2026-11-05T00:00:00Z', dueDate: null, ...over })

describe('reading the query string', () => {
  it('has no filters by default', () => {
    const f = parse('')
    assert.equal(hasApiFilters(f), false)
  })

  it('turns `me` into the caller and drops duplicates', () => {
    const f = parse('assignee_ids=me,u2,u2&creator_ids=me')
    assert.deepEqual(f.assigneeIds, ['u-me', 'u2'])
    assert.deepEqual(f.creatorIds, ['u-me'])
    assert.equal(hasApiFilters(f), true)
  })

  it('reads skills, the match mode and flags', () => {
    const f = parse('skills=WordPress,Billing&skills_match=all&overdue=1&open=0&has_due_date=true')
    assert.deepEqual(f.skills, ['WordPress', 'Billing'])
    assert.equal(f.skillsMatch, 'all')
    assert.equal(f.overdue, true)
    assert.equal(f.open, false)
    assert.equal(f.hasDueDate, true)
  })

  it('refuses nonsense', () => {
    assert.ok(parse('updated_from=yesterday').error)
    assert.ok(parse('skills_match=most').error)
    assert.ok(parse('unassigned=1&assignee_ids=u2').error)
  })

  it('makes an updated range of whole days', () => {
    const f = parse('updated_from=2026-11-01&updated_to=2026-11-30')
    assert.equal(f.updatedFrom.toISOString(), '2026-11-01T00:00:00.000Z')
    assert.equal(f.updatedTo.toISOString(), '2026-11-30T23:59:59.999Z')
  })
})

describe('skills', () => {
  it('matches case-insensitively, any or all', () => {
    assert.equal(skillsMatchTicket(['WordPress', 'SEO'], ['wordpress'], 'any'), true)
    assert.equal(skillsMatchTicket(['WordPress'], ['wordpress', 'billing'], 'any'), true)
    assert.equal(skillsMatchTicket(['WordPress'], ['wordpress', 'billing'], 'all'), false)
    assert.equal(skillsMatchTicket([], ['billing'], 'any'), false)
    assert.equal(skillsMatchTicket([], [], 'any'), true)
  })
})

describe('matching a ticket', () => {
  const ctx = { now, isOpen }

  it('by the person who opened it, or by the client contact', () => {
    assert.equal(ticketMatchesApiFilters(ticket(), parse('creator_ids=c1'), ctx), true)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('creator_ids=c2'), ctx), false)
    assert.equal(ticketMatchesApiFilters(ticket({ contactUserId: 'c9' }), parse('customer_ids=c9'), ctx), true)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('customer_ids=c1'), ctx), true)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('customer_ids=c7'), ctx), false)
  })

  it('by last update', () => {
    assert.equal(ticketMatchesApiFilters(ticket(), parse('updated_from=2026-11-01&updated_to=2026-11-07'), ctx), true)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('updated_from=2026-11-06'), ctx), false)
  })

  it('overdue means open and past due', () => {
    const late = ticket({ dueDate: '2026-11-01T00:00:00Z' })
    assert.equal(ticketMatchesApiFilters(late, parse('overdue=1'), ctx), true)
    assert.equal(ticketMatchesApiFilters({ ...late, status: 'closed' }, parse('overdue=1'), ctx), false)
    assert.equal(ticketMatchesApiFilters(ticket({ dueDate: '2026-12-01T00:00:00Z' }), parse('overdue=1'), ctx), false)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('overdue=1'), ctx), false)
  })

  it('open, finished, with and without a due date', () => {
    assert.equal(ticketMatchesApiFilters(ticket({ status: 'closed' }), parse('open=1'), ctx), false)
    assert.equal(ticketMatchesApiFilters(ticket({ status: 'closed' }), parse('open=0'), ctx), true)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('has_due_date=0'), ctx), true)
    assert.equal(ticketMatchesApiFilters(ticket(), parse('has_due_date=1'), ctx), false)
  })

  it('combines filters with AND', () => {
    const t = ticket({ createdBy: 'c1', dueDate: '2026-11-01T00:00:00Z' })
    assert.equal(ticketMatchesApiFilters(t, parse('creator_ids=c1&overdue=1&open=1'), ctx), true)
    assert.equal(ticketMatchesApiFilters(t, parse('creator_ids=c2&overdue=1&open=1'), ctx), false)
  })
})

describe('the short version', () => {
  it('keeps what picks a ticket and adds the link', () => {
    const out = compactTicket(
      {
        id: 7,
        title: 'Printer offline',
        status: 'open',
        priority: 1,
        due_date: null,
        created_at: 'a',
        updated_at: 'b',
        type: { title: 'Support' },
        company: { id: 'co1', name: 'Acme', color: 'x' },
        creator: { id: 'c1', full_name: null, email: 'c@acme.test' },
        assignees: [{ user_id: 'u1', user_name: 'Dewi' }],
        tags: [{ name: 'urgent' }],
      },
      'https://app.test/'
    )
    assert.equal(out.url, 'https://app.test/tickets/7')
    assert.equal(out.requester.name, 'c@acme.test')
    assert.deepEqual(out.assignees, [{ id: 'u1', name: 'Dewi' }])
    assert.deepEqual(out.tags, ['urgent'])
    assert.equal('description' in out, false)
  })
})
