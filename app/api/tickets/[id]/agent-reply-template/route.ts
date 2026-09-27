import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { findOneBy, get, messageTemplates, tickets, users } from '@/lib/fsdb'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'

export const dynamic = 'force-dynamic'

const AGENT_REPLY_TEMPLATE_KEY = 'template_agent_reply' as const

function requestOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`.replace(/\/$/, '')
}

function isAgentRole(role: string | undefined): boolean {
  const r = (role || '').toLowerCase()
  return !!r && r !== 'customer'
}

/** GET — merged HTML for Agent Reply template (`template_agent_reply`) for this ticket. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAgentRole((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ticketIdNum = parseInt(id, 10)
  if (Number.isNaN(ticketIdNum)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const tpl = await findOneBy(messageTemplates, { key: AGENT_REPLY_TEMPLATE_KEY, status: 'active' })
  const raw = tpl?.content?.trim() ?? ''
  if (!raw) {
    return NextResponse.json({ html: '' })
  }

  const ticket = await get(tickets, ticketIdNum)
  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const [creator, contact, senderRow] = await Promise.all([
    get(users, ticket.createdBy),
    get(users, ticket.contactUserId),
    get(users, session.user.id),
  ])
  const ticketRow = { ticket, creator, contact }

  const recipientUser = ticketRow.contact ?? ticketRow.creator ?? null
  const recipientMap = userRowToMergeMap(recipientUser)
  const senderMap = userRowToMergeMap(senderRow ?? null)

  const origin = requestOrigin(request)
  const html = mergeMessageTemplateHtml(raw, {
    origin,
    ticketId: String(ticketIdNum),
    recipient: recipientMap,
    sender: senderMap,
    useDomMerge: false,
  })

  return NextResponse.json({ html })
}
