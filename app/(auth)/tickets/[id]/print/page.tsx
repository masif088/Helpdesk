import { redirect } from 'next/navigation'
import type { ComponentProps } from 'react'

import { auth } from '@/auth'
import TicketPrintView from '@/components/ticket/TicketPrintView'
import { BRANDING } from '@/lib/branding'
import { get, tickets, users } from '@/lib/fsdb'
import { getTicketDetail } from '@/lib/ticket-detail'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) return {}
  const row = await get(tickets, ticketId)
  if (!row) return {}
  const now = new Date()
  const ts = now.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\//g, '-').replace(',', '')
  return { title: { absolute: `Print #${ticketId} ${row.title} - ${BRANDING.name} - ${ts}` } }
}

export default async function TicketPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) redirect('/tickets?ticket_error=invalid')

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'

  // Customers see filtered view (no internal notes)
  const userRow = isCustomer ? await get(users, session.user.id) : null

  const options = isCustomer
    ? { customerPortal: { userId: session.user.id!, companyId: (userRow as { companyId: string | null } | null)?.companyId ?? null }, screenshotUserId: session.user.id! }
    : { screenshotUserId: session.user.id! }

  const data = await getTicketDetail(ticketId, options)
  if (!data) redirect('/tickets?ticket_error=no_access')

  return <TicketPrintView ticketData={data.ticketData} comments={data.comments as ComponentProps<typeof TicketPrintView>['comments']} isAgent={!isCustomer} />
}
