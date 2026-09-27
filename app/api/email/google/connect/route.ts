import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { createOAuthState } from '@/lib/oauth-state'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const redirectUri = `${baseUrl}/api/email/google/callback`

    if (!clientId) {
      console.error('GOOGLE_CLIENT_ID is not set')
      return NextResponse.redirect(new URL('/settings/email-integration?error=missing_config', baseUrl))
    }

    const state = createOAuthState(session.user.id)
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Google connect error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/settings/email-integration?error=connect_failed', baseUrl))
  }
}
