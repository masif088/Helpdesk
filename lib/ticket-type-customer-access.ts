import { get, ticketTypes } from '@/lib/fsdb'

/**
 * Validates that customers may assign `typeId` when creating or updating tickets.
 * `null` / undefined clears type and is always allowed.
 */
export async function assertCustomerMayUseTicketType(
  typeId: number | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeId === null || typeId === undefined) return { ok: true }
  const row = await get(ticketTypes, typeId)
  if (!row) return { ok: false, error: 'Invalid ticket type' }
  if (row.isAgentOnly) {
    return { ok: false, error: 'This ticket type is only available to agents' }
  }
  return { ok: true }
}
