import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'

const BATCH_MAX = 450

/** Delete all notification documents that are already `read: true` for the logged-in user. */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getFirebaseAdminFirestore()
  if (!db) {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
  }

  const uid = String(session.user.id).trim()
  const col = db.collection('users').doc(uid).collection('ticketNotifications')

  let deleted = 0
  try {
    while (true) {
      const snap = await col.where('read', '==', true).limit(BATCH_MAX).get()
      if (snap.empty) break

      const batch = db.batch()
      for (const d of snap.docs) {
        batch.delete(d.ref)
      }
      await batch.commit()
      deleted += snap.size
      if (snap.size < BATCH_MAX) break
    }

    return NextResponse.json({ ok: true, deleted })
  } catch {
    return NextResponse.json({ error: 'Failed to delete', deleted }, { status: 500 })
  }
}
