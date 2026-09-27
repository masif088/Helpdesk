import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessTeams, canAdminTeams } from '@/lib/auth-utils'
import { find, getManyMap, insert, teamMembers, teams, users } from '@/lib/fsdb'
import { normalizeTeamVisibilityBody } from '@/lib/team-type'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/teams - List all teams with creator and member count */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const teamDocs = await find(teams, { orderBy: [['createdAt', 'desc']] })
  const teamIds = teamDocs.map((t) => t.id)
  const allMemberDocs = await find(teamMembers, { where: [['teamId', 'in', teamIds]] })
  const peopleById = await getManyMap(users, [
    ...teamDocs.map((t) => t.createdBy),
    ...allMemberDocs.map((m) => m.userId),
  ])
  const teamsRows = teamDocs.map((team) => ({ team, creator: peopleById.get(team.createdBy) ?? null }))
  const membersByTeam: Record<string, Array<{ id: string; team_id: string; user_id: string; role: string; joined_at: string; user_name?: string; user_email?: string; user_avatar_url?: string | null }>> = {}

  if (teamIds.length > 0) {
    const allMembersRows = allMemberDocs.map((member) => ({ member, user: peopleById.get(member.userId) ?? null }))

    for (const row of allMembersRows) {
      const tid = row.member.teamId
      if (!membersByTeam[tid]) membersByTeam[tid] = []
      membersByTeam[tid].push({
        id: row.member.id,
        team_id: row.member.teamId,
        user_id: row.member.userId,
        role: row.member.role ?? 'member',
        joined_at: row.member.joinedAt ? new Date(row.member.joinedAt).toISOString() : '',
        user_name: row.user?.fullName || row.user?.email || 'Unknown',
        user_email: row.user?.email ?? undefined,
        user_avatar_url: row.user?.avatarUrl ?? null,
      })
    }
  }

  const result = teamsRows.map((r) => {
    const t = r.team
    const members = membersByTeam[t.id] || []
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      created_by: t.createdBy,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      creator_name: r.creator?.fullName || r.creator?.email || 'Unknown',
      member_count: members.length,
      members,
    }
  })

  return NextResponse.json(result)
}

/** POST /api/teams - Create a new team (admin only) */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAdminTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, type } = body
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const visibility = normalizeTeamVisibilityBody(type)
  if (!visibility) {
    return NextResponse.json({ error: 'type is required and must be public or private' }, { status: 400 })
  }

  const inserted = await insert(teams, {
    name: name.trim(),
    type: visibility,
    createdBy: session.user.id,
  })

  if (!inserted) {
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }

  // Add creator as team member (manager role)
  await insert(teamMembers, {
    teamId: inserted.id,
    userId: session.user.id,
    role: 'manager',
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    id: inserted.id,
    name: inserted.name,
    type: inserted.type,
    created_by: inserted.createdBy,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    creator_name: session.user.name || session.user.email || 'Unknown',
    member_count: 1,
    members: [{
      user_id: session.user.id,
      role: 'manager',
      joined_at: new Date().toISOString(),
      user_name: session.user.name || session.user.email || 'Unknown',
      user_email: session.user.email ?? undefined,
      user_avatar_url: session.user.image ?? null,
    }],
  })
}
