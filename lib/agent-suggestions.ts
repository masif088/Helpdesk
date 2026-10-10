/**
 * Who should take a ticket: the skills it needs come from its type and its tags (Settings → Ticket types / Tags),
 * agents are ranked by how many of those skills they have, then by who has the lightest plate right now.
 * Without any required skill the ranking is just the lightest plate (within the ticket's team when it has one).
 */
import { type AgentWorkload, loadAgentWorkload } from '@/lib/agent-workload'
import { find, get, tags, ticketAssignees, tickets, ticketTags, ticketTypes } from '@/lib/fsdb'

export type SuggestedAgent = Pick<AgentWorkload, 'userId' | 'name' | 'email' | 'avatarUrl' | 'skills' | 'open' | 'overdue' | 'active'> & {
  /** Required skills this agent has */
  matched: string[]
  inTeam: boolean
  alreadyAssigned: boolean
}

export type TicketSuggestions = { requiredSkills: string[]; agents: SuggestedAgent[] }

const key = (s: string) => s.trim().toLowerCase()

/** Skills a set of ticket types / tags ask for, one spelling per skill. */
export function mergeRequiredSkills(lists: (string[] | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const list of lists) for (const s of list ?? []) if (!seen.has(key(s))) seen.set(key(s), s)
  return [...seen.values()]
}

export function rankAgents(
  agents: AgentWorkload[],
  required: string[],
  ctx: { teamId: string | null; assignedIds: Set<string> }
): SuggestedAgent[] {
  const need = new Set(required.map(key))
  return agents
    .map((a) => ({
      userId: a.userId,
      name: a.name,
      email: a.email,
      avatarUrl: a.avatarUrl,
      skills: a.skills,
      open: a.open,
      overdue: a.overdue,
      active: a.active,
      matched: a.skills.filter((s) => need.has(key(s))),
      inTeam: !!ctx.teamId && a.teamIds.includes(ctx.teamId),
      alreadyAssigned: ctx.assignedIds.has(a.userId),
    }))
    .sort(
      (a, b) =>
        Number(a.alreadyAssigned) - Number(b.alreadyAssigned) ||
        b.matched.length - a.matched.length ||
        Number(b.inTeam) - Number(a.inTeam) ||
        a.active - b.active ||
        a.overdue - b.overdue ||
        a.name.localeCompare(b.name)
    )
}

export async function suggestAgentsForTicket(ticketId: number, limit = 5): Promise<TicketSuggestions | null> {
  const ticket = await get(tickets, ticketId)
  if (!ticket) return null
  const [type, tagLinks, assigned, workload] = await Promise.all([
    ticket.typeId != null ? get(ticketTypes, ticket.typeId) : Promise.resolve(null),
    find(ticketTags, { where: [['ticketId', '==', ticketId]] }),
    find(ticketAssignees, { where: [['ticketId', '==', ticketId]] }),
    loadAgentWorkload(),
  ])
  const tagRows = tagLinks.length ? await find(tags, { where: [['id', 'in', tagLinks.map((l) => l.tagId)]] }) : []
  const requiredSkills = mergeRequiredSkills([type?.requiredSkills, ...tagRows.map((t) => t.requiredSkills)])
  const ranked = rankAgents(workload.agents, requiredSkills, { teamId: ticket.teamId, assignedIds: new Set(assigned.map((a) => a.userId)) })
  // With required skills, people without any of them are not suggestions
  const agents = (requiredSkills.length ? ranked.filter((a) => a.matched.length > 0 || a.alreadyAssigned) : ranked).slice(0, limit)
  return { requiredSkills, agents }
}
