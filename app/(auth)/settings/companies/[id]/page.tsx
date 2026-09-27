import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompanyDetailContent from '@/components/content/company/CompanyDetailContent'
import { isAdminOrManager } from '@/lib/auth-utils'
import { getCompanyDetail } from '@/lib/company-detail'

export default async function SettingsCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params

  const currentUserRole = (session.user as { role?: string }).role

  const companyData = await getCompanyDetail(id, { includeBilling: isAdminOrManager(currentUserRole) })
  if (!companyData) {
    redirect('/settings/companies')
  }

  return (
    <CompanyDetailContent
      user={session.user}
      companyData={companyData}
      currentUserRole={currentUserRole}
    />
  )
}
