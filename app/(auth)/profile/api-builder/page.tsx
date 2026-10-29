import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ApiBuilderContent from '@/components/content/settings/ApiBuilderContent'
import { isAdmin } from '@/lib/auth-utils'

export const metadata = { title: 'API builder' }

/** The same builder as under Settings, open to every signed-in user (they make their own keys under Profile). */
export default async function ProfileApiBuilderPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || (host ? `${h.get('x-forwarded-proto') || 'https'}://${host}` : 'https://your-portal')
  return <ApiBuilderContent user={session.user} baseUrl={baseUrl.replace(/\/$/, '')} isAdmin={isAdmin((session.user as { role?: string }).role)} />
}
