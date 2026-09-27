import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketDetailContentClient from '@/components/ticket/TicketDetailContentClient'
import { isAdmin } from '@/lib/auth-utils'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { get, getByKey, teamMembers, teams, tickets } from '@/lib/fsdb'
import { getTicketDetail } from '@/lib/ticket-detail'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) return {}
  const row = await get(tickets, ticketId)
  if (!row) return {}
  return { title: `#${ticketId} ${row.title}` }
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) {
    redirect('/tickets?ticket_error=invalid')
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const userId = session.user.id!

  const ticketExists = await get(tickets, ticketId)
  if (!ticketExists) {
    redirect('/tickets?ticket_error=not_found')
  }

  // Team access control for non-admin staff
  if (!isAdmin(role) && role !== 'customer' && ticketExists.teamId) {
    const teamRow = await get(teams, ticketExists.teamId)
    if (teamRow?.type !== 'public') {
      const isMember = await getByKey(teamMembers, { teamId: ticketExists.teamId, userId })
      if (!isMember) {
        redirect('/tickets?ticket_error=no_access')
      }
    }
  }

  const data = await getTicketDetail(ticketId, {
    screenshotUserId: userId,
    ...(role === 'customer'
      ? { customerPortal: { userId, companyId: await getCustomerCompanyId(userId) } }
      : {}),
  })

  if (!data) {
    redirect('/tickets?ticket_error=no_access')
  }

  const isCustomer = role === 'customer'

  return (
    <TicketDetailContentClient
      user={session.user}
      ticketData={data.ticketData}
      checklistItems={data.checklistItems}
      comments={data.comments}
      commentsHasOlder={data.comments_has_older}
      commentsOlderCursor={data.comments_older_cursor}
      commentsOlderRemaining={data.comments_older_remaining}
      attributes={data.attributes}
      screenshots={data.screenshots}
      tags={data.tags}
      ticketCcEmails={data.ticketCcEmails ?? []}
      variant={isCustomer ? 'customer' : 'admin'}
    />
  )
}

