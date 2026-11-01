import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CalendarContent from '@/components/content/calendar/CalendarContent'

export const metadata = { title: 'Calendar' }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { date } = await searchParams
  return <CalendarContent user={session.user} initialDate={date} />
}
