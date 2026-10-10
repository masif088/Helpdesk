/**
 * Demand against supply per skill: how many open support tickets need a skill (the ticket's own skills, else the
 * client's skills for its type, else the default skills of its type and tags), how many of those nobody is assigned to, and who can take them.
 */
import type { AgentWorkload } from '@/lib/agent-workload'
import { companies, find, tags, ticketAssignees, tickets, ticketTags, ticketTypes } from '@/lib/fsdb'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { resolveSkills } from '@/lib/ticket-skills'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export type SkillDemandRow = {
  skill: string
  /** Open tickets that need it */
  tickets: number
  /** ...with nobody assigned */
  unassigned: number
  overdue: number
  /** Agents who have the skill, and what they carry right now */
  agents: number
  agentNames: string[]
  agentsActive: number
}

export type SkillDemand = {
  rows: SkillDemandRow[]
  /** Open tickets with no skill at all (their own, type or tags): nothing can be suggested for them */
  withoutSkills: number
  /** Open tickets whose skills nobody has */
  uncovered: number
}

const key = (s: string) => s.trim().toLowerCase()

export async function loadSkillDemand(agents: AgentWorkload[]): Promise<SkillDemand> {
  const [ticketRows, types, tagRows, links, assignees, companyRows] = await Promise.all([
    find(tickets, { select: ['id', 'status', 'ticketType', 'dueDate', 'typeId', 'companyId', 'requiredSkills'] }),
    find(ticketTypes, { select: ['id', 'requiredSkills'] }),
    find(tags, { select: ['id', 'requiredSkills'] }),
    find(ticketTags, { select: ['ticketId', 'tagId'] }),
    find(ticketAssignees, { select: ['ticketId', 'userId'] }),
    find(companies, { select: ['id', 'skillsByType'] }),
  ])
  const clientSkills = new Map(companyRows.map((c) => [c.id, c.skillsByType ?? null]))
  const typeSkills = new Map(types.map((t) => [t.id, t.requiredSkills ?? []]))
  const tagSkills = new Map(tagRows.map((t) => [t.id, t.requiredSkills ?? []]))
  const tagsByTicket = new Map<number, string[][]>()
  for (const l of links) tagsByTicket.set(l.ticketId, [...(tagsByTicket.get(l.ticketId) ?? []), tagSkills.get(l.tagId) ?? []])
  const assigned = new Set(assignees.map((a) => a.ticketId))

  const byKey = new Map<string, SkillDemandRow>()
  const have = new Map<string, AgentWorkload[]>()
  for (const a of agents) for (const s of a.skills) have.set(key(s), [...(have.get(key(s)) ?? []), a])

  const now = Date.now()
  let withoutSkills = 0
  let uncovered = 0
  for (const t of ticketRows) {
    if ((t.ticketType ?? DEFAULT_TICKET_TYPE) !== DEFAULT_TICKET_TYPE || isClosedLikeTicketStatus(t.status)) continue
    const { skills } = resolveSkills({
      own: t.requiredSkills,
      clientByType: t.companyId ? clientSkills.get(t.companyId) : null,
      typeId: t.typeId,
      typeDefaults: typeSkills.get(t.typeId ?? -1),
      tagDefaults: tagsByTicket.get(t.id) ?? [],
    })
    if (!skills.length) {
      withoutSkills++
      continue
    }
    let anyoneCan = false
    for (const skill of skills) {
      const k = key(skill)
      const people = have.get(k) ?? []
      if (people.length) anyoneCan = true
      const row = byKey.get(k) ?? {
        skill: people[0]?.skills.find((s) => key(s) === k) ?? skill,
        tickets: 0,
        unassigned: 0,
        overdue: 0,
        agents: people.length,
        agentNames: people.map((p) => p.name),
        agentsActive: people.reduce((n, p) => n + p.active, 0),
      }
      row.tickets++
      if (!assigned.has(t.id)) row.unassigned++
      if (t.dueDate && new Date(t.dueDate).getTime() < now) row.overdue++
      byKey.set(k, row)
    }
    if (!anyoneCan) uncovered++
  }

  return {
    rows: [...byKey.values()].sort((a, b) => b.unassigned - a.unassigned || b.tickets - a.tickets || a.skill.localeCompare(b.skill)),
    withoutSkills,
    uncovered,
  }
}
