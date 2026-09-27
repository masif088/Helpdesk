import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { findBy, getManyMap, teamMembers, users } from '@/lib/fsdb'

/** GET /api/tickets/[id]/team-members?team_id=xxx - Get team members for a team */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const teamId = url.searchParams.get('team_id')
  if (!teamId) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 })
  }

  const members = await findBy(teamMembers, { teamId })
  const userById = await getManyMap(users, members.map((m) => m.userId))
  const rows = members.map((m) => ({
    id: m.id,
    teamId: m.teamId,
    userId: m.userId,
    user: userById.get(m.userId) ?? null,
  }))

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      user: r.user
        ? { id: r.user.id, full_name: r.user.fullName, email: r.user.email }
        : null,
    }))
  )
}
