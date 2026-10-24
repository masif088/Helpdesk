/**
 * Demo reset: put the whole app back to an empty, demo-ready state with one button. What it keeps and removes is decided here,
 * with no database, so it can be tested on its own (tests/demo-reset-plan.test.mjs). The part that touches data is lib/demo-reset.ts.
 */

/** The only account that sees the button and may run it. */
export const DEMO_RESET_OPERATOR = 'mokhamadasif@gmail.com'

/** Accounts that survive a reset, next to the operator: the test customer for the client portal. */
export const DEMO_RESET_KEEP_EMAILS = ['masiftesting@gmail.com'] as const

/** What has to be typed to run it */
export const DEMO_RESET_PHRASE = 'RESET DEMO'

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

export const mayDemoReset = (email: string | null | undefined) => norm(email) === DEMO_RESET_OPERATOR

export const isDemoResetPhrase = (typed: unknown) => typeof typed === 'string' && typed.trim() === DEMO_RESET_PHRASE

/** The accounts that stay (operator + test customer), by email. */
export const keepsAccount = (email: string | null | undefined) => norm(email) === DEMO_RESET_OPERATOR || (DEMO_RESET_KEEP_EMAILS as readonly string[]).includes(norm(email))

export function splitUsers<T extends { id: string; email: string | null }>(rows: T[]): { keep: T[]; remove: T[] } {
  return { keep: rows.filter((u) => keepsAccount(u.email)), remove: rows.filter((u) => !keepsAccount(u.email)) }
}

/** Companies that stay: the ones the kept accounts belong to. */
export function companiesToKeep(keptUsers: { companyId: string | null }[], links: { companyId: string; userId: string }[], keptIds: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const u of keptUsers) if (u.companyId) out.add(u.companyId)
  for (const l of links) if (keptIds.has(l.userId)) out.add(l.companyId)
  return out
}

/**
 * Collections that are emptied completely. Everything else (statuses, ticket types, skills, templates, canned responses, knowledge
 * base, settings, teams, tags, Slack rules, announcements) is configuration and stays.
 */
export const WIPE_TABLES = [
  // tickets and everything hanging on them
  'tickets',
  'ticketComments',
  'commentAttachments',
  'ticketAttachments',
  'ticketActivityLog',
  'ticketAssignees',
  'ticketTags',
  'ticketChecklist',
  'ticketCcRecipients',
  'ticketAttributs',
  'ticketAiSummaries',
  'ticketTimeTracker',
  'recurringTickets',
  'recurringTicketRuns',
  'screenshots',
  'projects',
  'projectStatuses',
  'slaDaily',
  'aiTokenUsage',
  'systemActivityLog',
  'crawlSessions',
  'crawlPages',
  // money
  'invoices',
  'companyPayments',
  // connected mailbox
  'emailIntegrations',
  'emailMessages',
  'emailSkipList',
  // all automation: one "Auto open" rule is created afterwards
  'automationRules',
] as const

/**
 * Collections the app writes to directly, outside the table definitions: live-update versions per ticket and who is looking at
 * a ticket. Ticket numbers start again, so leftovers would point at the wrong tickets.
 */
export const RAW_WIPE_COLLECTIONS = ['ticket_data_sync', 'ticket_presence'] as const

/** Per company that is removed */
export const COMPANY_CHILD_TABLES = ['companyAttributes', 'companyDatas', 'companyWebsites', 'companyKnowledgeBases', 'companyUsers'] as const

/** The one automation that remains: every new ticket is opened. */
export const AUTO_OPEN_RULE = {
  name: 'Auto open',
  eventType: 'ticket_created',
  conditions: { operator: 'AND', conditions: [] },
  actions: { status_slug: 'open' },
  priority: 0,
  status: true,
} as const

/** Ticket numbers start again from 1 */
export const COUNTERS_TO_RESET = ['tickets'] as const
