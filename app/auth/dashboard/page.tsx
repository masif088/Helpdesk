import { auth } from '@/auth'
import CustomerDashboardContent from '@/components/content/customer/CustomerDashboardContent'
import DashboardContent from '@/components/content/dashboard/DashboardContent'
import { count, teams, tickets, users } from '@/lib/fsdb'

function toSessionUser(user: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return {
    ...user,
    email: user.email ?? undefined,
    user_metadata: { full_name: user.name },
  }
}

export default async function AuthDashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return null
  }

  const role = (user as { role?: string }).role

  if (role === 'customer') {
    return (
      <CustomerDashboardContent
        user={toSessionUser(user) as any}
        withSidebar
      />
    )
  }

  let usersCount = 0
  let teamsCount = 0
  let completedTodosCount = 0
  let totalTodosCount = 0

  try {
    ;[usersCount, teamsCount, completedTodosCount, totalTodosCount] = await Promise.all([
      count(users),
      count(teams),
      count(tickets, [['status', 'in', ['resolved', 'closed', 'completed']]]),
      count(tickets),
    ])
  } catch (err) {
    console.error('Dashboard query failed (check Firebase Admin credentials / Firestore):', err)
  }

  return (
    <DashboardContent
      user={toSessionUser(user) as any}
      stats={{
        totalUsers: usersCount,
        totalTeams: teamsCount,
        completedTickets: completedTodosCount,
        totalTickets: totalTodosCount,
      }}
    />
  )
}
