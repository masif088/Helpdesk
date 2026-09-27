import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyWebsites, crawlSessions, find, findBy } from '@/lib/fsdb'

/** GET /api/companies/[id]/crawl-sessions */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const websiteRows = await findBy(companyWebsites, { companyId: id })

  const websiteIds = websiteRows.map((w) => w.id)
  if (websiteIds.length === 0) {
    return NextResponse.json([])
  }

  const rows = await find(crawlSessions, {
    where: [['companyWebsiteId', 'in', websiteIds]],
    orderBy: [['createdAt', 'desc']],
  })

  const allWebsites = websiteRows
  const websiteMap: Record<string, { id: string; url: string; title: string | null }> = {}
  for (const w of allWebsites) {
    websiteMap[w.id] = { id: w.id, url: w.url, title: w.title }
  }

  const data = rows.map((r) => ({
    id: r.id,
    company_website_id: r.companyWebsiteId,
    status: r.status,
    total_pages: r.totalPages,
    crawled_pages: r.crawledPages,
    failed_pages: r.failedPages,
    error_message: r.errorMessage,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    company_websites: r.companyWebsiteId ? websiteMap[r.companyWebsiteId] ?? null : null,
  }))

  return NextResponse.json(data)
}
