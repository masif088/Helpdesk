import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager, isInternalUser } from '@/lib/auth-utils'
import { cannedProblem, cleanShortcut, mayEdit } from '@/lib/canned-responses'
import { cannedResponses, get, remove, update } from '@/lib/fsdb'

import { cannedToJson } from '../route'

async function load(params: Promise<{ id: string }>) {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  if (!isInternalUser(user.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const
  const { id } = await params
  const row = await get(cannedResponses, id)
  if (!row) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const
  const manager = isAdminOrManager(user.role)
  // a personal reply of somebody else does not exist as far as this agent can tell
  if (row.scope !== 'shared' && row.ownerId !== user.id) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const
  if (!mayEdit(row, user.id, manager)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const
  return { user: user as { id: string; role?: string }, row, manager } as const
}

/** PATCH /api/canned-responses/:id { title?, content?, shortcut? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await load(params)
  if ('error' in g) return g.error
  const b = (await request.json().catch(() => ({}))) as { title?: unknown; content?: unknown; shortcut?: unknown }
  const next = { title: b.title ?? g.row.title, content: b.content ?? g.row.content }
  const problem = cannedProblem(next)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const row = await update(cannedResponses, g.row.id, {
    title: String(next.title).trim(),
    content: String(next.content),
    shortcut: b.shortcut === undefined ? g.row.shortcut : cleanShortcut(b.shortcut) || null,
    updatedAt: new Date(),
  })
  return NextResponse.json(cannedToJson(row!, g.user.id, g.manager))
}

/** DELETE /api/canned-responses/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await load(params)
  if ('error' in g) return g.error
  await remove(cannedResponses, g.row.id)
  return NextResponse.json({ ok: true })
}
