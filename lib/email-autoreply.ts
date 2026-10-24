/**
 * Keeps automatic emails from answering each other. Two halves:
 *
 *   outgoing  every email this app sends is marked: `X-Portal-Mail` (it came from a ticket portal) and, unless a person wrote it,
 *             `Auto-Submitted: auto-generated` + `X-Auto-Response-Suppress: All` (the standard way to say "do not auto-reply")
 *   incoming  before an automatic answer is sent (the "we received your request" email, the welcome email), the incoming mail is
 *             checked: from another portal, auto-submitted, bulk / list mail, a bounce, a no-reply sender ... then nothing is sent
 *
 * No database and no imports, so it is tested on its own (tests/email-autoreply.test.mjs).
 */

export const PORTAL_MAIL_HEADER = 'X-Portal-Mail'

const first = (v: string | undefined | null) => (v ?? '').trim()

/**
 * Why an automatic reply to this email must not be sent, or null when it may be.
 * `header(name)` returns a header value ('' when absent). `isAutomatedAddress` is the no-reply check on an address.
 */
export function autoReplyBlock(
  header: (name: string) => string,
  sender: string,
  opts: { ownAddress?: string | null; isAutomatedAddress: (email: string) => boolean }
): string | null {
  const has = (name: string) => first(header(name)) !== ''
  const lower = (name: string) => first(header(name)).toLowerCase()

  if (has(PORTAL_MAIL_HEADER)) return 'sent by a ticket portal'
  const auto = lower('Auto-Submitted')
  if (auto && auto !== 'no') return `Auto-Submitted: ${auto}`
  if (has('X-Auto-Response-Suppress')) return 'X-Auto-Response-Suppress'
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(lower('Precedence'))) return `Precedence: ${lower('Precedence')}`
  if (has('List-Id') || has('List-Unsubscribe') || has('List-Post')) return 'mailing list'
  if (lower('Return-Path') === '<>') return 'bounce (empty return path)'
  if (has('X-Failed-Recipients') || /report-type=delivery-status|multipart\/report/.test(lower('Content-Type'))) return 'delivery report'
  if (opts.ownAddress && sender.trim().toLowerCase() === opts.ownAddress.trim().toLowerCase()) return 'from our own address'
  if (opts.isAutomatedAddress(sender)) return 'no-reply sender'
  const replyTo = first(header('Reply-To')).match(/<([^>]+)>/)?.[1] ?? first(header('Reply-To'))
  if (replyTo && opts.isAutomatedAddress(replyTo.toLowerCase())) return 'replies go to a no-reply address'
  return null
}

/** Mail that nobody should answer by hand either (out-of-office, bounces): it belongs in Notifications, not the support queue. */
export function isAutoSubmitted(header: (name: string) => string): boolean {
  const auto = first(header('Auto-Submitted')).toLowerCase()
  return (!!auto && auto !== 'no') || ['bulk', 'junk', 'auto_reply'].includes(first(header('Precedence')).toLowerCase()) || first(header('X-Autoreply')) !== '' || first(header('X-Autorespond')) !== ''
}

/** Header lines to add to an email we send. `human`: a person wrote it (an agent's reply), so it is not marked auto-generated. */
export function outgoingHeaderLines(opts: { human: boolean; site: string }): string[] {
  const lines = [`${PORTAL_MAIL_HEADER}: ${opts.site || 'portal'}`]
  if (!opts.human) lines.push('Auto-Submitted: auto-generated', 'X-Auto-Response-Suppress: All')
  return lines
}

/** Put header lines at the top of a raw RFC 822 message, leaving out the ones the message already has. */
export function injectHeaders(raw: string, lines: string[]): string {
  const end = raw.search(/\r?\n\r?\n/)
  const block = end === -1 ? raw : raw.slice(0, end)
  const present = new Set(
    block
      .split(/\r?\n/)
      .filter((l) => /^[!-9;-~]+:/.test(l))
      .map((l) => l.slice(0, l.indexOf(':')).toLowerCase())
  )
  const add = lines.filter((l) => !present.has(l.slice(0, l.indexOf(':')).toLowerCase()))
  return add.length ? `${add.join('\r\n')}\r\n${raw}` : raw
}
