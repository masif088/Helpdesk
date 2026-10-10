import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SkillsContent from '@/components/content/settings/SkillsContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'Skills' }

export default async function SkillsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/settings')
  return <SkillsContent user={session.user} />
}
