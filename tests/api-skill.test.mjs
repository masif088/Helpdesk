// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { API_ENDPOINTS } from '../lib/api-catalog.ts'
import { buildApiSkill } from '../lib/api-skill.ts'

describe('the skill file', () => {
  const skill = buildApiSkill('https://help.example.com/', 250)

  it('starts with front matter an assistant can load', () => {
    assert.ok(skill.startsWith('---\nname: ticketing-api\ndescription: '))
    assert.ok(skill.includes('\n---\n\n# Ticketing portal API'))
  })

  it('uses the base URL without a trailing slash and the configured call limit', () => {
    assert.ok(skill.includes('Base URL: `https://help.example.com`'))
    assert.ok(!skill.includes('https://help.example.com//'))
    assert.ok(skill.includes('limited to 250 calls per hour'))
    assert.ok(skill.includes('https://help.example.com/api/skill'))
  })

  it('never holds a key, only the name of the variable', () => {
    assert.ok(!/tk_live_[A-Za-z0-9]/.test(skill))
    assert.ok(skill.includes('$TICKETING_API_KEY'))
  })

  it('documents every endpoint of the catalog', () => {
    for (const e of API_ENDPOINTS) assert.ok(skill.includes(`#### \`${e.method} ${e.path}\``), `${e.method} ${e.path}`)
  })

  it('explains the ticket filters and the calendar', () => {
    for (const w of ['assignee_ids', 'customer_ids', 'skills_match', 'company_ids', 'date_from', 'type_ids', 'compact=1', 'all_day', 'repeat_until', 'ticket_due']) assert.ok(skill.includes(w), w)
  })
})
