import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { setUserPassword } from '@/lib/app-users'
import { signInWithEmailPassword } from '@/lib/firebase/auth-server'
import { get, users } from '@/lib/fsdb'

/** POST /api/auth/change-password - Change user password */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword required' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
  }

  const user = await get(users, session.user.id)
  if (!user) {
    return NextResponse.json({ error: 'Password not set for this account' }, { status: 400 })
  }

  const check = await signInWithEmailPassword(user.email, currentPassword)
  if (!check.ok) {
    if (check.code === 'INVALID_CREDENTIALS') {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Could not verify current password' }, { status: 503 })
  }

  // Revoking sessions forces a fresh login with the new password (the client signs in again).
  await setUserPassword(user, newPassword, { mustChangePassword: false, revokeSessions: true })

  return NextResponse.json({ success: true })
}
