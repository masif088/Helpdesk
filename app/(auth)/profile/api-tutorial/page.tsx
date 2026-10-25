import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ApiKeysTutorialContent from '@/components/content/settings/ApiKeysTutorialContent'
import { DEFAULT_RATE_LIMIT_PER_HOUR } from '@/lib/api-key-core'
import { buildApiSkill } from '@/lib/api-skill'
import { isAdmin } from '@/lib/auth-utils'

export const metadata = { title: 'API tutorial' }

/** The same tutorial as under Settings, open to every signed-in user (they make their own keys under Profile). */
export default async function ProfileApiTutorialPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || (host ? `${h.get('x-forwarded-proto') || 'https'}://${host}` : 'https://your-portal')
  return (
    <ApiKeysTutorialContent
      user={session.user}
      baseUrl={baseUrl.replace(/\/$/, '')}
      skill={buildApiSkill(baseUrl, DEFAULT_RATE_LIMIT_PER_HOUR)}
      isAdmin={isAdmin((session.user as { role?: string }).role)}
    />
  )
}
