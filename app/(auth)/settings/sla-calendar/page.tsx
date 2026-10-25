import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SlaCalendarContent from '@/components/content/settings/SlaCalendarContent'
import { getAppSettings } from '@/lib/app-settings'
import { isAdmin } from '@/lib/auth-utils'
import { cleanCalendar } from '@/lib/sla-calendar'

export const metadata = { title: 'SLA calendar' }

export default async function SlaCalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdmin((session.user as { role?: string }).role)) redirect('/settings')
  const settings = await getAppSettings()
  return <SlaCalendarContent user={session.user} initial={cleanCalendar(settings.sla_calendar)} />
}
