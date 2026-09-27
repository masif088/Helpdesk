import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { emailIntegrations, updateWhere } from '@/lib/fsdb'

/** POST /api/email/disconnect - Disconnect Google email integration */
export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [row] = await updateWhere(emailIntegrations, [['provider', '==', 'google']], {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    isActive: false,
    emailAddress: null,
    updatedAt: new Date(),
  })

  if (!row) {
    return NextResponse.json({ error: 'No integration to disconnect' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
