import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessTeams, canAdminTeams } from '@/lib/auth-utils'
import { get, remove, teamMembers, teams } from '@/lib/fsdb'

function sessionRole(session: { user?: { role?: string; id?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** DELETE /api/teams/[id]/members/[memberId] - Remove member (admin or team creator; not the creator user) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: teamId, memberId } = await params
  if (!teamId || !memberId) {
    return NextResponse.json({ error: 'Team ID and Member ID required' }, { status: 400 })
  }

  const member = await get(teamMembers, memberId)
  const memberRow = member && member.teamId === teamId ? member : null
  if (!memberRow) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const teamRow = await get(teams, teamId)
  if (!teamRow) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const role = sessionRole(session)
  const uid = session.user.id
  if (!canAdminTeams(role) && uid !== teamRow.createdBy) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (memberRow.userId === teamRow.createdBy) {
    return NextResponse.json(
      { error: 'Cannot remove the team creator. Transfer creator to another member first.' },
      { status: 400 }
    )
  }

  const deleted = await remove(teamMembers, memberId)

  if (!deleted) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
