import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketStatusesContent from '@/components/content/ticket/TicketStatusesContent'
import { canAccessTicketAttributes } from '@/lib/auth-utils'

export default async function TicketStatusesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canAccessTicketAttributes((session.user as { role?: string }).role)) redirect('/dashboard')

  return <TicketStatusesContent user={session.user} />
}
