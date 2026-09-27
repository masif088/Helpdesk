import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { findBy, teamMembers } from '@/lib/fsdb'
import { getTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** GET /api/tickets/lookup - Lookup data for ticket form */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id!
    const role = (session.user as { role?: string }).role?.toLowerCase()

    const [catalog, userTeamRows, userCompanyRow] = await Promise.all([
      getTicketsLookupCatalog(),
      role === 'customer'
        ? Promise.resolve([] as Array<{ teamId: string }>)
        : findBy(teamMembers, { userId }),
      role === 'customer' ? getCustomerCompanyId(userId) : Promise.resolve(null as string | null),
    ])

    const userCompanyId = typeof userCompanyRow === 'string' ? userCompanyRow : null
    const userTeamIds = userTeamRows.map((r) => r.teamId)
    const ticketTypesFiltered = catalog.ticketTypes
      .filter((t) => role !== 'customer' || !t.isAgentOnly)
      .map(({ id, title, slug, color }) => ({ id, title, slug, color }))
    // Admin sees all teams; non-admin sees public teams + teams they belong to
    const visibleTeams = role === 'admin'
      ? catalog.teams
      : catalog.teams.filter((t) => t.type === 'public' || userTeamIds.includes(t.id))

    const body = {
      userCompanyId,
      userTeamIds,
      teams: visibleTeams,
      users: catalog.users,
      ticketTypes: ticketTypesFiltered,
      companies: catalog.companies,
      tags: catalog.tags,
      statuses: catalog.statuses,
    }
    return NextResponse.json(body, {
      headers: {
        /** Lookup catalog rarely changes; browser may cache briefly. */
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    })
  } catch (err: unknown) {
    console.error('[API /api/tickets/lookup]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
