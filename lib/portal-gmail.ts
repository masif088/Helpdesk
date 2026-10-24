/**
 * The Gmail client the app sends with. It is the normal Google client, except that every email that leaves through it is marked
 * (see lib/email-autoreply.ts) so two ticket portals, or a portal and an auto-responder, never answer each other forever.
 * `human: true` for a reply an agent wrote: marked as coming from the portal, but not as auto-generated.
 */
import { type Auth, type gmail_v1, google } from 'googleapis'

import { injectHeaders, outgoingHeaderLines } from '@/lib/email-autoreply'

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

function siteName(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').host
  } catch {
    return 'portal'
  }
}

export function portalGmail(auth: Auth.OAuth2Client, opts: { human?: boolean } = {}): gmail_v1.Gmail {
  const gmail = google.gmail({ version: 'v1', auth })
  const messages = gmail.users.messages
  const send = messages.send.bind(messages) as (params: gmail_v1.Params$Resource$Users$Messages$Send, ...rest: unknown[]) => unknown
  const lines = outgoingHeaderLines({ human: !!opts.human, site: siteName() })
  messages.send = ((params: gmail_v1.Params$Resource$Users$Messages$Send, ...rest: unknown[]) => {
    const raw = params?.requestBody?.raw
    const marked = raw ? { ...params, requestBody: { ...params.requestBody, raw: b64url(injectHeaders(fromB64url(raw), lines)) } } : params
    return send(marked, ...rest)
  }) as typeof messages.send
  return gmail
}
