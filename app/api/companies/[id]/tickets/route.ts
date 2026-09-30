import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyCompanyRead } from '@/lib/api-guard'
import { find, findBy, tickets, ticketStatuses } from '@/lib/fsdb'

/** GET /api/companies/[id]/tickets?limit=5 — top tickets by priority (lowest number = highest priority) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const denied = await denyCompanyRead(session.user, id)
  if (denied) return denied
  const url = new URL(request.url)
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') ?? '5', 10)))
  const excludeSlugs = (url.searchParams.get('exclude') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const exclude = new Set(excludeSlugs)
  const [companyTickets, statuses] = await Promise.all([findBy(tickets, { companyId: id }), find(ticketStatuses)])
  const statusTitle = new Map(statuses.map((s) => [s.slug, s.title]))
  // priority ascending, NULLs last (Postgres default)
  const rows = companyTickets
    .filter((t) => t.ticketType !== 'trash' && t.ticketType !== 'spam' && !exclude.has(t.status))
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit)
    .map((t) => ({ id: t.id, title: t.title, status: t.status, statusLabel: statusTitle.get(t.status) ?? null, priority: t.priority }))

  return NextResponse.json({
    data: rows.map(r => ({
      id: r.id,
      title: r.title,
      status: r.statusLabel ?? r.status,
      slug: r.status,
      priority: r.priority,
    })),
  })
}
