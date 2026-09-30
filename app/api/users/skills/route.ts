import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isInternalUser } from '@/lib/auth-utils'
import { find, users } from '@/lib/fsdb'
import { skillCounts } from '@/lib/user-skills'

/** GET /api/users/skills — every skill in use by internal users, with how many people have it (for suggestions and grouping). */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = denyUnless(session.user, isInternalUser)
  if (denied) return denied
  const rows = await find(users, { select: ['role', 'skills', 'deletedAt'] })
  return NextResponse.json(skillCounts(rows.filter((u) => !u.deletedAt && (u.role ?? '').toLowerCase() !== 'customer')))
}
