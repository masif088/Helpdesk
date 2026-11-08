/** Shared bits of the connector sign-in routes: JSON answers that are never cached, and open CORS (these routes hold no cookies and take no ambient credentials). */
import { NextResponse } from 'next/server'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
}

export function oauthJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...CORS_HEADERS, ...headers } })
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS })

/** The body of a token or registration call: form-encoded (the standard) or JSON. */
export async function readParams(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const j = (await request.json()) as unknown
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {}
    }
    return Object.fromEntries(new URLSearchParams(await request.text()))
  } catch {
    return {}
  }
}
