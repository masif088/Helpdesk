import { exchangeCode, refreshTokens } from '@/lib/mcp-oauth'
import { oauthJson, preflight, readParams } from '@/lib/oauth-http'

export const dynamic = 'force-dynamic'

/** POST /api/oauth/token: the assistant swaps the sign-in code (with its PKCE verifier) or a refresh token for an access token. */
export async function POST(request: Request) {
  const p = await readParams(request)
  const result =
    p.grant_type === 'authorization_code'
      ? await exchangeCode({ code: p.code, clientId: p.client_id, redirectUri: p.redirect_uri, verifier: p.code_verifier })
      : p.grant_type === 'refresh_token'
        ? await refreshTokens({ refreshToken: p.refresh_token, clientId: p.client_id })
        : ({ error: 'unsupported_grant_type', error_description: 'Use authorization_code or refresh_token' } as const)
  return oauthJson(result, 'error' in result ? 400 : 200)
}

export const OPTIONS = preflight
