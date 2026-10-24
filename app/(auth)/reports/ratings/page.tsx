import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import RatingsContent from '@/components/content/reports/RatingsContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'Ratings' }

export default async function RatingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')
  return <RatingsContent user={session.user} />
}
