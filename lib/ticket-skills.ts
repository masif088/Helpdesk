/**
 * Which skills a ticket needs, in order of precedence:
 *   1. the ticket's own (Attributes → Skills needed)
 *   2. its client's skills for the ticket's type (Company → Skills)
 *   3. the default skills of its type and tags (Settings → Ticket types / Tags)
 * Pure functions (no database), shared by suggestions, auto-assign and the workload report.
 */

export type SkillSource = 'ticket' | 'client' | 'default'

const key = (s: string) => s.trim().toLowerCase()

/** One list out of several: trimmed, no duplicates (case-insensitive), first spelling wins. */
export function mergeSkills(lists: (string[] | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const list of lists) for (const s of list ?? []) if (s && s.trim() && !seen.has(key(s))) seen.set(key(s), s.trim())
  return [...seen.values()]
}

/** A client's skills per ticket type, keyed by ticket type id */
export type SkillsByType = Record<string, string[]>

export function resolveSkills(p: {
  own?: string[] | null
  clientByType?: SkillsByType | null
  typeId: number | null
  typeDefaults?: string[] | null
  tagDefaults?: (string[] | null | undefined)[]
}): { skills: string[]; source: SkillSource | null } {
  const own = mergeSkills([p.own])
  if (own.length) return { skills: own, source: 'ticket' }
  const client = p.typeId != null ? mergeSkills([p.clientByType?.[String(p.typeId)]]) : []
  if (client.length) return { skills: client, source: 'client' }
  const fallback = mergeSkills([p.typeDefaults, ...(p.tagDefaults ?? [])])
  return fallback.length ? { skills: fallback, source: 'default' } : { skills: [], source: null }
}
