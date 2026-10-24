// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { autoReplyBlock, injectHeaders, isAutoSubmitted, outgoingHeaderLines } from '../lib/email-autoreply.ts'

const headers = (h = {}) => (name) => Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? ''
const automated = (email) => /^(no-?reply|mailer-daemon|postmaster)@/.test(email.toLowerCase())
const block = (h, sender = 'rina@acme.test', own = 'support@us.test') => autoReplyBlock(headers(h), sender, { ownAddress: own, isAutomatedAddress: automated })

describe('when an automatic reply must not be sent', () => {
  it('replies to an ordinary email from a person', () => {
    assert.equal(block({ Subject: 'Help' }), null)
    assert.equal(block({ 'Auto-Submitted': 'no' }), null)
    assert.equal(block({ Precedence: 'normal' }), null)
  })
  it('never answers mail from another ticket portal (the ping-pong case)', () => {
    assert.match(block({ 'X-Portal-Mail': 'helpdesk.other.test' }), /portal/)
  })
  it('never answers auto-generated mail', () => {
    assert.match(block({ 'Auto-Submitted': 'auto-generated' }), /Auto-Submitted/)
    assert.match(block({ 'Auto-Submitted': 'auto-replied' }), /Auto-Submitted/)
    assert.match(block({ 'X-Auto-Response-Suppress': 'All' }), /Suppress/)
  })
  it('never answers bulk, list or bounce mail', () => {
    assert.match(block({ Precedence: 'bulk' }), /Precedence/)
    assert.match(block({ Precedence: 'auto_reply' }), /Precedence/)
    assert.match(block({ 'List-Unsubscribe': '<mailto:x@y.test>' }), /mailing list/)
    assert.match(block({ 'List-Id': 'news.acme.test' }), /mailing list/)
    assert.match(block({ 'Return-Path': '<>' }), /bounce/)
    assert.match(block({ 'X-Failed-Recipients': 'a@b.test' }), /delivery report/)
    assert.match(block({ 'Content-Type': 'multipart/report; report-type=delivery-status; boundary=x' }), /delivery report/)
  })
  it('never answers a no-reply sender, or our own address', () => {
    assert.match(block({}, 'noreply@acme.test'), /no-reply/)
    assert.match(block({}, 'no-reply@acme.test'), /no-reply/)
    assert.match(block({}, 'mailer-daemon@acme.test'), /no-reply/)
    assert.match(block({}, 'SUPPORT@us.test'), /own address/)
  })
  it('does not answer a person whose replies would go to a no-reply address', () => {
    assert.match(block({ 'Reply-To': 'Acme <noreply@acme.test>' }), /no-reply/)
    assert.equal(block({ 'Reply-To': 'Rina <rina2@acme.test>' }), null)
  })
})

describe('auto-submitted mail goes to Notifications', () => {
  it('spots out-of-office and bulk mail, not normal mail', () => {
    assert.equal(isAutoSubmitted(headers({ 'Auto-Submitted': 'auto-replied' })), true)
    assert.equal(isAutoSubmitted(headers({ Precedence: 'bulk' })), true)
    assert.equal(isAutoSubmitted(headers({ 'X-Autoreply': 'yes' })), true)
    assert.equal(isAutoSubmitted(headers({ 'Auto-Submitted': 'no' })), false)
    assert.equal(isAutoSubmitted(headers({})), false)
  })
})

describe('marking what we send', () => {
  it('marks a system email as auto-generated, and a human reply only as from the portal', () => {
    assert.deepEqual(outgoingHeaderLines({ human: false, site: 'help.us.test' }), ['X-Portal-Mail: help.us.test', 'Auto-Submitted: auto-generated', 'X-Auto-Response-Suppress: All'])
    assert.deepEqual(outgoingHeaderLines({ human: true, site: 'help.us.test' }), ['X-Portal-Mail: help.us.test'])
  })
  it('puts the lines on top of the message, before its own headers', () => {
    const raw = ['From: a@us.test', 'To: b@x.test', 'Subject: Hi', '', 'Body', ''].join('\r\n')
    const out = injectHeaders(raw, outgoingHeaderLines({ human: false, site: 's' }))
    assert.ok(out.startsWith('X-Portal-Mail: s\r\nAuto-Submitted: auto-generated\r\nX-Auto-Response-Suppress: All\r\nFrom: a@us.test'))
    assert.ok(out.endsWith('\r\n\r\nBody\r\n'))
  })
  it('does not duplicate a header the message already has, and ignores body text that looks like one', () => {
    const raw = ['From: a@us.test', 'Auto-Submitted: auto-generated', 'Subject: Hi', '', 'X-Portal-Mail: in the body', ''].join('\r\n')
    const out = injectHeaders(raw, outgoingHeaderLines({ human: false, site: 's' }))
    assert.equal(out.match(/Auto-Submitted/g).length, 1)
    assert.equal(out.split('\r\n\r\n')[0].includes('X-Portal-Mail: s'), true)
  })
  it('the marked mail is recognised by the receiving side', () => {
    const lines = outgoingHeaderLines({ human: false, site: 's' })
    const h = Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
    assert.ok(block(h))
    const human = Object.fromEntries(outgoingHeaderLines({ human: true, site: 's' }).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]))
    assert.match(block(human), /portal/) // another portal's human reply is not answered either
  })
})
