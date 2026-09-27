import { NextResponse } from 'next/server'

import type { Session } from '@/auth'
import { auth } from '@/auth'
import { canAccessProjects } from '@/lib/auth-utils'

type ProjectApiOk = { session: Session }
type ProjectApiErr = { error: NextResponse }

export async function requireProjectApiSession(): Promise<ProjectApiOk | ProjectApiErr> {
  const session = (await auth()) as Session | null
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessProjects(role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}
