/**
 * Skills across the app: agents have them (users.skills), ticket types and tags carry default skills, tickets carry
 * the skills they need. This reads the whole picture and changes a skill everywhere at once (rename / merge, delete,
 * who has it). Skills are matched case-insensitively; the spelling already in use wins.
 */
import { find, tags, tickets, ticketTypes, update, users } from '@/lib/fsdb'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import { MAX_SKILL_LENGTH, normalizeSkills } from '@/lib/user-skills'

const key = (s: string) => s.trim().toLowerCase()

export type SkillOverview = {
  skill: string
  agents: { id: string; name: string }[]
  types: { id: number; title: string }[]
  tags: { id: string; name: string }[]
  /** Tickets that name it themselves: open / all */
  openTickets: number
  allTickets: number
}

export type SkillsOverview = {
  skills: SkillOverview[]
  /** Internal users, for picking who has a skill */
  agents: { id: string; name: string; email: string; skills: string[] }[]
}

const isAgent = (u: { role: string | null; status: string; deletedAt: Date | null }) =>
  !u.deletedAt && u.status === 'active' && !!u.role && u.role.toLowerCase() !== 'customer'

export async function loadSkillsOverview(): Promise<SkillsOverview> {
  const [userRows, typeRows, tagRows, ticketRows] = await Promise.all([
    find(users, { select: ['id', 'email', 'fullName', 'role', 'status', 'skills', 'deletedAt'] }),
    find(ticketTypes, { select: ['id', 'title', 'requiredSkills'] }),
    find(tags, { select: ['id', 'name', 'requiredSkills'] }),
    find(tickets, { select: ['id', 'status', 'ticketType', 'requiredSkills'] }),
  ])
  const map = new Map<string, SkillOverview>()
  const row = (skill: string) => {
    let r = map.get(key(skill))
    if (!r) {
      r = { skill, agents: [], types: [], tags: [], openTickets: 0, allTickets: 0 }
      map.set(key(skill), r)
    }
    return r
  }
  // Agents first: their spelling is the one shown
  const agents = userRows.filter(isAgent).map((u) => ({ id: u.id, name: u.fullName || u.email, email: u.email, skills: u.skills ?? [] }))
  for (const a of agents) for (const s of a.skills) row(s).agents.push({ id: a.id, name: a.name })
  for (const t of typeRows) for (const s of t.requiredSkills ?? []) row(s).types.push({ id: t.id, title: t.title })
  for (const t of tagRows) for (const s of t.requiredSkills ?? []) row(s).tags.push({ id: t.id, name: t.name })
  for (const t of ticketRows) {
    for (const s of t.requiredSkills ?? []) {
      const r = row(s)
      r.allTickets++
      if ((t.ticketType ?? 'support') === 'support' && !isClosedLikeTicketStatus(t.status)) r.openTickets++
    }
  }
  return {
    skills: [...map.values()].sort((a, b) => b.agents.length - a.agents.length || a.skill.localeCompare(b.skill)),
    agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

function clean(skill: unknown): string {
  return String(skill ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_LENGTH)
}

/** Replace / drop one skill in a list, keeping the others and removing duplicates. */
function rewrite(list: string[] | null | undefined, from: string, to: string | null): string[] | null {
  if (!list || !list.some((s) => key(s) === key(from))) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of list) {
    const next = key(s) === key(from) ? to : s
    if (!next || seen.has(key(next))) continue
    seen.add(key(next))
    out.push(next)
  }
  return out
}

/** Rename `from` to `to` everywhere; when `to` already exists the two merge. Returns how many records changed. */
export async function renameSkill(fromRaw: unknown, toRaw: unknown): Promise<{ changed: number; skill: string }> {
  const from = clean(fromRaw)
  const requested = clean(toRaw)
  if (!from || !requested) throw new Error('Both names are required')
  const overview = await loadSkillsOverview()
  // Merging into a skill that exists under another casing keeps its spelling
  const existing = overview.skills.find((s) => key(s.skill) === key(requested) && key(s.skill) !== key(from))
  const to = existing?.skill ?? normalizeSkills([requested])[0]
  if (key(to) === key(from) && to === overview.skills.find((s) => key(s.skill) === key(from))?.skill) return { changed: 0, skill: to }
  return { changed: await applyEverywhere(from, to), skill: to }
}

export async function deleteSkill(skillRaw: unknown): Promise<{ changed: number }> {
  const skill = clean(skillRaw)
  if (!skill) throw new Error('Skill is required')
  return { changed: await applyEverywhere(skill, null) }
}

async function applyEverywhere(from: string, to: string | null): Promise<number> {
  const [userRows, typeRows, tagRows, ticketRows] = await Promise.all([
    find(users, { select: ['id', 'skills'] }),
    find(ticketTypes, { select: ['id', 'requiredSkills'] }),
    find(tags, { select: ['id', 'requiredSkills'] }),
    find(tickets, { select: ['id', 'requiredSkills'] }),
  ])
  let changed = 0
  const now = new Date()
  for (const u of userRows) {
    const next = rewrite(u.skills, from, to)
    if (next) {
      await update(users, u.id, { skills: next, updatedAt: now })
      changed++
    }
  }
  for (const t of typeRows) {
    const next = rewrite(t.requiredSkills, from, to)
    if (next) {
      await update(ticketTypes, t.id, { requiredSkills: next, updatedAt: now })
      changed++
    }
  }
  for (const t of tagRows) {
    const next = rewrite(t.requiredSkills, from, to)
    if (next) {
      await update(tags, t.id, { requiredSkills: next, updatedAt: now })
      changed++
    }
  }
  for (const t of ticketRows) {
    const next = rewrite(t.requiredSkills, from, to)
    if (next) {
      await update(tickets, t.id, { requiredSkills: next })
      changed++
    }
  }
  return changed
}

/** Make exactly these agents the ones who have `skill` (adds it to the new ones, removes it from the rest). */
export async function setSkillAgents(skillRaw: unknown, userIds: string[]): Promise<{ added: number; removed: number; skill: string }> {
  const requested = clean(skillRaw)
  if (!requested) throw new Error('Skill is required')
  const overview = await loadSkillsOverview()
  const skill = overview.skills.find((s) => key(s.skill) === key(requested))?.skill ?? normalizeSkills([requested])[0]
  const want = new Set(userIds)
  let added = 0
  let removed = 0
  for (const a of overview.agents) {
    const has = a.skills.some((s) => key(s) === key(skill))
    if (want.has(a.id) && !has) {
      await update(users, a.id, { skills: normalizeSkills([...a.skills, skill], overview.skills.map((s) => s.skill)), updatedAt: new Date() })
      added++
    } else if (!want.has(a.id) && has) {
      await update(users, a.id, { skills: a.skills.filter((s) => key(s) !== key(skill)), updatedAt: new Date() })
      removed++
    }
  }
  return { added, removed, skill }
}
