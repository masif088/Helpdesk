import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getAppSettings } from '@/lib/app-settings'
import { isAdmin } from '@/lib/auth-utils'
import { find, findBy, teamMembers, teams } from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { isInboxOverdue, isInboxTicket, isMyTicket, loadAssignedTicketIds, loadMyTicketScope } from '@/lib/ticket-inbox'
import { loadTicketCandidates } from '@/lib/ticket-list-query'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

/** GET /api/tickets/scope-counts — sidebar badges: open unassigned tickets (Inbox) and my open tickets (assigned to me or my teams). Staff only. */
export async function GET() {
  const session = await auth()
  const user = session?.user
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') return NextResponse.json({ inbox: 0, overdue: 0, reminder_hours: 0, mine: 0 })

  const [candidates, assigned, mine, settings] = await Promise.all([
    loadTicketCandidates({ ticketType: DEFAULT_TICKET_TYPE }),
    loadAssignedTicketIds(),
    loadMyTicketScope(user.id),
    getAppSettings(),
  ])

  // Same team visibility as the ticket list
  let visible: (teamId: string | null) => boolean = () => true
  if (!isAdmin(role)) {
    const [memberships, publicTeams] = await Promise.all([
      findBy(teamMembers, { userId: user.id }),
      find(teams, { where: [['type', '==', 'public']] }),
    ])
    const ids = new Set([...memberships.map((m) => m.teamId), ...publicTeams.map((t) => t.id)])
    visible = (teamId) => !teamId || ids.has(teamId)
  }

  let inbox = 0
  let overdue = 0
  let myOpen = 0
  for (const t of candidates) {
    if (!visible(t.teamId)) continue
    if (isInboxTicket(t, assigned)) {
      inbox++
      if (isInboxOverdue(t, settings.inbox_reminder_hours)) overdue++
    }
    if (isMyTicket(t, mine) && !isClosedLikeTicketStatus(t.status)) myOpen++
  }
  return NextResponse.json({ inbox, overdue, reminder_hours: settings.inbox_reminder_hours, mine: myOpen })
}
