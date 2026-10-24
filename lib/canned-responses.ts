/**
 * Canned responses: ready-made replies an agent inserts into a comment. Pure helpers (no database, no path aliases) so they can be
 * tested on their own; the API routes in app/api/canned-responses use them.
 */
export type CannedScope = 'shared' | 'personal'

/** What can be written inside {{double braces}}, with an example for the editor's help text. */
export const CANNED_VARIABLES: { key: string; hint: string }[] = [
  { key: 'customer_name', hint: 'name of the person who wrote the ticket' },
  { key: 'ticket_number', hint: 'ticket number, e.g. 1234' },
  { key: 'ticket_title', hint: 'title of the ticket' },
  { key: 'agent_name', hint: 'the agent sending the reply' },
  { key: 'company', hint: "the customer's company" },
]

export type CannedVars = { customer_name: string; ticket_number: string; ticket_title: string; agent_name: string; company: string }

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Fill {{customer_name}} … into HTML. The values are plain text, so they are escaped; unknown {{words}} stay as they are. */
export function fillCanned(html: string, vars: CannedVars): string {
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, k: string) => {
    const key = k.toLowerCase()
    return key in vars ? escapeHtml(vars[key as keyof CannedVars] ?? '') : whole
  })
}

/** Plain text typed in the editor (blank line = new paragraph) as the HTML a reply is made of. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** The reverse, for showing a stored reply in a plain text box. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

type Visible = { scope: string; ownerId: string | null }

/** Shared replies are for everyone; a personal one only for its owner. */
export const visibleTo = (r: Visible, userId: string) => r.scope === 'shared' || r.ownerId === userId

/** May this person change or delete it? The owner, and admins / managers for shared ones. */
export const mayEdit = (r: Visible, userId: string, isManager: boolean) => (r.scope === 'shared' ? isManager : r.ownerId === userId)

/** Most used first, then by title; filtered by what was typed (title, shortcut or text). */
export function rankCanned<T extends { title: string; shortcut: string | null; content: string; usageCount: number }>(rows: T[], query = ''): T[] {
  const q = query.trim().toLowerCase()
  const hit = (r: T) => !q || `${r.title} ${r.shortcut ?? ''} ${htmlToText(r.content)}`.toLowerCase().includes(q)
  return rows.filter(hit).sort((a, b) => b.usageCount - a.usageCount || a.title.localeCompare(b.title))
}

/** A clean shortcut: lower case words with dashes, no slash, at most 30 characters. '' = none. */
export const cleanShortcut = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)

export const MAX_TITLE = 120
export const MAX_CONTENT = 8000

/** Why a canned response cannot be saved, or null. */
export function cannedProblem(input: { title?: unknown; content?: unknown }): string | null {
  if (typeof input.title !== 'string' || !input.title.trim()) return 'Title is required'
  if (input.title.trim().length > MAX_TITLE) return `Title is too long (max ${MAX_TITLE} characters)`
  if (typeof input.content !== 'string' || !htmlToText(input.content)) return 'Write the reply text'
  if (input.content.length > MAX_CONTENT) return 'The reply is too long'
  return null
}
