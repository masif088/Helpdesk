import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import DemoResetContent from '@/components/content/settings/DemoResetContent'
import { isAdmin } from '@/lib/auth-utils'
import { mayDemoReset } from '@/lib/demo-reset-plan'

export const metadata = { title: 'Demo reset' }

export default async function DemoResetPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!mayDemoReset(session.user.email) || !isAdmin((session.user as { role?: string }).role)) redirect('/settings')
  return <DemoResetContent user={session.user} />
}
