/**
 * Sign-in for AI connectors (the remote MCP server at `/api/mcp`): the person signs in to the portal and approves, so nobody has to paste an
 * API key into an assistant. This is OAuth 2.1 with PKCE and dynamic client registration, the way MCP clients (Claude, ChatGPT, Cursor) expect.
 * Pure helpers with no I/O, so they are tested; the storage and the routes are in `lib/mcp-oauth.ts` and `app/api/oauth/*`.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const ACCESS_TOKEN_SECONDS = 3600
export const REFRESH_TOKEN_DAYS = 60
export const CODE_SECONDS = 300
export const MAX_REDIRECT_URIS = 5

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8')
const sign = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('base64url')

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(prefix = ''): string {
  return prefix + randomBytes(32).toString('base64url')
}

/** Redirect targets an assistant may use: https, a loopback address (desktop apps) or an app's own scheme. Never script or file schemes, never a fragment. */
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length > 500 || /[\s<>"]/.test(uri)) return false
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.hash) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  return !['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:', 'ws:', 'wss:', 'ftp:'].includes(u.protocol) && uri.includes('://')
}

export type OauthClient = { redirectUris: string[]; name: string }

/**
 * The client id carries the client itself (its redirect addresses and name) with a signature, so registering needs no storage and an id
 * nobody registered through us cannot be made up.
 */
export function makeClientId(secret: string, client: OauthClient): string {
  const body = b64(JSON.stringify({ u: client.redirectUris, n: client.name }))
  return `${body}.${sign(secret, body)}`
}

export function readClientId(secret: string, clientId: unknown): OauthClient | null {
  if (typeof clientId !== 'string' || !secret) return null
  const [body, sig, extra] = clientId.split('.')
  if (!body || !sig || extra !== undefined) return null
  const want = Buffer.from(sign(secret, body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const j = JSON.parse(unb64(body)) as { u?: unknown; n?: unknown }
    if (!Array.isArray(j.u) || !j.u.length || !j.u.every(validRedirectUri)) return null
    return { redirectUris: j.u as string[], name: typeof j.n === 'string' ? j.n : 'AI assistant' }
  } catch {
    return null
  }
}

/** The name shown to people: letters, digits and a few marks, short. */
export function cleanClientName(value: unknown): string {
  const s = typeof value === 'string' ? value.replace(/[^\p{L}\p{N} ._()\-+@]/gu, '').trim().slice(0, 60) : ''
  return s || 'AI assistant'
}

/** PKCE, the S256 method only: the verifier the client sends at the end must hash to the challenge it sent at the start. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  const want = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const got = Buffer.from(challenge)
  return want.length === got.length && timingSafeEqual(want, got)
}

export function validChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9\-_]{43}$/.test(value)
}

/** Adds `code` or `error` (and the state the client sent) to the client's redirect address. */
export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v)
  return u.toString()
}

/** `WWW-Authenticate` for a call without a usable token: points the assistant at where to learn how to sign in. */
export function wwwAuthenticate(origin: string): string {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`
}

/** The token out of `Authorization: Bearer <token>`. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')
  return m ? m[1] : null
}

export function protectedResourceMetadata(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ['header'], resource_name: 'Ticketing portal' }
}

export function authorizationServerMetadata(origin: string, scopes: readonly string[]) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...scopes],
  }
}

/** A scope string sent by the client ("a:b c:d") as a list; unknown names are dropped by the caller. */
export function splitScope(value: unknown): string[] {
  return typeof value === 'string' ? [...new Set(value.split(/[\s,]+/).filter(Boolean))] : []
}
