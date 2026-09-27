import { auth } from '@/auth'
import CustomerDashboardContent from '@/components/content/customer/CustomerDashboardContent'
import DashboardContent from '@/components/content/dashboard/DashboardContent'
import { count, teams, tickets, users } from '@/lib/fsdb'

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

  // Admin / other roles: show admin dashboard
  let usersCount = 0
  let teamsCount = 0
  let completedTicketsCount = 0
  let totalTicketsCount = 0

  try {
    ;[usersCount, teamsCount, completedTicketsCount, totalTicketsCount] = await Promise.all([
      count(users),
      count(teams),
      count(tickets, [['status', 'in', ['resolved', 'closed', 'completed']]]),
      count(tickets),
    ])
  } catch (err) {
    console.error('Dashboard query failed (check Firebase Admin credentials / Firestore).', err)
  }

  return (
    <DashboardContent
      user={user}
      stats={{
        totalUsers: usersCount,
        totalTeams: teamsCount,
        completedTickets: completedTicketsCount,
        totalTickets: totalTicketsCount,
      }}
    />
  )
}
