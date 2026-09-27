import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessMessageTemplates } from '@/lib/auth-utils'
import { find, messageTemplates } from '@/lib/fsdb'
import { ensureDefaultMessageTemplates } from '@/lib/message-templates-defaults'

function rowToJson(r: (typeof messageTemplates.$inferSelect)[]) {
  return r.map((row) => ({
    id: row.id,
    type: row.type,
    group: row.templateGroup,
    title: row.title,
    key: row.key,
    status: row.status,
    content: row.content ?? null,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  }))
}

/** GET /api/message-templates — admin only; all seeded templates */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessMessageTemplates(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await find(messageTemplates, {
    orderBy: [['templateGroup', 'asc'], ['type', 'asc'], ['title', 'asc']],
  })

  return NextResponse.json(rowToJson(rows))
}

/** POST /api/message-templates — create the default templates that are missing (keys the app sends). */
export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessMessageTemplates((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const created = await ensureDefaultMessageTemplates()
  return NextResponse.json({ created })
}
