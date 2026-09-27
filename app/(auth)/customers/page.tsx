import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import UsersContent from '@/components/content/user/UsersContent'
import { canAccessUsers } from '@/lib/auth-utils'

export const metadata = { title: 'Customers' }

/** Customer (portal) users — separate from internal users in Settings → Users. */
export default async function CustomersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessUsers(role) || (role ?? '').toLowerCase() === 'customer') redirect('/dashboard')
  return <UsersContent user={session.user} audience="customer" />
}
