/**
 * An OpenAPI 3.1 description of the API, generated from the endpoint list in `lib/api-catalog.ts` (the same list the API builder,
 * the skill file and the MCP server use). Served at `/api/openapi.json`: import it into Postman, ChatGPT Actions, Swagger UI and
 * other tools. Pure: no database imports.
 */
import { API_ENDPOINTS, type ApiEndpoint, type ApiParam } from './api-catalog.ts'

type Schema = Record<string, unknown>

/** The JSON schema of one parameter. A list is comma separated in a query string and an array in a JSON body. */
export function paramSchema(p: ApiParam): Schema {
  const base: Schema = (() => {
    switch (p.type) {
      case 'number':
        return { type: 'integer' }
      case 'boolean':
        return p.where === 'query' ? { type: 'string', enum: ['1', '0'] } : { type: 'boolean' }
      case 'date':
        return { type: 'string', format: 'date' }
      case 'datetime':
        return { type: 'string', description: 'ISO date or date and time' }
      case 'list':
        return p.where === 'body' ? { type: 'array', items: { type: 'string' } } : { type: 'string', description: 'Comma separated' }
      case 'enum':
        return { type: 'string', enum: p.options ?? [] }
      default:
        return { type: 'string' }
    }
  })()
  if (p.type === 'list' && p.where === 'query' && p.options) base.description = `Comma separated; any of: ${p.options.join(', ')}`
  return base
}

const describe = (p: ApiParam) => `${p.description}${p.staffOnly ? ' (staff keys only)' : ''}`

export const operationId = (e: ApiEndpoint): string => e.id.replace(/\./g, '_')

function operation(e: ApiEndpoint) {
  const inUrl = e.params.filter((p) => p.where !== 'body')
  const body = e.params.filter((p) => p.where === 'body')
  const responses: Record<string, unknown> = {
    '200': { description: 'Done' },
    '400': { description: 'Something in the request is wrong; the `error` field says what' },
    '401': { description: 'Key missing, wrong, revoked, expired, or without the permission for this call' },
    '403': { description: 'Not available to keys, or the key\'s user may not do that' },
    '429': { description: 'Hourly limit of the key reached; see the Retry-After header' },
  }
  if (e.path.includes('{')) responses['404'] = { description: 'Not found, or not visible to the key\'s user' }
  if (e.method === 'POST' && e.path === '/api/tickets') responses['201'] = { description: 'Created' }
  return {
    operationId: operationId(e),
    tags: [e.group],
    summary: e.summary.split(/(?<=\.)\s/)[0],
    description: `${e.summary}\n\nNeeds the key permission \`${e.scope}\`.`,
    'x-key-scope': e.scope,
    ...(inUrl.length
      ? {
          parameters: inUrl.map((p) => ({
            name: p.name,
            in: p.where,
            required: p.where === 'path' ? true : !!p.required,
            description: describe(p),
            schema: paramSchema(p),
            ...(p.example ? { example: p.example } : {}),
          })),
        }
      : {}),
    ...(body.length
      ? {
          requestBody: {
            required: body.some((p) => p.required),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: Object.fromEntries(body.map((p) => [p.name, { ...paramSchema(p), description: describe(p), ...(p.example ? { example: p.example } : {}) }])),
                  ...(body.some((p) => p.required) ? { required: body.filter((p) => p.required).map((p) => p.name) } : {}),
                },
              },
            },
          },
        }
      : {}),
    responses,
  }
}

export function buildOpenApi(baseUrl: string, appName = 'Helpdesk') {
  const base = baseUrl.replace(/\/+$/, '')
  const paths: Record<string, Record<string, unknown>> = {}
  for (const e of API_ENDPOINTS) (paths[e.path] ??= {})[e.method.toLowerCase()] = operation(e)
  return {
    openapi: '3.1.0',
    info: {
      title: `${appName} API`,
      version: '1.0.0',
      description: `Tickets, calendar and team activity of ${appName}. Every call needs an API key (Settings → API keys, or Profile → API keys): send it as \`Authorization: Bearer tk_live_…\`. The key acts as one user and sees what that user sees. Instructions for an AI assistant: ${base}/api/skill`,
    },
    servers: [{ url: base }],
    security: [{ bearerAuth: [] }],
    tags: [...new Set(API_ENDPOINTS.map((e) => e.group))].map((name) => ({ name })),
    paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'An API key that starts with tk_live_' } } },
  }
}
