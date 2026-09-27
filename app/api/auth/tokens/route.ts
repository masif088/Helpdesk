import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { apiTokens, find } from '@/lib/fsdb'

/** GET /api/auth/tokens - List API tokens for current user */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await find(apiTokens, {
    where: [['userId', '==', session.user.id]],
    orderBy: [['createdAt', 'desc']],
  })

  const tokens = rows.map((r) => ({
    id: r.id,
    token: r.token,
    name: r.name,
    last_used_at: r.lastUsedAt?.toISOString() ?? null,
    expires_at: r.expiresAt?.toISOString() ?? null,
    is_active: r.isActive ?? true,
    created_at: r.createdAt.toISOString(),
  }))

  return NextResponse.json({ tokens })
}
