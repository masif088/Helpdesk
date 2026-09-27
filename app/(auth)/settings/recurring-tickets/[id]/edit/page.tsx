import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import RecurringTicketFormPage from '@/components/content/recurring-tickets/RecurringTicketFormPage'
import { get, recurringTickets } from '@/lib/fsdb'

export default async function EditRecurringTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role?.toLowerCase()
  if (!session?.user || !['admin', 'manager'].includes(role ?? '')) redirect('/settings/recurring-tickets')

  const { id } = await params
  const row = await get(recurringTickets, id)
  if (!row) redirect('/settings/recurring-tickets')

  const initialValues = {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    frequency: row.frequency,
    specificDays: row.specificDays as number[] | null,
    specificDate: row.specificDate as number | number[] | null,
    intervalDays: row.intervalDays ?? null,
    timeOfDay: row.timeOfDay,
    timezone: row.timezone,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    isActive: row.isActive ?? true,
    lastRunAt: null,
    nextRunAt: null,
    ticketStatus: row.ticketStatus ?? 'open',
    ticketPriority: row.ticketPriority ?? null,
    companyId: row.companyId ?? null,
    teamId: row.teamId ?? null,
    ticketTypeId: row.ticketTypeId ?? null,
    contactUserId: row.contactUserId ?? null,
    assigneeIds: row.assigneeIds as string[] ?? [],
  }

  return <RecurringTicketFormPage initialValues={initialValues} />
}
