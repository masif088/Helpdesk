// Pure logic: node --test tests/
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cannedProblem, cleanShortcut, fillCanned, htmlToText, mayEdit, rankCanned, textToHtml, visibleTo } from '../lib/canned-responses.ts'

const vars = { customer_name: 'Rina <b>', ticket_number: '1234', ticket_title: 'Login problem', agent_name: 'Budi', company: 'Acme & Co' }

describe('filling in a canned response', () => {
  it('replaces the known placeholders, tolerating spaces and capitals', () => {
    assert.equal(fillCanned('<p>Hi {{customer_name}}, ticket #{{ ticket_number }} — {{AGENT_NAME}}</p>', vars), '<p>Hi Rina &lt;b&gt;, ticket #1234 — Budi</p>')
  })
  it('escapes what is filled in, so a name cannot inject markup', () => {
    assert.equal(fillCanned('{{company}}', vars), 'Acme &amp; Co')
    assert.ok(!fillCanned('{{customer_name}}', vars).includes('<b>'))
  })
  it('leaves placeholders it does not know', () => {
    assert.equal(fillCanned('Hello {{nobody}} {{company}}', vars), 'Hello {{nobody}} Acme &amp; Co')
  })
  it('fills an empty value as nothing', () => {
    assert.equal(fillCanned('[{{company}}]', { ...vars, company: '' }), '[]')
  })
})

describe('plain text and HTML', () => {
  it('turns typed text into paragraphs and line breaks', () => {
    assert.equal(textToHtml('Hi,\nthere\n\nBye <you>'), '<p>Hi,<br>there</p><p>Bye &lt;you&gt;</p>')
    assert.equal(textToHtml('   '), '')
  })
  it('and back again', () => {
    assert.equal(htmlToText('<p>Hi,<br>there</p><p>Bye &lt;you&gt; &amp; me</p>'), 'Hi,\nthere\n\nBye <you> & me')
    assert.equal(htmlToText(textToHtml('A & B\n\nC')), 'A & B\n\nC')
  })
})

describe('who sees and edits what', () => {
  const shared = { scope: 'shared', ownerId: 'a' }
  const mine = { scope: 'personal', ownerId: 'a' }
  it('shared replies are for everyone, personal ones for their owner', () => {
    assert.equal(visibleTo(shared, 'z'), true)
    assert.equal(visibleTo(mine, 'a'), true)
    assert.equal(visibleTo(mine, 'z'), false)
  })
  it('a shared reply is edited by managers, a personal one by its owner only', () => {
    assert.equal(mayEdit(shared, 'a', false), false) // even the author, unless a manager
    assert.equal(mayEdit(shared, 'z', true), true)
    assert.equal(mayEdit(mine, 'a', false), true)
    assert.equal(mayEdit(mine, 'z', true), false)
  })
})

describe('the list', () => {
  const rows = [
    { title: 'Refund', shortcut: 'refund', content: '<p>We refund within 7 days</p>', usageCount: 2 },
    { title: 'Greeting', shortcut: null, content: '<p>Hello!</p>', usageCount: 9 },
    { title: 'Closing', shortcut: 'bye', content: '<p>Thanks for your patience</p>', usageCount: 2 },
  ]
  it('puts the most used first, then by title', () => {
    assert.deepEqual(rankCanned(rows).map((r) => r.title), ['Greeting', 'Closing', 'Refund'])
  })
  it('searches title, shortcut and text', () => {
    assert.deepEqual(rankCanned(rows, 'patience').map((r) => r.title), ['Closing'])
    assert.deepEqual(rankCanned(rows, 'BYE').map((r) => r.title), ['Closing'])
    assert.deepEqual(rankCanned(rows, 'greet').map((r) => r.title), ['Greeting'])
    assert.deepEqual(rankCanned(rows, 'zzz'), [])
  })
  it('cleans a shortcut', () => {
    assert.equal(cleanShortcut('/Refund Policy!'), 'refund-policy')
    assert.equal(cleanShortcut('  '), '')
    assert.equal(cleanShortcut(null), '')
    assert.equal(cleanShortcut('x'.repeat(50)).length, 30)
  })
})

describe('validation', () => {
  it('needs a title and some text', () => {
    assert.equal(cannedProblem({ title: ' ', content: '<p>x</p>' }), 'Title is required')
    assert.equal(cannedProblem({ title: 'A', content: '<p> </p>' }), 'Write the reply text')
    assert.equal(cannedProblem({ title: 'A' }), 'Write the reply text')
    assert.equal(cannedProblem({ title: 'A', content: '<p>Hi</p>' }), null)
  })
  it('refuses very long input', () => {
    assert.match(cannedProblem({ title: 'x'.repeat(121), content: '<p>x</p>' }), /too long/)
    assert.match(cannedProblem({ title: 'A', content: `<p>${'x'.repeat(8001)}</p>` }), /too long/)
  })
})
