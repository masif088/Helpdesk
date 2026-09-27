import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessAiSettings } from '@/lib/auth-utils'
import { aiSettings, get, update, updateWhere } from '@/lib/fsdb'

/** POST /api/ai-settings/:id/activate — set this row as active, deactivate all others */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessAiSettings((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const target = await get(aiSettings, id)
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Deactivate all others, then activate target
  await updateWhere(aiSettings, [['isActive', '==', true]], { isActive: false })
  await update(aiSettings, id, { isActive: true, updatedAt: new Date(), updatedBy: session.user.id })

  return NextResponse.json({ ok: true })
}
