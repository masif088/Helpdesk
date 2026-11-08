/**
 * Sign-in for AI connectors on the server: the one-time codes and refresh tokens (`oauth_grants`, stored only as hashes) and the
 * access token, which is an ordinary API key (kind `oauth`) so scopes, the hourly limit, usage and revoking all work as for any key.
 * Revoke the connection in the API keys list and the refresh token stops working too. Rules and helpers: `lib/mcp-oauth-core.ts`.
 */
import { normalizeScopes } from '@/lib/api-key-core'
import { createApiKey, rotateApiKeyToken } from '@/lib/api-keys'
import { apiKeys, get, insert, oauthGrants, remove } from '@/lib/fsdb'
import { linkSecret } from '@/lib/link-secret'
import {
  ACCESS_TOKEN_SECONDS,
  CODE_SECONDS,
  type OauthClient,
  pkceMatches,
  randomToken,
  readClientId,
  REFRESH_TOKEN_DAYS,
  sha256Hex,
} from '@/lib/mcp-oauth-core'

export type TokenResult = { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }
export type TokenFailure = { error: 'invalid_grant' | 'invalid_client' | 'invalid_request' | 'unsupported_grant_type'; error_description: string }

export const clientFromId = (clientId: unknown): OauthClient | null => readClientId(linkSecret(), clientId)

/** A one-time code the assistant swaps for tokens (within minutes). `scopes` is what the person approved. */
export async function issueCode(p: { userId: string; clientId: string; clientName: string; redirectUri: string; codeChallenge: string; scopes: string[] }): Promise<string> {
  const code = randomToken('mc_')
  await insert(oauthGrants, {
    id: sha256Hex(code),
    kind: 'code',
    userId: p.userId,
    clientId: p.clientId,
    clientName: p.clientName,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    scopes: normalizeScopes(p.scopes),
    expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
  })
  return code
}

const fail = (error: TokenFailure['error'], error_description: string): TokenFailure => ({ error, error_description })

async function newRefresh(p: { userId: string; clientId: string; clientName: string; redirectUri: string; scopes: string[]; keyId: string }): Promise<string> {
  const refresh = randomToken('mr_')
  await insert(oauthGrants, {
    id: sha256Hex(refresh),
    kind: 'refresh',
    userId: p.userId,
    clientId: p.clientId,
    clientName: p.clientName,
    redirectUri: p.redirectUri,
    codeChallenge: '',
    scopes: p.scopes,
    keyId: p.keyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000),
  })
  return refresh
}

/** Code (with the PKCE verifier) for an access token and a refresh token. A code works once. */
export async function exchangeCode(p: { code: unknown; clientId: unknown; redirectUri: unknown; verifier: unknown }): Promise<TokenResult | TokenFailure> {
  if (typeof p.code !== 'string' || typeof p.clientId !== 'string') return fail('invalid_request', 'code and client_id are required')
  if (!clientFromId(p.clientId)) return fail('invalid_client', 'Unknown client')
  const grant = await remove(oauthGrants, sha256Hex(p.code)) // taking it out is what makes it single use
  if (!grant || grant.kind !== 'code' || grant.expiresAt.getTime() < Date.now()) return fail('invalid_grant', 'The code is unknown, used or expired')
  if (grant.clientId !== p.clientId || grant.redirectUri !== p.redirectUri) return fail('invalid_grant', 'The code was made for another client or redirect address')
  if (!pkceMatches(p.verifier, grant.codeChallenge)) return fail('invalid_grant', 'code_verifier does not match')

  const { key, info } = await createApiKey({
    name: `Connector · ${grant.clientName}`,
    userId: grant.userId,
    scopes: grant.scopes,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000),
    createdBy: grant.userId,
    kind: 'oauth',
  })
  const refresh = await newRefresh({ userId: grant.userId, clientId: grant.clientId, clientName: grant.clientName, redirectUri: grant.redirectUri, scopes: info.scopes, keyId: info.id })
  return { access_token: key, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope: info.scopes.join(' ') }
}

/** A refresh token for a new access token (and a new refresh token: each works once). Fails when the connection was revoked. */
export async function refreshTokens(p: { refreshToken: unknown; clientId: unknown }): Promise<TokenResult | TokenFailure> {
  if (typeof p.refreshToken !== 'string' || typeof p.clientId !== 'string') return fail('invalid_request', 'refresh_token and client_id are required')
  if (!clientFromId(p.clientId)) return fail('invalid_client', 'Unknown client')
  const grant = await remove(oauthGrants, sha256Hex(p.refreshToken))
  if (!grant || grant.kind !== 'refresh' || !grant.keyId || grant.expiresAt.getTime() < Date.now() || grant.clientId !== p.clientId) {
    return fail('invalid_grant', 'The refresh token is unknown, used or expired')
  }
  const key = await get(apiKeys, grant.keyId)
  if (!key || key.revokedAt) return fail('invalid_grant', 'This connection was revoked')
  const rotated = await rotateApiKeyToken(grant.keyId, new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000))
  if (!rotated) return fail('invalid_grant', 'This connection was revoked')
  const refresh = await newRefresh({ userId: grant.userId, clientId: grant.clientId, clientName: grant.clientName, redirectUri: grant.redirectUri, scopes: grant.scopes, keyId: grant.keyId })
  return { access_token: rotated.key, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope: grant.scopes.join(' ') }
}
