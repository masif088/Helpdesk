import { protectedResourceMetadata } from '@/lib/mcp-oauth-core'
import { oauthJson, preflight } from '@/lib/oauth-http'
import { siteOrigin } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

/** GET /.well-known/oauth-protected-resource: tells an AI assistant that `/api/mcp` is signed in to through this portal. */
export const GET = (request: Request) => oauthJson(protectedResourceMetadata(siteOrigin(request)))
export const OPTIONS = preflight
