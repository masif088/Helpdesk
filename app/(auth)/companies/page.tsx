import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompaniesContent from '@/components/content/company/CompaniesContent'

export const dynamic = 'force-dynamic'

export default async function SettingsCompaniesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  // Customers only ever see their own company
  if (role === 'customer') redirect('/my-company')

  return <CompaniesContent user={session.user} />
}
