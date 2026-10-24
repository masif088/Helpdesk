import { find, ticketStatuses, update } from '@/lib/fsdb'
import { agentDefaultSlugs, ballWithClientSlugs, customerDefaultSlugs } from '@/lib/ticket-status-defaults'

/**
 * Before the first explicit choice of a default is saved, write the defaults that were in effect (Kanban columns, question /
 * client_review) onto every status. Otherwise changing one status would silently switch off all the others.
 */
export async function materializeStatusDefaults(kind: 'agent' | 'customer' | 'ball'): Promise<void> {
  const rows = await find(ticketStatuses, {})
  const field = kind === 'agent' ? 'agentDefaultFilter' : kind === 'customer' ? 'customerDefaultFilter' : 'ballWithClient'
  if (rows.some((r) => r.isActive !== false && r[field] != null)) return
  const on = new Set(kind === 'agent' ? agentDefaultSlugs(rows) : kind === 'customer' ? customerDefaultSlugs(rows) : ballWithClientSlugs(rows))
  await Promise.all(rows.map((r) => update(ticketStatuses, r.id, { [field]: on.has(r.slug) })))
}
