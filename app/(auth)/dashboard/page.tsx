import { auth } from '@/auth'
import CustomerDashboardContent from '@/components/content/customer/CustomerDashboardContent'
import DashboardContent from '@/components/content/dashboard/DashboardContent'
import { type AdminDashboardData, getAdminDashboardData } from '@/lib/admin-dashboard'
import { isAdminOrManager } from '@/lib/auth-utils'

export default async function DashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return null
  }

  const role = (user as { role?: string }).role

  // Customer: show customer dashboard (My Tickets, Priority, Time Spent, etc.) with sidebar
  if (role === 'customer') {
    return (
      <CustomerDashboardContent
        user={user}
        withSidebar
      />
    )
  }

  // Admin / staff: team-wide dashboard (billing figures for admin / manager only)
  const includeBilling = isAdminOrManager(role)
  let data: AdminDashboardData | null = null
  try {
    data = await getAdminDashboardData({ includeBilling })
  } catch (err) {
    console.error('Dashboard query failed (check Firebase Admin credentials / Firestore).', err)
  }

  return <DashboardContent user={user} data={data} />
}
