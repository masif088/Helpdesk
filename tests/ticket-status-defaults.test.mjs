// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { agentDefaultSlugs, ballWithClientSlugs, customerDefaultSlugs, isAgentDefault, isBallWithClient } from '../lib/ticket-status-defaults.ts'

const s = (slug, over = {}) => ({ slug, isActive: true, showInKanban: true, ...over })

describe('before anything is chosen (old behaviour)', () => {
  const list = [s('open'), s('question'), s('client_review'), s('pending', { showInKanban: false }), s('old', { isActive: false })]
  it('agents start on the Kanban statuses', () => {
    assert.deepEqual(agentDefaultSlugs(list), ['open', 'question', 'client_review'])
  })
  it('the ball is with the client for question and client_review', () => {
    assert.deepEqual(ballWithClientSlugs(list), ['question', 'client_review'])
    assert.equal(isBallWithClient(list, 'open'), false)
  })
  it('clients start on every status that is not finished', () => {
    assert.deepEqual(customerDefaultSlugs([...list, s('closed'), s('resolved')]), ['open', 'question', 'client_review'])
  })
})

describe('once chosen in settings', () => {
  const list = [
    s('open', { agentDefaultFilter: true, customerDefaultFilter: true, ballWithClient: false }),
    s('question', { agentDefaultFilter: false, customerDefaultFilter: true, ballWithClient: true }),
    s('revision', { agentDefaultFilter: true, customerDefaultFilter: false, ballWithClient: true }),
    s('closed', { agentDefaultFilter: false, customerDefaultFilter: false, ballWithClient: false }),
  ]
  it('only the switched-on statuses count', () => {
    assert.deepEqual(agentDefaultSlugs(list), ['open', 'revision'])
    assert.deepEqual(customerDefaultSlugs(list), ['open', 'question'])
    assert.deepEqual(ballWithClientSlugs(list), ['question', 'revision'])
    assert.equal(isAgentDefault(list, 'question'), false)
  })
  it('reads the API (snake_case) shape too', () => {
    const api = [{ slug: 'a', is_active: true, agent_default_filter: true, customer_default_filter: false, ball_with_client: false }, { slug: 'b', is_active: true, agent_default_filter: false, customer_default_filter: true, ball_with_client: true }]
    assert.deepEqual(agentDefaultSlugs(api), ['a'])
    assert.deepEqual(customerDefaultSlugs(api), ['b'])
    assert.deepEqual(ballWithClientSlugs(api), ['b'])
  })
  it('an inactive status is never a default', () => {
    assert.deepEqual(agentDefaultSlugs([...list, s('gone', { isActive: false, agentDefaultFilter: true })]), ['open', 'revision'])
  })
  it('a client can always see a ticket that is not waiting on them, and the other way round', () => {
    const l = [s('working', { customerDefaultFilter: true, ballWithClient: false }), s('question', { customerDefaultFilter: false, ballWithClient: true })]
    assert.deepEqual(customerDefaultSlugs(l), ['working'])
    assert.deepEqual(ballWithClientSlugs(l), ['question'])
  })
  it('choosing nothing for the ball means nobody waits on the client', () => {
    const none = [s('a', { ballWithClient: false }), s('question', { ballWithClient: false })]
    assert.deepEqual(ballWithClientSlugs(none), [])
  })
})
