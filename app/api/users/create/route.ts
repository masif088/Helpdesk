import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { createAppUser, findUserByEmail } from '@/lib/app-users'
import { logUserCreated, userRowToLogSnapshot } from '@/lib/system-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** POST /api/users/create - Create user (replaces Supabase Auth) */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { email, password, full_name, role, status } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
  }

  const row = await createAppUser({
    email,
    password,
    fullName: full_name || null,
    role: role || 'user',
    status: status || 'active',
  })

  if (!row) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  await logUserCreated({
    actorUserId: session.user.id ?? null,
    actorRole: (session.user as { role?: string }).role,
    createdUserId: row.id,
    snapshot: userRowToLogSnapshot(row),
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    success: true,
    data: {
      id: row.id,
      email: row.email,
      full_name: row.fullName,
      role: row.role,
      status: row.status,
    },
  })
}
