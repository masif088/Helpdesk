import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { canAccessCompanies } from '@/lib/auth-utils'

export default async function CompaniesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessCompanies(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
