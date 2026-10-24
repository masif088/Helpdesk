import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ToRateContent from '@/components/content/customer/ToRateContent'
import { ticketsToRate } from '@/lib/customer-to-rate'

export const metadata = { title: 'Rate your tickets' }

export default async function ToRatePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if ((session.user as { role?: string }).role?.toLowerCase() !== 'customer') redirect('/dashboard')
  return <ToRateContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string }} items={await ticketsToRate(session.user.id)} />
}
