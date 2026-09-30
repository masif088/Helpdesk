import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CustomerCompanySettingsContent from '@/components/content/customer/CustomerCompanySettingsContent'
import { getCompanyDetail } from '@/lib/company-detail'
import { getCustomerCompanyId, isCompanyPortalAdmin } from '@/lib/customer-company'

export default async function MyCompanyPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role !== 'customer') {
    redirect('/dashboard')
  }

  // Not linked to a company (yet): the page says so instead of bouncing back to the dashboard
  const companyId = await getCustomerCompanyId(session.user.id)
  const companyData = companyId ? await getCompanyDetail(companyId) : null
  const portalAdmin = companyId && companyData ? await isCompanyPortalAdmin(session.user.id, companyId) : false

  return (
    <CustomerCompanySettingsContent
      user={session.user}
      companyData={companyData}
      isCompanyPortalAdmin={portalAdmin}
    />
  )
}
