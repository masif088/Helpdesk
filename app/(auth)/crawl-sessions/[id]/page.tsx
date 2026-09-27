import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CrawlSessionDetailContent from '@/components/content/crawl/CrawlSessionDetailContent'
import { companies, companyWebsites, crawlSessions, get } from '@/lib/fsdb'

export default async function CrawlSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params

  const crawl = await get(crawlSessions, id)
  const website = crawl ? await get(companyWebsites, crawl.companyWebsiteId) : null
  const company = website ? await get(companies, website.companyId) : null

  if (!crawl || !website || !company) redirect('/crawl-sessions')
  const row = { session: crawl, website, company }

  const s = row.session
  const crawlSession = {
    id: s.id,
    status: s.status,
    total_pages: s.totalPages,
    crawled_pages: s.crawledPages,
    failed_pages: s.failedPages,
    uncrawled_pages: s.uncrawledPages,
    broken_pages: s.brokenPages,
    error_message: s.errorMessage,
    max_depth: s.maxDepth,
    max_pages: s.maxPages,
    started_at: s.startedAt?.toISOString() ?? null,
    completed_at: s.completedAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
    company_websites: {
      id: row.website.id,
      company_id: row.website.companyId,
      url: row.website.url,
      title: row.website.title,
      description: row.website.description,
      companies: { id: row.company.id, name: row.company.name },
    },
  }

  return <CrawlSessionDetailContent user={session.user} crawlSession={crawlSession} />
}

