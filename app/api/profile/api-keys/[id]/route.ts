import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { revokeApiKey } from '@/lib/api-keys'

/** DELETE /api/profile/api-keys/[id]: revoke one of your own keys. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ok = await revokeApiKey(id, session.user.id)
  return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
}
