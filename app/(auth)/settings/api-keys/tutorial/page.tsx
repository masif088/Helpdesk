import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ApiKeysTutorialContent from '@/components/content/settings/ApiKeysTutorialContent'
import { DEFAULT_RATE_LIMIT_PER_HOUR } from '@/lib/api-key-core'
import { buildApiSkill } from '@/lib/api-skill'
import { isAdmin } from '@/lib/auth-utils'

export const metadata = { title: 'API tutorial' }

export default async function ApiKeysTutorialPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin((session.user as { role?: string }).role)) redirect('/settings')

  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || (host ? `${h.get('x-forwarded-proto') || 'https'}://${host}` : 'https://your-portal')
  return <ApiKeysTutorialContent user={session.user} baseUrl={baseUrl.replace(/\/$/, '')} skill={buildApiSkill(baseUrl, DEFAULT_RATE_LIMIT_PER_HOUR)} />
}
