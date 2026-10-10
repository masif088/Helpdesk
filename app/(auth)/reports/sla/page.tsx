import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SlaReportContent from '@/components/content/reports/SlaReportContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'SLA & satisfaction' }

export default async function SlaReportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')
  return <SlaReportContent user={session.user} />
}
