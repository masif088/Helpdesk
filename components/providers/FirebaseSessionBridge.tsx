'use client'

import { getAuth, signInWithCustomToken, signOut as firebaseSignOut } from 'firebase/auth'
import { useEffect, useRef } from 'react'

import { useSession } from '@/lib/auth-client'
import { getFirebaseApp, isFirebaseClientConfigured } from '@/lib/firebase/client'

/**
 * After the app session exists, signs the browser into Firebase Auth with a custom token (same uid as app user)
 * so Firestore listeners and security rules work without Firebase password login.
 */
export default function FirebaseSessionBridge() {
  const { data: session, status } = useSession()
  const lastSyncedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!isFirebaseClientConfigured()) return

    const app = getFirebaseApp()
    if (!app) return

    const auth = getAuth(app)

    if (status !== 'authenticated' || !session?.user?.id) {
      lastSyncedUserId.current = null
      void firebaseSignOut(auth).catch(() => {})
      return
    }

    const uid = session.user.id
    if (lastSyncedUserId.current === uid && auth.currentUser?.uid === uid) {
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        if (auth.currentUser && auth.currentUser.uid !== uid) {
          await firebaseSignOut(auth)
        }
        const res = await fetch('/api/firebase/custom-token', { credentials: 'include' })
        if (!res.ok) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[FirebaseSessionBridge] custom-token failed', res.status, await res.text().catch(() => ''))
          }
          return
        }
        const data = (await res.json()) as { token?: string }
        if (cancelled || !data.token) return
        await signInWithCustomToken(auth, data.token)
        if (!cancelled) lastSyncedUserId.current = uid
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[FirebaseSessionBridge]', e)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id, status])

  return null
}
