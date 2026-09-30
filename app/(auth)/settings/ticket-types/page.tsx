import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketTypesContent from '@/components/content/ticket/TicketTypesContent'
import { canAccessTicketAttributes } from '@/lib/auth-utils'

export default async function TicketTypesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canAccessTicketAttributes((session.user as { role?: string }).role)) redirect('/dashboard')

  return (
    <TicketTypesContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
      }}
    />
  )
}
