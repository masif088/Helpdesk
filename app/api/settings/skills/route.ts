import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isAdminOrManager } from '@/lib/auth-utils'
import { deleteSkill, loadSkillsOverview, renameSkill, setSkillAgents } from '@/lib/skills-admin'

async function gate() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = denyUnless(session.user, isAdminOrManager)
  return denied ? { error: denied } : {}
}

/** GET /api/settings/skills — every skill with who has it, where it is a default, and the tickets that name it. Admin / manager. */
export async function GET() {
  const g = await gate()
  if (g.error) return g.error
  return NextResponse.json(await loadSkillsOverview())
}

/**
 * POST /api/settings/skills — change a skill everywhere. Admin / manager.
 *   { action: 'rename', from, to }        rename (or merge into an existing skill)
 *   { action: 'delete', skill }           remove from agents, types, tags and tickets
 *   { action: 'set_agents', skill, user_ids }  exactly these agents have it (new skills are created this way)
 */
export async function POST(request: Request) {
  const g = await gate()
  if (g.error) return g.error
  const b = (await request.json().catch(() => ({}))) as { action?: string; from?: unknown; to?: unknown; skill?: unknown; user_ids?: unknown }
  try {
    if (b.action === 'rename') return NextResponse.json(await renameSkill(b.from, b.to))
    if (b.action === 'delete') return NextResponse.json(await deleteSkill(b.skill))
    if (b.action === 'set_agents') {
      const ids = Array.isArray(b.user_ids) ? b.user_ids.filter((x): x is string => typeof x === 'string') : []
      return NextResponse.json(await setSkillAgents(b.skill, ids))
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 })
  }
}
