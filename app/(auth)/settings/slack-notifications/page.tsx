import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SlackNotificationRulesContent from '@/components/content/settings/SlackNotificationRulesContent'
import { canAccessSlackNotifications } from '@/lib/auth-utils'

export default async function SlackNotificationsPage() {
  const session = await auth()
  if (!session?.user) return null
  if (!canAccessSlackNotifications((session.user as { role?: string }).role)) redirect('/dashboard')
  return <SlackNotificationRulesContent user={session.user} />
}
