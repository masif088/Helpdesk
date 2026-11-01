import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TimeZoneContent from '@/components/content/settings/TimeZoneContent'
import { getAppSettings } from '@/lib/app-settings'
import { isAdmin } from '@/lib/auth-utils'

export const metadata = { title: 'Time zone' }

export default async function TimeZonePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin((session.user as { role?: string }).role)) redirect('/settings')
  const settings = await getAppSettings()
  return <TimeZoneContent user={session.user} initial={settings.app_timezone} />
}
