import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import WorkloadReportContent from '@/components/content/reports/WorkloadReportContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export const metadata = { title: 'Workload' }

export default async function WorkloadReportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isAdminOrManager((session.user as { role?: string }).role)) redirect('/dashboard')
  return <WorkloadReportContent user={session.user} />
}
