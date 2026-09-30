import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamDetailContent from '@/components/content/team/TeamDetailContent'
import { canAccessTeams } from '@/lib/auth-utils'
import { find, get, getManyMap, teamMembers, teams, users } from '@/lib/fsdb'

export default async function SettingsTeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessTeams((session.user as { role?: string }).role)) redirect('/dashboard')

  const { id } = await params

  const teamDoc = await get(teams, id)
  if (!teamDoc) redirect('/settings/teams')
  const teamRow = { team: teamDoc, creator: await get(users, teamDoc.createdBy) }

  const memberDocs = await find(teamMembers, { where: [['teamId', '==', id]], orderBy: [['joinedAt', 'asc']] })
  const memberUsers = await getManyMap(users, memberDocs.map((m) => m.userId))
  const membersRows = memberDocs.map((member) => ({ member, user: memberUsers.get(member.userId) ?? null }))

  const members = membersRows.map((m) => ({
    id: m.member.id,
    team_id: m.member.teamId,
    user_id: m.member.userId,
    role: m.member.role ?? 'member',
    joined_at: m.member.joinedAt.toISOString(),
    user_name: m.user?.fullName || m.user?.email || 'Unknown',
    user_email: m.user?.email || '',
    user_avatar_url: m.user?.avatarUrl || null,
  }))

  const team = {
    id: teamRow.team.id,
    name: teamRow.team.name,
    type: teamRow.team.type,
    created_by: teamRow.team.createdBy,
    created_at: teamRow.team.createdAt.toISOString(),
    creator_name: teamRow.creator?.fullName || teamRow.creator?.email || 'Unknown',
    members,
  }

  return <TeamDetailContent user={session.user} team={team} />
}
