import { getAppSettings } from '@/lib/app-settings'
import { buildOpenApi } from '@/lib/openapi'

export const dynamic = 'force-dynamic'

/**
 * GET /api/openapi.json: the API as an OpenAPI 3.1 file, for Postman, ChatGPT Actions, Swagger UI and the like.
 * Public on purpose (it describes the API and holds no key).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const base = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, '')
  const settings = await getAppSettings().catch(() => null)
  return Response.json(buildOpenApi(base, settings?.app_name || undefined), { headers: { 'Cache-Control': 'public, max-age=300' } })
}
