import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'
import { companies, companyWebsites, crawlSessions, find, getManyMap } from '@/lib/fsdb'

/** GET /api/crawl-sessions - List all crawl sessions with company_websites.companies */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied

  const sessions = await find(crawlSessions, { orderBy: [['createdAt', 'desc']] })
  const websiteById = await getManyMap(companyWebsites, sessions.map((s) => s.companyWebsiteId))
  const companyById = await getManyMap(companies, [...websiteById.values()].map((w) => w.companyId))
  const rows = sessions.map((s) => {
    const w = websiteById.get(s.companyWebsiteId)
    const c = w ? companyById.get(w.companyId) : undefined
    return {
      session: s,
      websiteId: w?.id ?? null,
      websiteUrl: w?.url ?? null,
      websiteTitle: w?.title ?? null,
      companyId: c?.id ?? null,
      companyName: c?.name ?? null,
    }
  })

  const data = rows.map((r) => ({
    id: r.session.id,
    company_website_id: r.session.companyWebsiteId,
    status: r.session.status,
    total_pages: r.session.totalPages,
    crawled_pages: r.session.crawledPages,
    failed_pages: r.session.failedPages,
    uncrawled_pages: r.session.uncrawledPages,
    broken_pages: r.session.brokenPages,
    error_message: r.session.errorMessage,
    max_depth: r.session.maxDepth,
    max_pages: r.session.maxPages,
    started_at: r.session.startedAt ? new Date(r.session.startedAt).toISOString() : null,
    completed_at: r.session.completedAt ? new Date(r.session.completedAt).toISOString() : null,
    created_at: r.session.createdAt ? new Date(r.session.createdAt).toISOString() : '',
    updated_at: r.session.updatedAt ? new Date(r.session.updatedAt).toISOString() : '',
    company_websites: r.websiteId
      ? {
          id: r.websiteId,
          company_id: r.companyId,
          url: r.websiteUrl,
          title: r.websiteTitle,
          companies: r.companyId ? { id: r.companyId, name: r.companyName } : null,
        }
      : null,
  }))

  return NextResponse.json(data)
}
