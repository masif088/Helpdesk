'use server'

import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { API_KEY_SCOPES } from '@/lib/api-key-core'
import { clientFromId,issueCode } from '@/lib/mcp-oauth'
import { allowedScopesFor } from '@/lib/mcp-oauth-consent'
import { redirectWith, validChallenge } from '@/lib/mcp-oauth-core'

/**
 * The person answered the consent page. Everything is checked again here (the form fields are only what the browser sent): a signed-in
 * person, a client id we signed, a redirect address that client registered, and permissions limited to what this person's role may approve.
 */
export async function decide(formData: FormData): Promise<void> {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) redirect('/login')

  const clientId = String(formData.get('client_id') ?? '')
  const redirectUri = String(formData.get('redirect_uri') ?? '')
  const challenge = String(formData.get('code_challenge') ?? '')
  const state = String(formData.get('state') ?? '') || null
  const client = clientFromId(clientId)
  if (!client || !client.redirectUris.includes(redirectUri) || !validChallenge(challenge)) redirect('/dashboard')

  if (formData.get('decision') !== 'approve') redirect(redirectWith(redirectUri, { error: 'access_denied', state }))

  const allowed = new Set<string>(allowedScopesFor(session.user.role))
  const scopes = formData.getAll('scope').map(String).filter((s) => (API_KEY_SCOPES as readonly string[]).includes(s) && allowed.has(s))
  if (!scopes.length) redirect(redirectWith(redirectUri, { error: 'access_denied', state }))

  const code = await issueCode({ userId: session.user.id, clientId, clientName: client.name, redirectUri, codeChallenge: challenge, scopes })
  redirect(redirectWith(redirectUri, { code, state }))
}
