'use client'

import { useEffect, useRef } from 'react'

import { signOut, useSession } from '@/lib/auth-client'

/**
 * When the server marks the JWT invalid (inactive/deleted user), session.error is set.
 * The provider may still report "authenticated" briefly — force signOut and clear the cookie.
 */
export default function SessionAccessGuard() {
  const { data: session, status } = useSession()
  const fired = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || !session?.error) {
      fired.current = false
      return
    }
    if (session.error !== 'AccessRevoked' || fired.current) return
    fired.current = true
    void signOut({ callbackUrl: '/login?reason=session_ended' })
  }, [session?.error, status])

  return null
}
