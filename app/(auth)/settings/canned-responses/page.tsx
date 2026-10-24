import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CannedResponsesContent from '@/components/content/settings/CannedResponsesContent'
import { isAdminOrManager, isInternalUser } from '@/lib/auth-utils'

export const metadata = { title: 'Canned responses' }

export default async function CannedResponsesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!isInternalUser(role)) redirect('/settings')
  return <CannedResponsesContent user={session.user} canShare={isAdminOrManager(role)} />
}
