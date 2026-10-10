import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { loadAgentWorkload } from '@/lib/agent-workload'
import { isAdminOrManager } from '@/lib/auth-utils'
import { find, teams } from '@/lib/fsdb'
import { loadSkillDemand } from '@/lib/skill-demand'

/** GET /api/reports/workload — admin / manager: per agent open tickets, overdue, waiting on client, time tracked this week, skills. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [snapshot, teamRows] = await Promise.all([loadAgentWorkload(), find(teams, { select: ['id', 'name'] })])
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]))
  const demand = await loadSkillDemand(snapshot.agents)
  return NextResponse.json({
    ...snapshot,
    demand,
    agents: snapshot.agents.map(({ teamIds, ...a }) => ({ ...a, teams: teamIds.map((id) => teamName.get(id)).filter((n): n is string => !!n) })),
  })
}
