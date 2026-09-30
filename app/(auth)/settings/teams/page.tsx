import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamsContent from '@/components/content/team/TeamsContent'
import { canAccessTeams } from '@/lib/auth-utils'

export default async function SettingsTeamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessTeams((session.user as { role?: string }).role)) redirect('/dashboard')
  return <TeamsContent user={session.user} />
}
