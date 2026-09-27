'use server'

import { cookies } from 'next/headers'

import { auth } from '@/auth'
import {
  companyWebsites,
  crawlPages,
  crawlSessions,
  find,
  get,
  insert,
  updateWhere,
} from '@/lib/fsdb'

interface StartCrawlParams {
  company_id?: string
  url?: string
  title?: string
  description?: string
  is_primary?: boolean
  company_website_id?: string
  max_depth?: number
  max_pages?: number
}

function toSnakeSession(s: typeof crawlSessions.$inferSelect) {
  return {
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
    started_at: s.startedAt?.toISOString() ?? null,
    completed_at: s.completedAt?.toISOString() ?? null,
    created_at: s.createdAt?.toISOString() ?? '',
    updated_at: s.updatedAt?.toISOString() ?? '',
  }
}

function toSnakePage(p: typeof crawlPages.$inferSelect) {
  return {
    id: p.id,
    crawl_session_id: p.crawlSessionId,
    url: p.url,
    title: p.title,
    description: p.description,
    depth: p.depth,
    status: p.status,
    http_status_code: p.httpStatusCode,
    content_type: p.contentType,
    heading_hierarchy: p.headingHierarchy,
    meta_tags: p.metaTags,
    links: p.links,
    error_message: p.errorMessage,
    crawled_at: p.crawledAt?.toISOString() ?? null,
    created_at: p.createdAt?.toISOString() ?? '',
    updated_at: p.updatedAt?.toISOString() ?? '',
  }
}

/**
 * Server action to create a company website and start a crawl session
 */
export async function startCrawl(params: StartCrawlParams) {
  try {
    const session = await auth()
    if (!session?.user) {
      return { error: 'Unauthorized', success: false }
    }

    const cookieStore = await cookies()

    const {
      company_id,
      url,
      title,
      description,
      is_primary,
      company_website_id,
      max_depth = 3,
      max_pages = 100,
    } = params

    let websiteId = company_website_id

    // If company_website_id not provided, create a new company website
    if (!websiteId) {
      if (!company_id || !url) {
        return {
          error: 'company_id and url are required when company_website_id is not provided',
          success: false,
        }
      }

      // If setting as primary, unset other primary websites for this company
      if (is_primary) {
        await updateWhere(
          companyWebsites,
          [
            ['companyId', '==', company_id],
            ['isPrimary', '==', true],
          ],
          { isPrimary: false }
        )
      }

      const websiteData = await insert(companyWebsites, {
        companyId: company_id,
        url,
        title: title || null,
        description: description || null,
        isPrimary: is_primary || false,
      })

      if (!websiteData) {
        return { error: 'Failed to create company website', success: false }
      }

      websiteId = websiteData.id
    } else {
      // Verify the company_website_id exists
      const existingWebsite = await get(companyWebsites, websiteId)

      if (!existingWebsite) {
        return { error: 'Invalid company_website_id', success: false }
      }
    }

    // Call the API route to start the crawl
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/crawl/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        company_website_id: websiteId,
        max_depth,
        max_pages,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return { error: result.error || 'Failed to start crawl', success: false }
    }

    return {
      data: result.data,
      success: true,
      message: result.message || 'Crawl session created and started',
    }
  } catch (error: any) {
    return { error: error.message || 'Failed to start crawl', success: false }
  }
}

/**
 * Server action to get crawl sessions for a company website
 */
export async function getCrawlSessions(company_website_id: string) {
  try {
    const session = await auth()
    if (!session?.user) {
      return { error: 'Unauthorized', success: false }
    }

    const rows = await find(crawlSessions, {
      where: [['companyWebsiteId', '==', company_website_id]],
      orderBy: [['createdAt', 'desc']],
    })

    const data = rows.map(toSnakeSession)
    return { data, success: true }
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch crawl sessions', success: false }
  }
}

/**
 * Server action to get crawl pages for a crawl session
 */
export async function getCrawlPages(crawl_session_id: string) {
  try {
    const session = await auth()
    if (!session?.user) {
      return { error: 'Unauthorized', success: false }
    }

    const rows = await find(crawlPages, {
      where: [['crawlSessionId', '==', crawl_session_id]],
      orderBy: [['depth', 'asc'], ['crawledAt', 'asc']],
    })

    const data = rows.map(toSnakePage)
    return { data, success: true }
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch crawl pages', success: false }
  }
}
