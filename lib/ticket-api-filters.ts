/**
 * The extra filters of `GET /api/tickets` (besides status, type, company, team, tags, search and created / due dates that
 * were already there): by person, by skill, by last update, overdue, open. Pure helpers (no database imports) so the route,
 * the API builder and the tests share them. Staff only: a client's list is already limited to their own company.
 */
// Relative, with the extension, on purpose: the tests load this file with plain Node, which knows no `@/` alias
import { parseDateBound } from './app-time.ts'

export type TicketApiFilters = {
  /** Assigned to any of these users (the word `me` stands for the caller) */
  assigneeIds: string[]
  /** Nobody is assigned */
  unassigned: boolean
  /** Opened by any of these users */
  creatorIds: string[]
  /** Opened by, or with as contact, any of these client users */
  customerIds: string[]
  /** Needs these skills (the ticket's own, else its client's for the type, else the defaults of type and tags) */
  skills: string[]
  skillsMatch: 'any' | 'all'
  updatedFrom: Date | null
  updatedTo: Date | null
  /** Not finished and past its due date */
  overdue: boolean
  /** true: has a due date; false: has none */
  hasDueDate: boolean | null
  /** true: not finished; false: finished */
  open: boolean | null
}

export const hasApiFilters = (f: TicketApiFilters): boolean =>
  f.assigneeIds.length > 0 ||
  f.unassigned ||
  f.creatorIds.length > 0 ||
  f.customerIds.length > 0 ||
  f.skills.length > 0 ||
  !!f.updatedFrom ||
  !!f.updatedTo ||
  f.overdue ||
  f.hasDueDate !== null ||
  f.open !== null

const list = (v: string | null): string[] => (v ? [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))] : [])
const flag = (v: string | null): boolean | null => (v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : null)

function day(v: string | null, end: boolean, tz: string): Date | null | 'bad' {
  if (!v) return null
  return parseDateBound(v, tz, end) ?? 'bad'
}

/** Read the filters from the query string. `meId` replaces the word `me`; a plain date means that day in `tz` (the app zone). */
export function parseTicketApiFilters(params: URLSearchParams, meId: string, tz = 'UTC'): TicketApiFilters | { error: string } {
  const me = (ids: string[]) => ids.map((i) => (i === 'me' ? meId : i))
  const from = day(params.get('updated_from'), false, tz)
  const to = day(params.get('updated_to'), true, tz)
  if (from === 'bad' || to === 'bad') return { error: 'updated_from and updated_to must be dates (YYYY-MM-DD) or ISO date and time' }
  const match = params.get('skills_match')?.toLowerCase()
  if (match && match !== 'any' && match !== 'all') return { error: 'skills_match must be any or all' }
  const unassigned = flag(params.get('unassigned')) === true
  const assigneeIds = me(list(params.get('assignee_ids')))
  if (unassigned && assigneeIds.length) return { error: 'Use either assignee_ids or unassigned=1, not both' }
  return {
    assigneeIds,
    unassigned,
    creatorIds: me(list(params.get('creator_ids'))),
    customerIds: list(params.get('customer_ids')),
    skills: list(params.get('skills')),
    skillsMatch: match === 'all' ? 'all' : 'any',
    updatedFrom: from,
    updatedTo: to,
    overdue: flag(params.get('overdue')) === true,
    hasDueDate: flag(params.get('has_due_date')),
    open: flag(params.get('open')),
  }
}

const key = (s: string) => s.trim().toLowerCase()

/** Does a ticket's skill list satisfy the wanted skills (case-insensitive)? */
export function skillsMatchTicket(ticketSkills: string[], wanted: string[], mode: 'any' | 'all'): boolean {
  if (wanted.length === 0) return true
  const have = new Set(ticketSkills.map(key))
  return mode === 'all' ? wanted.every((w) => have.has(key(w))) : wanted.some((w) => have.has(key(w)))
}

type TicketForFilter = {
  status: string
  createdBy: string | null
  contactUserId: string | null
  updatedAt: Date | string | null
  dueDate: Date | string | null
}

/** The filters that need nothing but the ticket row. Assignees and skills are checked by the caller. */
export function ticketMatchesApiFilters(t: TicketForFilter, f: TicketApiFilters, ctx: { now: Date; isOpen: (status: string) => boolean }): boolean {
  if (f.creatorIds.length && !(t.createdBy && f.creatorIds.includes(t.createdBy))) return false
  if (f.customerIds.length && !((t.createdBy && f.customerIds.includes(t.createdBy)) || (t.contactUserId && f.customerIds.includes(t.contactUserId)))) return false
  if (f.updatedFrom || f.updatedTo) {
    if (!t.updatedAt) return false
    const u = new Date(t.updatedAt).getTime()
    if (f.updatedFrom && u < f.updatedFrom.getTime()) return false
    if (f.updatedTo && u > f.updatedTo.getTime()) return false
  }
  const open = ctx.isOpen(t.status)
  if (f.open !== null && open !== f.open) return false
  if (f.hasDueDate !== null && !!t.dueDate !== f.hasDueDate) return false
  if (f.overdue && !(open && t.dueDate && new Date(t.dueDate).getTime() < ctx.now.getTime())) return false
  return true
}

type ListedTicket = {
  id: number
  title: string
  status: string
  priority: number | null
  due_date: string | null
  created_at: string
  updated_at: string
  type: { title: string } | null
  company: { id: string; name: string } | null
  creator: { id: string; full_name: string | null; email: string } | null
  assignees: { user_id: string; user_name: string }[]
  tags: { name: string }[]
  sla?: unknown
}

/** A short version of a listed ticket: what an assistant needs to pick one, without descriptions, checklists or attachments. */
export function compactTicket(t: ListedTicket, baseUrl: string) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    type: t.type?.title ?? null,
    company: t.company ? { id: t.company.id, name: t.company.name } : null,
    requester: t.creator ? { id: t.creator.id, name: t.creator.full_name || t.creator.email } : null,
    assignees: t.assignees.map((a) => ({ id: a.user_id, name: a.user_name })),
    tags: t.tags.map((x) => x.name),
    due_date: t.due_date,
    created_at: t.created_at,
    updated_at: t.updated_at,
    url: `${baseUrl.replace(/\/+$/, '')}/tickets/${t.id}`,
  }
}
