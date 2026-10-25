import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'

/** Mark one or more notification docs as read (Admin SDK). */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []

  if (ids.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const db = getFirebaseAdminFirestore()
  if (!db) {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
  }

  const uid = String(session.user.id).trim()
  const batch = db.batch()
  const unique = [...new Set(ids)].slice(0, 100)

  for (const id of unique) {
    const ref = db.collection('users').doc(uid).collection('ticketNotifications').doc(id)
    batch.update(ref, {
      read: true,
      readAt: FieldValue.serverTimestamp(),
    })
  }

  try {
    await batch.commit()
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
