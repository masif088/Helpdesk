import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CrawlSessionsContent from '@/components/content/crawl/CrawlSessionsContent'
import { isInternalUser } from '@/lib/auth-utils'

export default async function CrawlSessionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isInternalUser((session.user as { role?: string }).role)) redirect('/dashboard')
  return <CrawlSessionsContent user={session.user} />
}

