import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'

// Vercel serverless function configuration
export const maxDuration = 300 // 5 minutes
export const runtime = 'nodejs'

// POST - Process crawl (called internally or via webhook)
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const denied = denyUnless(session.user, isInternalUser)
    if (denied) return denied

    const body = await request.json()
    const { crawl_session_id, company_website_id, max_depth = 3, max_pages = 100 } = body

    if (!crawl_session_id || !company_website_id) {
      return NextResponse.json({ error: 'crawl_session_id and company_website_id are required' }, { status: 400 })
    }

    // Import and call the crawl process function
    const { startCrawlProcess } = await import('../utils')

    // Start the crawl process
    await startCrawlProcess(crawl_session_id, company_website_id, max_depth, max_pages)

    return NextResponse.json({ success: true, message: 'Crawl process completed' })
  } catch (error: any) {
    console.error('[Crawl Process] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to process crawl' }, { status: 500 })
  }
}

