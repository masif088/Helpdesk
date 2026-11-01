/** Which tickets a staff member may see: admins and managers all of them; others those without a team, of public teams, or of their own teams. */
import { find, findBy, teamMembers, teams, type TicketsRow } from '@/lib/fsdb'

export async function staffTicketPredicate(userId: string, isManager: boolean): Promise<(t: Pick<TicketsRow, 'teamId'>) => boolean> {
  if (isManager) return () => true
  const [memberships, publicTeams] = await Promise.all([findBy(teamMembers, { userId }), find(teams, { where: [['type', '==', 'public']] })])
  const visible = new Set([...memberships.map((m) => m.teamId), ...publicTeams.map((t) => t.id)])
  return (t) => !t.teamId || visible.has(t.teamId)
}
