/** Slugs treated as finished for metrics, overdue highlighting, and legacy DB rows. */
const CLOSED_LIKE = new Set(['resolved', 'closed', 'completed', 'cancel', 'archived', 'pending'])

/** The same set as a list, for `not-in` queries (at most 10 values) */
export const CLOSED_LIKE_TICKET_STATUSES = [...CLOSED_LIKE]

export function isClosedLikeTicketStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return CLOSED_LIKE.has(status.toLowerCase())
}
