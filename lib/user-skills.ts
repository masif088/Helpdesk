/** Agent skills: short free-form labels on a user (e.g. "WordPress", "Billing"), used to group agents. Client-safe. */

export const MAX_SKILLS = 30
export const MAX_SKILL_LENGTH = 40

/**
 * Clean a skills list: trimmed, single spaces, no duplicates (case-insensitive). When a skill already
 * exists in `known` with another casing, that spelling is kept so "wordpress" and "WordPress" stay one group.
 */
export function normalizeSkills(input: unknown, known: string[] = []): string[] {
  if (!Array.isArray(input)) return []
  const canonical = new Map(known.map((k) => [k.toLowerCase(), k]))
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const skill = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_LENGTH)
    const key = skill.toLowerCase()
    if (!skill || seen.has(key)) continue
    seen.add(key)
    out.push(canonical.get(key) ?? skill)
    if (out.length >= MAX_SKILLS) break
  }
  return out
}

/** Every skill in use with how many people have it, most common first. */
export function skillCounts(rows: { skills?: string[] | null }[]): { skill: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) for (const s of r.skills ?? []) counts.set(s, (counts.get(s) ?? 0) + 1)
  return [...counts.entries()].map(([skill, count]) => ({ skill, count })).sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill))
}
