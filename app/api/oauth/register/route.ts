import { linkSecret } from '@/lib/link-secret'
import { cleanClientName, makeClientId, MAX_REDIRECT_URIS, validRedirectUri } from '@/lib/mcp-oauth-core'
import { oauthJson, preflight, readParams } from '@/lib/oauth-http'

export const dynamic = 'force-dynamic'

/** POST /api/oauth/register (dynamic client registration): an AI assistant says who it is and where it wants the person sent back. */
export async function POST(request: Request) {
  if (!linkSecret()) return oauthJson({ error: 'server_error', error_description: 'The portal has no signing secret (set CSAT_LINK_SECRET)' }, 500)
  const body = await readParams(request)
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (!uris.length || uris.length > MAX_REDIRECT_URIS || !uris.every(validRedirectUri)) {
    return oauthJson({ error: 'invalid_redirect_uri', error_description: 'Send 1 to 5 redirect_uris: https, loopback (localhost) or an app scheme' }, 400)
  }
  const name = cleanClientName(body.client_name)
  return oauthJson(
    {
      client_id: makeClientId(linkSecret(), { redirectUris: uris as string[], name }),
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    201
  )
}

export const OPTIONS = preflight
