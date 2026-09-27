import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessTeams, canAdminTeams } from '@/lib/auth-utils'
import { findBy, get, getMany, getManyMap, insertIgnore, teamMembers, teams, users } from '@/lib/fsdb'

const TEAM_INELIGIBLE_ROLES = ['customer', 'guest']

function sessionRole(session: { user?: { role?: string; id?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/teams/[id]/members - List team members */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: teamId } = await params
  if (!teamId) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const memberDocs = await findBy(teamMembers, { teamId: teamId })
  const memberUsers = await getManyMap(users, memberDocs.map((m) => m.userId))
  const rows = memberDocs.map((member) => ({ member, user: memberUsers.get(member.userId) ?? null }))

  const result = rows.map((r) => ({
    id: r.member.id,
    team_id: r.member.teamId,
    user_id: r.member.userId,
    role: r.member.role ?? 'member',
    joined_at: r.member.joinedAt ? new Date(r.member.joinedAt).toISOString() : '',
    user_name: r.user?.fullName || r.user?.email || 'Unknown',
    user_email: r.user?.email ?? undefined,
    user_avatar_url: r.user?.avatarUrl ?? null,
  }))

  return NextResponse.json(result)
}

/** POST /api/teams/[id]/members - Add members (admin or team creator) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: teamId } = await params
  if (!teamId) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const teamRow = await get(teams, teamId)
  if (!teamRow) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const sessionUserRole = sessionRole(session)
  const uid = session.user.id
  if (!canAdminTeams(sessionUserRole) && uid !== teamRow.createdBy) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { user_ids: userIds, role: roleOverride } = body
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'user_ids array is required' }, { status: 400 })
  }
  const role = (roleOverride && typeof roleOverride === 'string') ? roleOverride : 'member'

  const userRows = await getMany(users, userIds)
  const ineligible = userRows.filter((u) => TEAM_INELIGIBLE_ROLES.includes((u.role ?? '').toLowerCase()))
  if (ineligible.length > 0) {
    return NextResponse.json(
      { error: 'Customer and Guest cannot be added to teams' },
      { status: 400 }
    )
  }

  const existing = await findBy(teamMembers, { teamId })
  const existingUserIds = new Set(existing.map((e) => e.userId))
  const newUserIds = userIds.filter((uid: string) => !existingUserIds.has(uid))

  if (newUserIds.length === 0) {
    return NextResponse.json({ error: 'All selected users are already members', added: 0 }, { status: 400 })
  }

  for (const userId of newUserIds as string[]) {
    await insertIgnore(teamMembers, { teamId, userId, role })
  }

  const memberDocs = await findBy(teamMembers, { teamId: teamId })
  const memberUsers = await getManyMap(users, memberDocs.map((m) => m.userId))
  const rows = memberDocs.map((member) => ({ member, user: memberUsers.get(member.userId) ?? null }))

  const result = rows.map((r) => ({
    id: r.member.id,
    team_id: r.member.teamId,
    user_id: r.member.userId,
    role: r.member.role ?? 'member',
    joined_at: r.member.joinedAt ? new Date(r.member.joinedAt).toISOString() : '',
    user_name: r.user?.fullName || r.user?.email || 'Unknown',
    user_email: r.user?.email ?? undefined,
    user_avatar_url: r.user?.avatarUrl ?? null,
  }))

  return NextResponse.json({ added: newUserIds.length, members: result })
}
