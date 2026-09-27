import { redirect } from 'next/navigation'

/** Legacy path — the dashboard lives at /dashboard. */
export default function AuthDashboardPage() {
  redirect('/dashboard')
}
