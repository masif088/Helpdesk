import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { apiTokens, get, remove } from '@/lib/fsdb'

/** DELETE /api/auth/tokens/[id] - Delete API token */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const existing = await get(apiTokens, id)
  const deleted = existing && existing.userId === session.user.id ? await remove(apiTokens, id) : null

  if (!deleted) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
