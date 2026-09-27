import { appSettings, findBy, get, teamMembers, ticketAssignees, type TicketsRow, upsert, users } from '@/lib/fsdb'
import {
  DEFAULT_TICKET_VISIBILITY_RULES,
  parseTicketVisibilityRules,
  TICKET_VISIBILITY_LEVELS,
  type TicketVisibilityRulesMap,
  userMatchesVisibilityRule,
  type VisibilityUserProfile,
} from '@/lib/ticket-visibility'

const SETTINGS_KEY = 'ticket_visibility_rules'

export async function getTicketVisibilityRules(): Promise<TicketVisibilityRulesMap> {
  const row = await get(appSettings, SETTINGS_KEY)
  if (!row?.value) return structuredClone(DEFAULT_TICKET_VISIBILITY_RULES)
  try {
    return parseTicketVisibilityRules(JSON.parse(row.value))
  } catch {
    return structuredClone(DEFAULT_TICKET_VISIBILITY_RULES)
  }
}

export async function setTicketVisibilityRules(rules: TicketVisibilityRulesMap): Promise<void> {
  const normalized = parseTicketVisibilityRules(rules)
  const value = JSON.stringify(normalized)
  await upsert(appSettings, { key: SETTINGS_KEY, value, updatedAt: new Date() })
}

export async function loadVisibilityUserProfile(userId: string): Promise<VisibilityUserProfile | null> {
  const row = await get(users, userId)
  return row ? { role: row.role, department: row.department, position: row.position } : null
}

export type TicketVisibilityRow = Pick<TicketsRow, 'id' | 'visibility' | 'createdBy' | 'teamId'>

/**
 * Access check for non-admin agents: legacy public/private/specific_users/team-membership
 * plus configured visibility levels that match the current user profile.
 */
export async function buildTicketVisibilityPredicate(
  userId: string,
  role: string | undefined
): Promise<(t: TicketVisibilityRow) => boolean> {
  const profile = (await loadVisibilityUserProfile(userId)) ?? {
    role,
    department: null,
    position: null,
  }
  const [rules, assigned, memberships] = await Promise.all([
    getTicketVisibilityRules(),
    findBy(ticketAssignees, { userId }),
    findBy(teamMembers, { userId }),
  ])
  const assignedTicketIds = new Set(assigned.map((a) => a.ticketId))
  const teamIds = new Set(memberships.map((m) => m.teamId))

  const allowedLevels = new Set<string>()
  let teamViaMembership = false
  for (const level of TICKET_VISIBILITY_LEVELS) {
    const rule = rules[level]
    if (level === 'team' && rule.includeTeamMembers) teamViaMembership = true
    if (userMatchesVisibilityRule(profile, rule)) allowedLevels.add(level)
  }

  return (t) => {
    if (t.visibility === 'public') return true
    if (t.visibility === 'private' && t.createdBy === userId) return true
    if (t.visibility === 'specific_users' && assignedTicketIds.has(t.id)) return true
    if (t.visibility === 'team' && teamViaMembership && t.teamId && teamIds.has(t.teamId)) return true
    return allowedLevels.has(t.visibility)
  }
}
