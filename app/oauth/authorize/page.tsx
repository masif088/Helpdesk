import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { API_KEY_SCOPE_LABELS } from '@/lib/api-key-core'
import { getAppSettings } from '@/lib/app-settings'
import { clientFromId } from '@/lib/mcp-oauth'
import { allowedScopesFor, DEFAULT_CONSENT_SCOPES } from '@/lib/mcp-oauth-consent'
import { splitScope, validChallenge } from '@/lib/mcp-oauth-core'

import { decide } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connect an AI assistant', robots: { index: false, follow: false } }

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

function Problem({ text }: { text: string }) {
  return (
    <main style={{ maxWidth: 460, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>This link cannot be used</h1>
      <p>{text}</p>
    </main>
  )
}

/**
 * An AI assistant (Claude, ChatGPT, Cursor, …) sent the person here to connect to the portal. They sign in (the usual login page),
 * see who is asking and what it may do, and approve or refuse. Nothing is pasted anywhere: the assistant gets its token from us afterwards.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams
  const clientId = one(sp.client_id)
  const redirectUri = one(sp.redirect_uri)
  const challenge = one(sp.code_challenge)
  const state = one(sp.state)

  // Never redirect to an address we cannot vouch for: show the problem here instead
  const client = clientFromId(clientId)
  if (!client) return <Problem text="The assistant is not registered with this portal. Start again from the assistant." />
  if (!client.redirectUris.includes(redirectUri)) return <Problem text="The return address does not match what the assistant registered." />
  if (one(sp.response_type) !== 'code' || !validChallenge(challenge) || one(sp.code_challenge_method) !== 'S256') {
    return <Problem text="The request is incomplete (it needs a PKCE S256 challenge). Update the assistant and try again." />
  }

  const session = await auth()
  if (!session?.user?.id || session.apiKey) {
    const here = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : [[k, one(v)] as [string, string]])))
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${here.toString()}`)}`)
  }

  const allowed = allowedScopesFor(session.user.role)
  const asked = splitScope(one(sp.scope))
  const settings = await getAppSettings().catch(() => null)
  const appName = settings?.app_name || 'the portal'

  return (
    <main style={{ maxWidth: 520, margin: '8vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Connect {client.name}</h1>
      <p style={{ marginTop: 0 }}>
        <strong>{client.name}</strong> wants to use {appName} as <strong>{session.user.name || session.user.email}</strong>. It sees only what you can see, and only for the
        permissions you leave ticked.
      </p>
      <form action={decide}>
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={challenge} />
        <input type="hidden" name="state" value={state} />
        <fieldset style={{ border: '1px solid #8886', borderRadius: 8, padding: 12, margin: '16px 0' }}>
          <legend style={{ padding: '0 6px' }}>What it may do</legend>
          {allowed.map((s) => (
            <label key={s} style={{ display: 'block', margin: '6px 0' }}>
              <input type="checkbox" name="scope" value={s} defaultChecked={DEFAULT_CONSENT_SCOPES.includes(s) || asked.includes(s)} /> {API_KEY_SCOPE_LABELS[s]}
            </label>
          ))}
        </fieldset>
        <p style={{ fontSize: 13, opacity: 0.75 }}>
          You can end this connection any time in your profile under API keys (it is listed as “Connector · {client.name}”). It stops working at once.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" name="decision" value="approve" style={{ padding: '8px 16px', borderRadius: 6, border: 0, background: '#1677ff', color: '#fff', cursor: 'pointer' }}>
            Allow
          </button>
          <button type="submit" name="decision" value="deny" style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #8886', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  )
}
