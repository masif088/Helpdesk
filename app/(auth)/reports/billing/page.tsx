import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import BillingReportContent from '@/components/content/reports/BillingReportContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'Billing report' }

export default async function BillingReportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')
  return <BillingReportContent user={session.user} />
}
