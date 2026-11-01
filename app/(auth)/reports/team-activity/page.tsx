import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamActivityContent from '@/components/content/reports/TeamActivityContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'Team activity' }

export default async function TeamActivityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')
  return <TeamActivityContent user={session.user} />
}
