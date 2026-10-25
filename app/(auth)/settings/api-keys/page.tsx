import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ApiKeysContent from '@/components/content/settings/ApiKeysContent'
import { isAdmin } from '@/lib/auth-utils'

export const metadata = { title: 'API keys' }

export default async function ApiKeysPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin((session.user as { role?: string }).role)) redirect('/settings')
  return <ApiKeysContent user={session.user} />
}
