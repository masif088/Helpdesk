import { buildApiSkill } from '@/lib/api-skill'

export const dynamic = 'force-dynamic'

/**
 * GET /api/skill: the SKILL.md an AI assistant reads to use this portal's ticket and calendar API.
 * Public on purpose: it describes the API and holds no key (the assistant reads its key from TICKETING_API_KEY).
 * Send `?download=1` for a file download.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const base = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, '')
  return new Response(buildApiSkill(base), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...(url.searchParams.get('download') === '1' ? { 'Content-Disposition': 'attachment; filename="SKILL.md"' } : {}),
    },
  })
}
