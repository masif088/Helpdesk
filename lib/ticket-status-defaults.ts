/**
 * Which statuses are selected by default in the ticket list filter, per kind of user.
 *
 *   agent    - what an agent sees first (open work). Falls back to the statuses shown on the Kanban board.
 *   customer - what a client sees first, and the statuses where the ball is with the client (waiting for their reply or
 *              approval): the Workload page counts these as "waiting on client". Falls back to question / client_review.
 *
 * Both are set per status under Settings -> Ticket statuses. Until one is set the old behaviour applies, so nothing changes
 * for existing installations.
 */

export type DefaultableStatus = {
  slug: string
  isActive?: boolean | null
  is_active?: boolean | null
  showInKanban?: unknown
  show_in_kanban?: unknown
  agentDefaultFilter?: boolean | null
  agent_default_filter?: boolean | null
  customerDefaultFilter?: boolean | null
  customer_default_filter?: boolean | null
}

/** Statuses a client is expected to answer or approve, until the settings say otherwise. */
export const LEGACY_CLIENT_SLUGS = new Set(['question', 'client_review'])

/** Kanban flag as stored: null / missing means shown */
const inKanban = (v: unknown) => v === null || v === undefined || v === true || (v !== false && v !== 0 && v !== 'false' && v !== 'f' && v !== '0')
const active = (s: DefaultableStatus) => (s.isActive ?? s.is_active) !== false
const pick = <T,>(a: T | undefined, b: T | undefined): T | undefined => (a !== undefined ? a : b)

const agentFlag = (s: DefaultableStatus) => pick(s.agentDefaultFilter, s.agent_default_filter)
const customerFlag = (s: DefaultableStatus) => pick(s.customerDefaultFilter, s.customer_default_filter)

/** The explicit setting, or null when nobody chose yet. */
const explicit = (list: DefaultableStatus[], flag: (s: DefaultableStatus) => boolean | null | undefined) => {
  const act = list.filter(active)
  return act.some((s) => flag(s) != null) ? act.filter((s) => flag(s) === true).map((s) => s.slug) : null
}

export function agentDefaultSlugs(list: DefaultableStatus[]): string[] {
  const chosen = explicit(list, agentFlag)
  if (chosen) return chosen
  return list.filter(active).filter((s) => inKanban(pick(s.showInKanban, s.show_in_kanban))).map((s) => s.slug)
}

/** Statuses where the ball is with the client; also the client's default filter. */
export function customerDefaultSlugs(list: DefaultableStatus[]): string[] {
  const chosen = explicit(list, customerFlag)
  if (chosen) return chosen
  return list.filter(active).filter((s) => LEGACY_CLIENT_SLUGS.has(s.slug)).map((s) => s.slug)
}

/** For the settings table: is this status a default (the explicit value, else the fallback above)? */
export const isAgentDefault = (list: DefaultableStatus[], slug: string) => agentDefaultSlugs(list).includes(slug)
export const isCustomerDefault = (list: DefaultableStatus[], slug: string) => customerDefaultSlugs(list).includes(slug)
