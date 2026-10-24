import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager, isInternalUser } from '@/lib/auth-utils'
import { cannedProblem, type CannedScope, cleanShortcut, rankCanned, visibleTo } from '@/lib/canned-responses'
import { cannedResponses, find, insert } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

/** The JSON form of a stored reply, as the agent sees it. `can_edit` says whether the buttons to change it are shown. */
export function cannedToJson(r: typeof cannedResponses.$inferSelect, userId: string, manager: boolean) {
  return {
    id: r.id,
    title: r.title,
    shortcut: r.shortcut ?? '',
    content: r.content,
    scope: r.scope,
    owner_id: r.ownerId,
    usage_count: r.usageCount,
    can_edit: r.scope === 'shared' ? manager : r.ownerId === userId,
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }
}

/** GET /api/canned-responses?q= — the replies this agent may use (shared ones and their own), most used first. */
export async function GET(request: Request) {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isInternalUser(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const rows = (await find(cannedResponses)).filter((r) => visibleTo(r, user.id!))
  const manager = isAdminOrManager(user.role)
  return NextResponse.json(rankCanned(rows, q).map((r) => cannedToJson(r, user.id!, manager)))
}

/** POST /api/canned-responses { title, content (HTML), shortcut?, scope } — a shared reply needs an admin or manager. */
export async function POST(request: Request) {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isInternalUser(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as { title?: unknown; content?: unknown; shortcut?: unknown; scope?: unknown }
  const problem = cannedProblem(b)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const scope: CannedScope = b.scope === 'shared' ? 'shared' : 'personal'
  if (scope === 'shared' && !isAdminOrManager(user.role)) return NextResponse.json({ error: 'Only an admin or manager can add a shared reply' }, { status: 403 })
  const row = await insert(cannedResponses, {
    title: String(b.title).trim(),
    content: String(b.content),
    shortcut: cleanShortcut(b.shortcut) || null,
    scope,
    ownerId: user.id,
  })
  return NextResponse.json(cannedToJson(row, user.id, isAdminOrManager(user.role)), { status: 201 })
}
