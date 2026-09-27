import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, companyWebsites, crawlPages, crawlSessions, get, remove, removeWhere } from '@/lib/fsdb'

/** GET /api/crawl-sessions/[id] - Get single crawl session with company_websites */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const crawl = await get(crawlSessions, id)
  const website = crawl ? await get(companyWebsites, crawl.companyWebsiteId) : null
  const company = website ? await get(companies, website.companyId) : null
  const row = crawl
    ? {
        session: crawl,
        websiteId: website?.id ?? null,
        websiteUrl: website?.url ?? null,
        websiteTitle: website?.title ?? null,
        websiteCompanyId: website?.companyId ?? null,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
      }
    : null

  if (!row?.session) {
    return NextResponse.json({ error: 'Crawl session not found' }, { status: 404 })
  }

  const s = row.session
  const data = {
    id: s.id,
    company_website_id: s.companyWebsiteId,
    status: s.status,
    total_pages: s.totalPages,
    crawled_pages: s.crawledPages,
    failed_pages: s.failedPages,
    uncrawled_pages: s.uncrawledPages,
    broken_pages: s.brokenPages,
    error_message: s.errorMessage,
    max_depth: s.maxDepth,
    max_pages: s.maxPages,
    started_at: s.startedAt ? new Date(s.startedAt).toISOString() : null,
    completed_at: s.completedAt ? new Date(s.completedAt).toISOString() : null,
    created_at: s.createdAt ? new Date(s.createdAt).toISOString() : '',
    updated_at: s.updatedAt ? new Date(s.updatedAt).toISOString() : '',
    company_websites: row.websiteId
      ? {
          id: row.websiteId,
          company_id: row.websiteCompanyId,
          url: row.websiteUrl,
          title: row.websiteTitle,
          companies: row.companyId ? { id: row.companyId, name: row.companyName } : null,
        }
      : null,
  }

  return NextResponse.json(data)
}

/** DELETE /api/crawl-sessions/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await removeWhere(crawlPages, [['crawlSessionId', '==', id]])
  await remove(crawlSessions, id)
  return NextResponse.json({ success: true })
}
