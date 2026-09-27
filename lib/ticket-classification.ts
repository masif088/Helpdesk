/** Row classification separate from `ticket_types` / `type_id` (bug, feature, etc.). */
export const TICKET_TYPE_VALUES = ['support', 'spam', 'trash', 'notification', 'project'] as const
export type TicketTypeValue = (typeof TICKET_TYPE_VALUES)[number]

export const DEFAULT_TICKET_TYPE: TicketTypeValue = 'support'

export function parseTicketType(raw: unknown): TicketTypeValue | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return (TICKET_TYPE_VALUES as readonly string[]).includes(s) ? (s as TicketTypeValue) : null
}

/** Staff ticket folders outside the main support list (sidebar: Notifications, Spam, Trash). */
export const TICKET_FOLDERS = ['notification', 'spam', 'trash'] as const
export type TicketFolder = (typeof TICKET_FOLDERS)[number]

export function isTicketFolder(v: unknown): v is TicketFolder {
  return typeof v === 'string' && (TICKET_FOLDERS as readonly string[]).includes(v)
}

export const TICKET_FOLDER_LABELS: Record<TicketFolder, string> = {
  notification: 'Notifications',
  spam: 'Spam',
  trash: 'Trash',
}

export function coerceTicketType(raw: string | null | undefined): TicketTypeValue {
  return parseTicketType(raw ?? '') ?? DEFAULT_TICKET_TYPE
}
