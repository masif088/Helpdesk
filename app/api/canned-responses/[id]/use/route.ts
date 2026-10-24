import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isInternalUser } from '@/lib/auth-utils'
import { fillCanned, visibleTo } from '@/lib/canned-responses'
import { cannedResponses, companies, get, tickets, update, users } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

/** POST /api/canned-responses/:id/use { ticketId } — the reply with this ticket's details filled in; counts one use. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const me = session?.user as { id?: string; role?: string; name?: string | null } | undefined
  if (!me?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isInternalUser(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const row = await get(cannedResponses, id)
  if (!row || !visibleTo(row, me.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const b = (await request.json().catch(() => ({}))) as { ticketId?: unknown }
  const ticket = typeof b.ticketId === 'number' ? await get(tickets, b.ticketId) : null
  const [contact, creator, agent, company] = await Promise.all([get(users, ticket?.contactUserId), get(users, ticket?.createdBy), get(users, me.id), get(companies, ticket?.companyId)])
  const who = contact ?? creator
  const html = fillCanned(row.content, {
    customer_name: who?.fullName || who?.firstName || who?.email || 'there',
    ticket_number: ticket ? String(ticket.id) : '',
    ticket_title: ticket?.title ?? '',
    agent_name: agent?.fullName || me.name || '',
    company: company?.name ?? '',
  })
  await update(cannedResponses, row.id, { usageCount: (row.usageCount ?? 0) + 1 })
  return NextResponse.json({ html })
}
