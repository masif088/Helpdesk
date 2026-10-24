// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { agentDefaultSlugs, customerDefaultSlugs, isAgentDefault, isCustomerDefault } from '../lib/ticket-status-defaults.ts'

const s = (slug, over = {}) => ({ slug, isActive: true, showInKanban: true, ...over })

describe('before anything is chosen (old behaviour)', () => {
  const list = [s('open'), s('question'), s('client_review'), s('pending', { showInKanban: false }), s('old', { isActive: false })]
  it('agents start on the Kanban statuses', () => {
    assert.deepEqual(agentDefaultSlugs(list), ['open', 'question', 'client_review'])
  })
  it('the ball is with the client for question and client_review', () => {
    assert.deepEqual(customerDefaultSlugs(list), ['question', 'client_review'])
    assert.equal(isCustomerDefault(list, 'open'), false)
  })
})

describe('once chosen in settings', () => {
  const list = [
    s('open', { agentDefaultFilter: true, customerDefaultFilter: false }),
    s('question', { agentDefaultFilter: false, customerDefaultFilter: true }),
    s('revision', { agentDefaultFilter: true, customerDefaultFilter: true }),
    s('closed', { agentDefaultFilter: false, customerDefaultFilter: false }),
  ]
  it('only the switched-on statuses count', () => {
    assert.deepEqual(agentDefaultSlugs(list), ['open', 'revision'])
    assert.deepEqual(customerDefaultSlugs(list), ['question', 'revision'])
    assert.equal(isAgentDefault(list, 'question'), false)
  })
  it('reads the API (snake_case) shape too', () => {
    const api = [{ slug: 'a', is_active: true, agent_default_filter: true, customer_default_filter: false }, { slug: 'b', is_active: true, agent_default_filter: false, customer_default_filter: true }]
    assert.deepEqual(agentDefaultSlugs(api), ['a'])
    assert.deepEqual(customerDefaultSlugs(api), ['b'])
  })
  it('an inactive status is never a default', () => {
    assert.deepEqual(agentDefaultSlugs([...list, s('gone', { isActive: false, agentDefaultFilter: true })]), ['open', 'revision'])
  })
  it('choosing nothing for clients means nobody waits on them', () => {
    const none = [s('a', { customerDefaultFilter: false }), s('question', { customerDefaultFilter: false })]
    assert.deepEqual(customerDefaultSlugs(none), [])
  })
})
