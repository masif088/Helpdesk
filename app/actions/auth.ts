'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { SESSION_COOKIE_NAME } from '@/lib/firebase/auth-server'

export async function signOutAction() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE_NAME)
  redirect('/login')
}
