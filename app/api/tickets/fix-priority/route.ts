import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { findBy, patchMany, sortRows, tickets } from '@/lib/fsdb'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const companyId: string | undefined = body.company_id
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

  const rows = sortRows(await findBy(tickets, { companyId }), [['id', 'asc']])

  // Clear priority from closed tickets that still have one
  const closedWithPriority = rows.filter(
    (r) => isClosedLikeTicketStatus(r.status) && r.priority != null && r.priority !== 0,
  )
  if (closedWithPriority.length > 0) {
    await patchMany(
      tickets,
      closedWithPriority.map((r) => ({ id: r.id, patch: { priority: null } }))
    )
  }

  // Open tickets: keep existing priorities, only assign to those missing one (priority null/0)
  const open = rows.filter((r) => !isClosedLikeTicketStatus(r.status))
  const withPriority = open
    .filter((r) => r.priority != null && r.priority > 0)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  const withoutPriority = open
    .filter((r) => r.priority == null || r.priority <= 0)
    .sort((a, b) => a.id - b.id)

  if (withoutPriority.length === 0) {
    return NextResponse.json({ updated: 0, cleared: closedWithPriority.length })
  }

  // Next rank starts after the highest existing priority
  const maxExisting = withPriority.length > 0 ? Math.max(...withPriority.map((r) => r.priority ?? 0)) : 0

  // Assign rank maxExisting+1 .. maxExisting+N
  await patchMany(
    tickets,
    withoutPriority.map((r, i) => ({ id: r.id, patch: { priority: maxExisting + i + 1 } }))
  )

  return NextResponse.json({ updated: withoutPriority.length, cleared: closedWithPriority.length })
}
