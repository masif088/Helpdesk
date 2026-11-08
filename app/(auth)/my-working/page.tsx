import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import MyWorkingContent from '@/components/content/my-working/MyWorkingContent'
import { isInternalUser } from '@/lib/auth-utils'

export const metadata = { title: 'My working' }

export default async function MyWorkingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isInternalUser((session.user as { role?: string }).role)) redirect('/dashboard')
  return <MyWorkingContent user={session.user} />
}
