/**
 * Who should take a ticket: the skills it needs are the ticket's own (Attributes → Skills needed); when it has none,
 * the default skills of its type and tags (Settings → Ticket types / Tags). Agents are ranked by how many of those
 * skills they have, then by who has the lightest plate right now.
 * Without any required skill the ranking is just the lightest plate (within the ticket's team when it has one).
 */
import { type AgentWorkload, loadAgentWorkload } from '@/lib/agent-workload'
import { companies, find, get, tags, ticketAssignees, tickets, ticketTags, ticketTypes } from '@/lib/fsdb'
import { mergeSkills, resolveSkills, type SkillSource } from '@/lib/ticket-skills'

export type SuggestedAgent = Pick<AgentWorkload, 'userId' | 'name' | 'email' | 'avatarUrl' | 'skills' | 'open' | 'overdue' | 'active'> & {
  /** Required skills this agent has */
  matched: string[]
  /** matched / required skills, 0-100; null when the ticket needs no skill */
  matchPercent: number | null
  inTeam: boolean
  alreadyAssigned: boolean
}

export type TicketSuggestions = {
  requiredSkills: string[]
  /** 'ticket' = set on the ticket, 'client' = the client's skills for its type, 'default' = from its type / tags, null = none */
  source: SkillSource | null
  agents: SuggestedAgent[]
}

const key = (s: string) => s.trim().toLowerCase()

/** Skills a set of ticket types / tags ask for, one spelling per skill. */
export const mergeRequiredSkills = mergeSkills

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
      matchPercent: need.size ? Math.round((new Set(a.skills.map(key).filter((k) => need.has(k))).size / need.size) * 100) : null,
      inTeam: !!ctx.teamId && a.teamIds.includes(ctx.teamId),
      alreadyAssigned: ctx.assignedIds.has(a.userId),
    }))
    .sort(
      (a, b) =>
        Number(a.alreadyAssigned) - Number(b.alreadyAssigned) ||
        (b.matchPercent ?? 0) - (a.matchPercent ?? 0) ||
        Number(b.inTeam) - Number(a.inTeam) ||
        a.active - b.active ||
        a.overdue - b.overdue ||
        a.name.localeCompare(b.name)
    )
}

/** `skillsOverride`: the skills currently chosen in the form (not saved yet) */
export async function suggestAgentsForTicket(ticketId: number, limit = 5, skillsOverride?: string[]): Promise<TicketSuggestions | null> {
  const ticket = await get(tickets, ticketId)
  if (!ticket) return null
  const [type, company, tagLinks, assigned, workload] = await Promise.all([
    ticket.typeId != null ? get(ticketTypes, ticket.typeId) : Promise.resolve(null),
    ticket.companyId ? get(companies, ticket.companyId) : Promise.resolve(null),
    find(ticketTags, { where: [['ticketId', '==', ticketId]] }),
    find(ticketAssignees, { where: [['ticketId', '==', ticketId]] }),
    loadAgentWorkload(),
  ])
  const tagRows = tagLinks.length ? await find(tags, { where: [['id', 'in', tagLinks.map((l) => l.tagId)]] }) : []
  const { skills: requiredSkills, source } = resolveSkills({
    own: skillsOverride ?? ticket.requiredSkills,
    clientByType: company?.skillsByType,
    typeId: ticket.typeId,
    typeDefaults: type?.requiredSkills,
    tagDefaults: tagRows.map((t) => t.requiredSkills),
  })
  const ranked = rankAgents(workload.agents, requiredSkills, { teamId: ticket.teamId, assignedIds: new Set(assigned.map((a) => a.userId)) })
  // With required skills, people without any of them are not suggestions
  const agents = (requiredSkills.length ? ranked.filter((a) => a.matched.length > 0 || a.alreadyAssigned) : ranked).slice(0, limit)
  return { requiredSkills, source, agents }
}

/**
 * The agent an automation rule should assign: the best-ranked one whose skill match reaches `minMatch` percent
 * (100 = has every skill the ticket needs). Nothing is assigned when the ticket needs no skills.
 */
export async function pickAutoAssignee(
  ticketId: number,
  opts: { minMatch: number; teamOnly?: boolean }
): Promise<{ agent: SuggestedAgent; requiredSkills: string[] } | null> {
  const r = await suggestAgentsForTicket(ticketId, 100)
  if (!r || r.requiredSkills.length === 0) return null
  const ticket = await get(tickets, ticketId)
  const restrictToTeam = !!opts.teamOnly && !!ticket?.teamId
  const agent = r.agents.find((a) => !a.alreadyAssigned && (a.matchPercent ?? 0) >= opts.minMatch && (!restrictToTeam || a.inTeam))
  return agent ? { agent, requiredSkills: r.requiredSkills } : null
}
