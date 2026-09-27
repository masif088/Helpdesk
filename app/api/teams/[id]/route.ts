import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessTeams, canAdminTeams } from '@/lib/auth-utils'
import { deleteTeamCascade, findBy, get, getByKey, getManyMap, type Patch, teamMembers, teams, update, users } from '@/lib/fsdb'
import { normalizeTeamVisibilityBody } from '@/lib/team-type'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

function sessionRole(session: { user?: { role?: string; id?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** PATCH /api/teams/[id] - Update team (name/type: admin only; created_by: admin only, must be existing member) */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const body = await request.json()
  const { name, type, created_by: createdByBody } = body

  if (!canAdminTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const values: Record<string, unknown> = {}
  if (name !== undefined) values.name = typeof name === 'string' ? name.trim() : null
  if (type !== undefined) {
    const visibility = normalizeTeamVisibilityBody(type)
    if (!visibility) {
      return NextResponse.json({ error: 'type must be public or private' }, { status: 400 })
    }
    values.type = visibility
  }

  if (createdByBody !== undefined && createdByBody !== null) {
    if (typeof createdByBody !== 'string') {
      return NextResponse.json({ error: 'created_by must be a user id' }, { status: 400 })
    }
    const memberRow = await getByKey(teamMembers, { teamId: id, userId: createdByBody })
    if (!memberRow) {
      return NextResponse.json({ error: 'New creator must be a member of this team' }, { status: 400 })
    }
    values.createdBy = createdByBody
  }

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await update(teams, id, values as Patch<typeof teams.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  revalidateTicketsLookupCatalog()
  const creator = await get(users, updated.createdBy)

  const memberDocs = await findBy(teamMembers, { teamId: id })
  const memberUsers = await getManyMap(users, memberDocs.map((m) => m.userId))
  const members = memberDocs.map((member) => ({ member, user: memberUsers.get(member.userId) ?? null }))

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    type: updated.type,
    created_by: updated.createdBy,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    creator_name: creator?.fullName || creator?.email || 'Unknown',
    member_count: members.length,
    members: members.map((r) => ({
      id: r.member.id,
      team_id: r.member.teamId,
      user_id: r.member.userId,
      role: r.member.role ?? 'member',
      joined_at: r.member.joinedAt ? new Date(r.member.joinedAt).toISOString() : '',
      user_name: r.user?.fullName || r.user?.email || 'Unknown',
      user_email: r.user?.email ?? undefined,
      user_avatar_url: r.user?.avatarUrl ?? null,
    })),
  })
}

/** DELETE /api/teams/[id] - Delete team and its members (admin only) */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAdminTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const deleted = await deleteTeamCascade(id)

  if (!deleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  revalidateTicketsLookupCatalog()
  return NextResponse.json({ success: true })
}
