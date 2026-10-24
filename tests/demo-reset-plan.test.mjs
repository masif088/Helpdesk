// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AUTO_OPEN_RULE, companiesToKeep, DEMO_RESET_PHRASE, isDemoResetPhrase, keepsAccount, mayDemoReset, splitUsers, WIPE_TABLES } from '../lib/demo-reset-plan.ts'

describe('who may reset', () => {
  it('only the operator, whatever the capitals or spaces', () => {
    assert.equal(mayDemoReset('mokhamadasif@gmail.com'), true)
    assert.equal(mayDemoReset('  MokhamadAsif@Gmail.com '), true)
    assert.equal(mayDemoReset('masiftesting@gmail.com'), false)
    assert.equal(mayDemoReset('admin@example.com'), false)
    assert.equal(mayDemoReset(null), false)
    assert.equal(mayDemoReset(''), false)
  })
  it('needs the exact phrase', () => {
    assert.equal(isDemoResetPhrase(DEMO_RESET_PHRASE), true)
    assert.equal(isDemoResetPhrase(` ${DEMO_RESET_PHRASE} `), true)
    assert.equal(isDemoResetPhrase('reset demo'), false)
    assert.equal(isDemoResetPhrase('RESET'), false)
    assert.equal(isDemoResetPhrase(undefined), false)
    assert.equal(isDemoResetPhrase(true), false)
  })
})

describe('which accounts stay', () => {
  const users = [
    { id: 'a', email: 'mokhamadasif@gmail.com', companyId: null },
    { id: 'b', email: 'masiftesting@gmail.com', companyId: 'c1' },
    { id: 'c', email: 'someone@acme.test', companyId: 'c2' },
    { id: 'd', email: null, companyId: null },
  ]
  it('keeps the operator and the test customer, removes the rest', () => {
    const { keep, remove } = splitUsers(users)
    assert.deepEqual(keep.map((u) => u.id), ['a', 'b'])
    assert.deepEqual(remove.map((u) => u.id), ['c', 'd'])
    assert.equal(keepsAccount('MASIFTESTING@gmail.com'), true)
  })
  it('keeps the companies of the kept accounts, also through company_users', () => {
    const { keep } = splitUsers(users)
    const kept = companiesToKeep(keep, [{ companyId: 'c3', userId: 'b' }, { companyId: 'c4', userId: 'c' }], new Set(keep.map((u) => u.id)))
    assert.deepEqual([...kept].sort(), ['c1', 'c3'])
  })
})

describe('what is wiped', () => {
  it('empties tickets, mail connections and automation, and leaves configuration alone', () => {
    for (const t of ['tickets', 'ticketComments', 'emailIntegrations', 'automationRules', 'invoices', 'slaDaily']) assert.ok(WIPE_TABLES.includes(t), t)
    for (const t of ['users', 'ticketStatuses', 'ticketTypes', 'messageTemplates', 'cannedResponses', 'appSettings', 'knowledgeBaseArticles', 'teams', 'tags']) assert.ok(!WIPE_TABLES.includes(t), t)
  })
  it('the one automation left opens every new ticket', () => {
    assert.equal(AUTO_OPEN_RULE.eventType, 'ticket_created')
    assert.equal(AUTO_OPEN_RULE.actions.status_slug, 'open')
    assert.deepEqual(AUTO_OPEN_RULE.conditions.conditions, [])
  })
})

describe('rollback point', () => {
  it('has its own phrases, different from the reset', async () => {
    const m = await import('../lib/demo-reset-plan.ts')
    assert.equal(m.isBaselineSavePhrase('SAVE ROLLBACK'), true)
    assert.equal(m.isBaselineRestorePhrase('RESTORE ROLLBACK'), true)
    assert.equal(m.isBaselineRestorePhrase('SAVE ROLLBACK'), false)
    assert.equal(m.isBaselineSavePhrase('RESET DEMO'), false)
  })
  it('copies data collections but not live-update leftovers or itself', async () => {
    const m = await import('../lib/demo-reset-plan.ts')
    for (const c of ['tickets', 'users', 'app_settings', '_counters', 'ticket_statuses']) assert.equal(m.inBaseline(c), true, c)
    for (const c of ['ticket_presence', 'ticket_data_sync', '_baseline_data', '_baseline_meta']) assert.equal(m.inBaseline(c), false, c)
  })
  it('makes safe document ids', async () => {
    const m = await import('../lib/demo-reset-plan.ts')
    assert.equal(m.baselineDocId('tickets', '12'), 'tickets~12')
    assert.ok(!m.baselineDocId('x', 'a/b').includes('/'))
  })
  it('restoring removes unknown accounts, adds missing ones and never the operator', async () => {
    const m = await import('../lib/demo-reset-plan.ts')
    const current = [{ uid: 'a', email: 'mokhamadasif@gmail.com' }, { uid: 'b', email: 'x@y.test' }, { uid: 'c', email: 'masiftesting@gmail.com' }]
    const d = m.authDiff(current, new Set(['c', 'd']), 'mokhamadasif@gmail.com')
    assert.deepEqual(d.remove, ['b'])
    assert.deepEqual(d.missing, ['d'])
  })
})
