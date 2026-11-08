import { API_KEY_SCOPES } from '@/lib/api-key-core'
import { authorizationServerMetadata } from '@/lib/mcp-oauth-core'
import { oauthJson, preflight } from '@/lib/oauth-http'
import { siteOrigin } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

/** GET /.well-known/oauth-authorization-server: where an AI assistant registers, sends the person to sign in, and gets its tokens. */
export const GET = (request: Request) => oauthJson(authorizationServerMetadata(siteOrigin(request), API_KEY_SCOPES))
export const OPTIONS = preflight
