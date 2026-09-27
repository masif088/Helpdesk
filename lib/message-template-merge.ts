import type { users } from '@/lib/fsdb'
import { allMessageTemplatePlaceholderKeys } from '@/lib/message-template-placeholders'

export type MessageTemplateMergeUserMaps = {
  recipient: Record<string, string>
  sender: Record<string, string>
}

function fmtTs(v: Date | string | null | undefined): string {
  if (v == null) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Map a `users` row to flat keys used in `{{ recipient.* }}` / `{{ sender.* }}` (and bare `{{ email }}` → recipient). */
export function userRowToMergeMap(row: typeof users.$inferSelect | null, companyName?: string | null): Record<string, string> {
  if (!row) {
    return {
      first_name: '—', last_name: '—', full_name: '—', email: '—', user_id: '—',
      avatar_url: '—', role: '—', status: '—', phone: '—', department: '—',
      position: '—', bio: '—', timezone: '—', locale: '—', is_email_verified: '—',
      company_id: '—', company_name: '—',
      last_login_at: '—', last_active_at: '—', created_at: '—', updated_at: '—',
    }
  }
  const fn = row.firstName?.trim() || ''
  const ln = row.lastName?.trim() || ''
  const full = row.fullName?.trim() || [fn, ln].filter(Boolean).join(' ') || row.email || '—'
  return {
    first_name: fn || '—',
    last_name: ln || '—',
    full_name: full,
    email: row.email || '—',
    user_id: row.id,
    avatar_url: row.avatarUrl?.trim() || '—',
    role: row.role || '—',
    status: row.status || '—',
    phone: row.phone?.trim() || '—',
    department: row.department?.trim() || '—',
    position: row.position?.trim() || '—',
    bio: row.bio?.trim() || '—',
    timezone: row.timezone?.trim() || '—',
    locale: row.locale?.trim() || '—',
    is_email_verified: row.isEmailVerified === true ? 'true' : row.isEmailVerified === false ? 'false' : '—',
    company_id: row.companyId ?? '—',
    company_name: companyName?.trim() || '—',
    last_login_at: fmtTs(row.lastLoginAt),
    last_active_at: fmtTs(row.lastActiveAt),
    created_at: fmtTs(row.createdAt),
    updated_at: fmtTs(row.updatedAt),
  }
}

/** Normalize HTML from the editor so `{{ ... }}` tokens match reliably. */
export function normalizeMergeSource(html: string): string {
  return String(html)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/&#(?:x7B|123);/gi, '{')
    .replace(/&#(?:x7D|125);/gi, '}')
    .replace(/&#123;/gi, '{')
    .replace(/&#125;/gi, '}')
    .replace(/&lcub;/gi, '{')
    .replace(/&rcub;/gi, '}')
    .replace(/&lbrace;/gi, '{')
    .replace(/&rbrace;/gi, '}')
    .replace(/\uff5b/g, '{')
    .replace(/\uff5d/g, '}')
}

/** Merge adjacent text nodes so split `{{` / `token` / `}}` can match in one regex pass. */
function mergeAdjacentTextNodesDeep(el: Element) {
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i]
    if (c.nodeType === Node.ELEMENT_NODE) mergeAdjacentTextNodesDeep(c as Element)
  }
  let merged = true
  while (merged) {
    merged = false
    let child = el.firstChild
    while (child) {
      const next = child.nextSibling
      if (child.nodeType === Node.TEXT_NODE && next?.nodeType === Node.TEXT_NODE) {
        ;(child as Text).appendData((next as Text).data)
        next.remove()
        merged = true
        continue
      }
      child = next
    }
  }
}

type ReplaceContext = {
  officialKeys: Set<string>
  replaceOfficialKey: (key: string) => string | null
  replaceBareRecipient: (key: string) => string | null
}

/**
 * Replace `{{ ... }}` in the HTML *string* so real `<a>` tags parse as elements (not text).
 */
function applyPlaceholderReplacements(html: string, ctx: ReplaceContext): string {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/gi, (full, rawKey: string) => {
    const key = rawKey.trim().toLowerCase()
    if (!key) return full
    if (ctx.officialKeys.has(key)) {
      const v = ctx.replaceOfficialKey(key)
      return v !== null ? v : full
    }
    const bare = ctx.replaceBareRecipient(key)
    return bare !== null ? bare : full
  })
}

function makeContext(origin: string, ticketId: string, recipient: Record<string, string>, sender: Record<string, string>, extra?: Record<string, string>) {
  const base = origin.replace(/\/$/, '')
  const ticketUrl = `${base}/tickets/${ticketId}`
  /** Same values as `login_url` / `change_password_url` — buttons always href these. */
  const loginUrl = extra?.login_url ?? `${base}/login`
  const changePasswordUrl = extra?.change_password_url ?? `${base}/forgot-password`
  const officialKeys = new Set(allMessageTemplatePlaceholderKeys().map((k) => k.toLowerCase()))

  const replaceOfficialKey = (key: string): string | null => {
    if (key === 'ticket_id') return ticketId
    if (key === 'ticket_link') return ticketUrl
    if (key === 'ticket_title') return extra?.ticket_title ?? '—'
    if (key === 'ticket') {
      const safe = ticketUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">Ticket #${ticketId}</a>`
    }
    if (key.startsWith('recipient.')) {
      const field = key.slice('recipient.'.length)
      return recipient[field] ?? null
    }
    if (key.startsWith('sender.')) {
      const field = key.slice('sender.'.length)
      return sender[field] ?? null
    }
    if (key === 'login_url') return loginUrl
    if (key === 'change_password_url') return changePasswordUrl
    const buttonStyle = 'display:inline-block;padding:10px 20px;background:#1677ff;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px'
    if (key === 'login_button') {
      const safe = loginUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">Login</a>`
    }
    if (key === 'change_password_button') {
      const safe = changePasswordUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" style="${buttonStyle}">Change Password</a>`
    }
    // Extra keys (e.g. temporary_password, reply_content) are official placeholders
    // but resolved from the extra map passed at call time
    if (extra && Object.prototype.hasOwnProperty.call(extra, key)) return extra[key]!
    return null
  }

  const replaceBareRecipient = (key: string): string | null => {
    if (key.includes('.')) return null
    if (extra && Object.prototype.hasOwnProperty.call(extra, key)) return extra[key]!
    if (Object.prototype.hasOwnProperty.call(recipient, key)) return recipient[key]!
    return null
  }

  return { officialKeys, replaceOfficialKey, replaceBareRecipient }
}

export type MergeMessageTemplateHtmlOptions = {
  origin: string
  ticketId: string
  recipient: Record<string, string>
  sender: Record<string, string>
  /** Extra flat key→value pairs merged after recipient/sender/ticket (e.g. temporary_password). */
  extra?: Record<string, string>
  /** When true (browser), normalize split placeholders via DOMParser. */
  useDomMerge?: boolean
}

/** Replace merge fields with real maps + ticket id/link (used for emails, ticket reply body, and preview). */
export function mergeMessageTemplateHtml(html: string, options: MergeMessageTemplateHtmlOptions): string {
  if (html == null || !String(html).trim()) return ''

  const { origin, ticketId, recipient, sender, extra } = options
  const useDom = options.useDomMerge ?? (typeof document !== 'undefined')
  const ctx = makeContext(origin, ticketId, recipient, sender, extra)

  let working = normalizeMergeSource(html)

  if (useDom) {
    try {
      const doc = new DOMParser().parseFromString(working, 'text/html')
      mergeAdjacentTextNodesDeep(doc.body)
      working = doc.body.innerHTML
    } catch {
      // keep working as-is
    }
  }

  return applyPlaceholderReplacements(working, ctx)
}
