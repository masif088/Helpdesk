// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { csatToken, csatTokenTicketId, csatTokenValid } from '../lib/csat-token.ts'

const SECRET = 'a-long-test-secret'

describe('public rating links', () => {
  it('accepts the link made for the ticket and its requester', () => {
    const t = csatToken(SECRET, 42, 'user-1')
    assert.equal(csatTokenTicketId(t), 42)
    assert.equal(csatTokenValid(SECRET, t, 'user-1'), true)
  })

  it('rejects another requester, another secret and another ticket', () => {
    const t = csatToken(SECRET, 42, 'user-1')
    assert.equal(csatTokenValid(SECRET, t, 'user-2'), false)
    assert.equal(csatTokenValid('other-secret', t, 'user-1'), false)
    assert.equal(csatTokenValid(SECRET, t.replace(/^42\./, '43.'), 'user-1'), false)
  })

  it('rejects junk and links made without a secret', () => {
    assert.equal(csatTokenTicketId('nonsense'), null)
    assert.equal(csatTokenTicketId('42.short'), null)
    assert.equal(csatTokenValid(SECRET, '42.', 'user-1'), false)
    assert.equal(csatTokenValid('', csatToken('', 1, 'u'), 'u'), false)
  })
})
