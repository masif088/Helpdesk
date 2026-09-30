import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SupportReportContent from '@/components/content/reports/SupportReportContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'Support report' }

export default async function SupportReportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')
  return <SupportReportContent user={session.user} />
}
