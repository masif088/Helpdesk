import { revalidateTag, unstable_cache } from 'next/cache'

import {
  companies,
  find,
  tags,
  teams,
  ticketStatuses,
  ticketTypes,
  users,
} from '@/lib/fsdb'
/** Seconds; clamp 30s–24h. Default 30 min if env unset or invalid. */
const DEFAULT_TICKETS_LOOKUP_CATALOG_REVALIDATE_SEC = 30 * 60

function catalogRevalidateSeconds(): number {
  const raw = Number(process.env.TICKETS_LOOKUP_CATALOG_REVALIDATE_SECONDS)
  if (!Number.isFinite(raw) || raw < 30) return DEFAULT_TICKETS_LOOKUP_CATALOG_REVALIDATE_SEC
  return Math.min(86400, Math.floor(raw))
}

async function loadTicketsLookupCatalog() {
  const [
    teamsData,
    usersData,
    ticketTypesData,
    companiesData,
    tagsData,
    statusesData,
  ] = await Promise.all([
    find(teams, { orderBy: [['name', 'asc']] }),
    find(users, { orderBy: [['fullName', 'asc']] }),
    find(ticketTypes, { orderBy: [['sortOrder', 'asc']] }),
    find(companies, { orderBy: [['name', 'asc']] }),
    find(tags, { orderBy: [['name', 'asc']] }),
    find(ticketStatuses, { orderBy: [['sortOrder', 'asc']] }),
  ])

  return {
    teams: teamsData.map((t) => ({ id: t.id, name: t.name, type: t.type })),
    users: usersData.map((u) => ({
      id: u.id,
      full_name: u.fullName,
      email: u.email,
      role: u.role,
      company_id: u.companyId ?? null,
    })),
    ticketTypes: ticketTypesData.map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      color: t.color,
      isAgentOnly: t.isAgentOnly,
    })),
    companies: companiesData.map((c) => ({ id: c.id, name: c.name, color: c.color, email: c.email })),
    tags: tagsData.map((t) => ({ id: t.id, name: t.name, slug: t.slug, color: t.color })),
    statuses: statusesData.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      customer_title: s.customerTitle ?? undefined,
      color: s.color,
      /** Raw DB value; clients use isTicketStatusInKanban */
      show_in_kanban: s.showInKanban,
      sort_order: s.sortOrder,
      is_active: s.isActive,
    })),
  }
}

/**
 * Shared catalog for `/api/tickets/lookup` (teams, users, types, companies, tags, statuses).
 * Time-based revalidation lowers Firestore reads; user-specific slices stay uncached in the route.
 */
export const TICKETS_LOOKUP_CATALOG_TAG = 'tickets-lookup-catalog' as const

/** Call after mutating teams, users, companies, tags, ticket types/statuses. */
export function revalidateTicketsLookupCatalog() {
  revalidateTag(TICKETS_LOOKUP_CATALOG_TAG, { expire: 0 })
}

export const getTicketsLookupCatalog = unstable_cache(loadTicketsLookupCatalog, ['tickets-lookup-catalog-v2'], {
  revalidate: catalogRevalidateSeconds(),
  tags: [TICKETS_LOOKUP_CATALOG_TAG],
})
