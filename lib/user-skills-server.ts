import { find, users } from '@/lib/fsdb'
import { skillCounts } from '@/lib/user-skills'

/** Skills agents already have (their spelling wins when a new list uses another casing). */
export async function knownSkills(): Promise<string[]> {
  return skillCounts(await find(users, { select: ['skills'] })).map((s) => s.skill)
}
