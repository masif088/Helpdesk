import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompaniesContent from '@/components/content/company/CompaniesContent'
import CustomerCompanySettingsContent from '@/components/content/customer/CustomerCompanySettingsContent'
import { getCompanyDetail } from '@/lib/company-detail'
import { getCustomerCompanyId } from '@/lib/customer-company'

export const dynamic = 'force-dynamic'

export default async function SettingsCompaniesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    const companyId = await getCustomerCompanyId((session.user as { id: string }).id)
    if (!companyId) redirect('/dashboard')
    const companyData = await getCompanyDetail(companyId)
    if (!companyData) redirect('/dashboard')
    return <CustomerCompanySettingsContent user={session.user} companyData={companyData} />
  }

  return <CompaniesContent user={session.user} />
}
