import { getAuth } from 'firebase-admin/auth'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getFirebaseAdminApp } from '@/lib/firebase/admin'

/** Returns a Firebase custom token so the client can sign in with uid = app user id (Firestore rules). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const app = getFirebaseAdminApp()
  if (!app) {
    return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 })
  }

  try {
    const token = await getAuth(app).createCustomToken(session.user.id)
    return NextResponse.json({ token })
  } catch (e) {
    console.error('[firebase/custom-token]', e)
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
  }
}
