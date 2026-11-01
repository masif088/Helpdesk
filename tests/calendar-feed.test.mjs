// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { feedToken, feedTokenUserId, feedTokenValid } from '../lib/calendar-feed-token.ts'
import { buildIcs, icsEscape, icsFold } from '../lib/calendar-ics.ts'

const SECRET = 'a-long-test-secret'

describe('the feed link', () => {
  it('works for the user and nonce it was made for, with or without .ics', () => {
    const t = feedToken(SECRET, 'user-1', 'nonce-a')
    assert.equal(feedTokenUserId(t), 'user-1')
    assert.equal(feedTokenValid(SECRET, t, 'nonce-a'), true)
    assert.equal(feedTokenValid(SECRET, `${t}.ics`, 'nonce-a'), true)
  })

  it('stops working when the link is reset, or for anything else', () => {
    const t = feedToken(SECRET, 'user-1', 'nonce-a')
    assert.equal(feedTokenValid(SECRET, t, 'nonce-b'), false)
    assert.equal(feedTokenValid(SECRET, t, null), false)
    assert.equal(feedTokenValid('other', t, 'nonce-a'), false)
    const other = feedToken(SECRET, 'user-2', 'nonce-a')
    assert.equal(feedTokenValid(SECRET, `${t.split('.')[0]}.${other.split('.')[1]}`, 'nonce-a'), false)
    assert.equal(feedTokenValid(SECRET, 'nonsense', 'nonce-a'), false)
    assert.equal(feedTokenValid('', t, 'nonce-a'), false)
  })

  it('reads ids with unusual characters', () => {
    assert.equal(feedTokenUserId(feedToken(SECRET, 'uid/with+odd=chars', 'n')), 'uid/with+odd=chars')
    assert.equal(feedTokenUserId('!!!!.shortsig'), null)
  })
})

describe('writing iCalendar text', () => {
  it('escapes what the format reserves', () => {
    assert.equal(icsEscape('a,b;c\\d\nline2'), 'a\\,b\\;c\\\\d\\nline2')
  })

  it('folds long lines at 75 octets and never splits a character', () => {
    const folded = icsFold(`SUMMARY:${'x'.repeat(200)}`)
    const parts = folded.split('\r\n')
    assert.ok(parts.every((p) => Buffer.byteLength(p) <= 75))
    assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), `SUMMARY:${'x'.repeat(200)}`)
    const emoji = icsFold(`SUMMARY:${'é'.repeat(80)}`)
    assert.ok(emoji.split('\r\n').every((p) => Buffer.byteLength(p) <= 75))
    assert.equal(emoji.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join(''), `SUMMARY:${'é'.repeat(80)}`)
  })
})

const item = (over = {}) => ({
  id: 'evt1',
  source: 'event',
  type: 'meeting',
  title: 'Weekly sync, with Acme',
  description: 'Agenda:\n1. Status',
  start: '2026-11-03T09:00:00.000Z',
  end: '2026-11-03T10:00:00.000Z',
  all_day: false,
  color: '#3B82F6',
  location: 'Room 2',
  meeting_url: 'https://meet.example.com/abc',
  visibility: 'staff',
  owner_id: null,
  attendee_ids: [],
  company_id: null,
  ticket_id: null,
  repeat: 'none',
  occurrence: null,
  editable: true,
  responses: {},
  my_response: null,
  ...over,
})

describe('the calendar file', () => {
  const ics = buildIcs([item()], { name: 'Acme Help', now: new Date('2026-11-01T12:00:00Z'), host: 'help.example.com', baseUrl: 'https://help.example.com/' })

  it('is a calendar with CRLF lines', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'))
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
    assert.ok(!/[^\r]\n/.test(ics))
    assert.ok(ics.includes('X-WR-CALNAME:Acme Help'))
  })

  it('writes a timed event in UTC with the details', () => {
    assert.ok(ics.includes('DTSTART:20261103T090000Z'))
    assert.ok(ics.includes('DTEND:20261103T100000Z'))
    assert.ok(ics.includes('DTSTAMP:20261101T120000Z'))
    assert.ok(ics.includes('SUMMARY:Weekly sync\\, with Acme'))
    assert.ok(ics.includes('LOCATION:Room 2'))
    assert.ok(ics.includes('Join: https://meet.example.com/abc'.slice(0, 20)))
    assert.ok(ics.includes('UID:evt1-20261103T090000000Z@help.example.com'))
    assert.ok(ics.includes('TRANSP:OPAQUE'))
  })

  it('writes an all-day event as dates, the end day exclusive', () => {
    const f = buildIcs([item({ type: 'leave', all_day: true, start: '2026-12-28', end: '2026-12-31', title: 'Leave', location: null, meeting_url: null, description: null })], { name: 'x' })
    assert.ok(f.includes('DTSTART;VALUE=DATE:20261228'))
    assert.ok(f.includes('DTEND;VALUE=DATE:20270101'))
  })

  it('gives occurrences of a repeating event their own ids and marks holidays as free time', () => {
    const f = buildIcs([item({ repeat: 'weekly', start: '2026-11-03T09:00:00.000Z' }), item({ repeat: 'weekly', start: '2026-11-10T09:00:00.000Z', end: '2026-11-10T10:00:00.000Z' }), item({ id: 'h', type: 'holiday', all_day: true, start: '2026-11-11', end: '2026-11-11', title: 'Holiday' })], { name: 'x', host: 'h.test' })
    const uids = f.split('\r\n').filter((l) => l.startsWith('UID:'))
    assert.equal(new Set(uids).size, 3)
    assert.ok(f.includes('TRANSP:TRANSPARENT'))
  })

  it('links a ticket due date to the ticket', () => {
    const f = buildIcs([item({ id: 'ticket:12', source: 'ticket', type: 'ticket_due', all_day: true, start: '2026-11-20', end: '2026-11-20', ticket_id: 12, title: '#12 Printer', location: null, meeting_url: null, description: null })], { name: 'x', baseUrl: 'https://help.example.com' })
    assert.ok(f.includes('URL:https://help.example.com/tickets/12'))
  })

  it('is a valid empty calendar when there is nothing', () => {
    const f = buildIcs([], { name: 'x' })
    assert.ok(f.includes('BEGIN:VCALENDAR') && !f.includes('BEGIN:VEVENT'))
  })
})
