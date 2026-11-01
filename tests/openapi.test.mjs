// Pure logic: node --test "tests/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { API_ENDPOINTS } from '../lib/api-catalog.ts'
import { buildOpenApi, operationId, paramSchema } from '../lib/openapi.ts'

const doc = buildOpenApi('https://help.example.com/', 'Acme Help')

describe('the OpenAPI file', () => {
  it('names the version, the server and the key scheme', () => {
    assert.equal(doc.openapi, '3.1.0')
    assert.equal(doc.info.title, 'Acme Help API')
    assert.deepEqual(doc.servers, [{ url: 'https://help.example.com' }])
    assert.equal(doc.components.securitySchemes.bearerAuth.scheme, 'bearer')
    assert.deepEqual(doc.security, [{ bearerAuth: [] }])
  })

  it('has one operation for every endpoint, with a unique id', () => {
    const ids = new Set()
    for (const e of API_ENDPOINTS) {
      const op = doc.paths[e.path]?.[e.method.toLowerCase()]
      assert.ok(op, `${e.method} ${e.path}`)
      assert.equal(op.operationId, operationId(e))
      assert.equal(op['x-key-scope'], e.scope)
      ids.add(op.operationId)
    }
    assert.equal(ids.size, API_ENDPOINTS.length)
  })

  it('puts path ids in the path and filters in the query', () => {
    const detail = doc.paths['/api/tickets/{id}/detail'].get
    assert.deepEqual(detail.parameters.map((p) => [p.name, p.in, p.required]), [['id', 'path', true]])
    const list = doc.paths['/api/tickets'].get
    const assignee = list.parameters.find((p) => p.name === 'assignee_ids')
    assert.equal(assignee.in, 'query')
    assert.equal(assignee.required, false)
    assert.ok(list.parameters.some((p) => p.name === 'skills'))
  })

  it('describes JSON bodies with their required fields', () => {
    const create = doc.paths['/api/calendar/events'].post.requestBody
    assert.equal(create.required, true)
    const schema = create.content['application/json'].schema
    assert.deepEqual(schema.required, ['type', 'title', 'start'])
    assert.deepEqual(schema.properties.type.enum.slice(0, 3), ['meeting', 'leave', 'holiday'])
    assert.equal(schema.properties.attendee_ids.type, 'array')
    assert.equal(schema.properties.all_day.type, 'boolean')
    assert.equal(doc.paths['/api/calendar/events/{id}'].patch.requestBody.required, false)
  })

  it('has no body on reads and a 404 where there is an id', () => {
    assert.equal(doc.paths['/api/tickets'].get.requestBody, undefined)
    assert.ok(doc.paths['/api/calendar/events/{id}'].get.responses['404'])
    assert.equal(doc.paths['/api/tickets/lookup'].get.responses['404'], undefined)
  })

  it('turns types into schemas', () => {
    assert.deepEqual(paramSchema({ name: 'a', where: 'query', type: 'boolean', description: '' }), { type: 'string', enum: ['1', '0'] })
    assert.deepEqual(paramSchema({ name: 'a', where: 'body', type: 'boolean', description: '' }), { type: 'boolean' })
    assert.deepEqual(paramSchema({ name: 'a', where: 'query', type: 'date', description: '' }), { type: 'string', format: 'date' })
    assert.equal(paramSchema({ name: 'a', where: 'query', type: 'number', description: '' }).type, 'integer')
    assert.deepEqual(paramSchema({ name: 'a', where: 'query', type: 'enum', options: ['x', 'y'], description: '' }).enum, ['x', 'y'])
  })

  it('is plain JSON', () => {
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(doc)))
  })
})
