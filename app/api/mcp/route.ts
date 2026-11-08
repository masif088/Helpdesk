import { API_ENDPOINTS } from '@/lib/api-catalog'
import { API_KEY_PREFIX } from '@/lib/api-key-core'
import { verifyApiKey } from '@/lib/api-keys'
import { bearerToken, wwwAuthenticate } from '@/lib/mcp-oauth-core'
import { createMcpHandler, type McpMessage } from '@/lib/mcp-server'
import { CORS_HEADERS, oauthJson, preflight } from '@/lib/oauth-http'
import { siteOrigin } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mcp: the portal as a remote MCP server (streamable HTTP, JSON answers). An AI assistant adds this address as a connector,
 * the person signs in and approves (see `lib/mcp-oauth.ts`), and the assistant gets the tools its approval allows. Each tool call is
 * made to the portal's own API with the connection's token, so the person's role, the approved permissions and the hourly limit all apply.
 */
export async function POST(request: Request) {
  const origin = siteOrigin(request)
  const token = bearerToken(request.headers.get('authorization'))
  const key = token?.startsWith(API_KEY_PREFIX) ? await verifyApiKey(token) : null
  if (!token || !key) {
    return oauthJson({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in to use this server' } }, 401, { 'WWW-Authenticate': wwwAuthenticate(origin) })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return oauthJson({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
  }

  const handle = createMcpHandler({
    baseUrl: origin,
    apiKey: token,
    // Only the tools the approved permissions allow
    endpoints: API_ENDPOINTS.filter((e) => key.scopes.includes(e.scope)),
    fetchImpl: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
  })
  const run = async (m: McpMessage) => {
    try {
      return await handle(m)
    } catch (err) {
      return { jsonrpc: '2.0' as const, id: m?.id ?? null, error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' } }
    }
  }

  const replies = Array.isArray(body) ? (await Promise.all(body.map(run))).filter((r) => r !== null) : [await run(body as McpMessage)].filter((r) => r !== null)
  if (!replies.length) return new Response(null, { status: 202, headers: CORS_HEADERS }) // only notifications: nothing to answer
  return oauthJson(Array.isArray(body) ? replies : replies[0])
}

/** There is no server-to-client stream and no session to close. */
const notAllowed = () => new Response('Use POST', { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' } })
export const GET = notAllowed
export const DELETE = notAllowed
export const OPTIONS = preflight
