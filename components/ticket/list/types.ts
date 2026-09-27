export interface TicketsContentProps {
  user: { id: string }
}

/** Format ticket ID for display, e.g. 900 → "#900" */
export function formatTicketId(id: number): string {
  return `#${id}`
}

export interface TicketAttachment {
  id: string
  file_url: string
  file_name: string
  file_path: string
}

export interface NewTicketAttachment {
  url: string
  file_name: string
  file_path: string
}

export interface TicketRecord {
  id: number
  title: string
  description: string | null
  short_note: string | null
  created_by: string
  /** Primary email reply recipient; null = use creator */
  contact_user_id?: string | null
  due_date: string | null
  status: string
  team_id: string | null
  type_id: number | null
  /** DB ticket_type: support | spam | trash (not ticket_types / type_id) */
  ticket_type?: string
  /** Numeric queue priority; null when out of ranking (e.g. closed support). */
  priority: number | null
  company_id: string | null
  created_at: string
  updated_at: string
  /** Populated for ticket_type project (board/API). */
  project_id?: string | null
  project_status_id?: number | null
  created_via?: string
  creator_name?: string
  by_label?: string
  team_name?: string
  type?: { id: number; title: string; slug: string; color: string } | null
  company?: { id: string; name: string; color?: string; email?: string | null } | null
  tags?: Array<{ id: string; name: string; slug: string; color?: string }>
  assignees?: Array<{ id: string; user_id: string; user_name?: string }>
  checklist_items?: Array<unknown>
  checklist_completed?: number
  checklist_total?: number
  last_read_at?: string | null
  has_unread_replies?: boolean
  /** Ticket-level files (from GET /api/tickets); used when editing in modal */
  attachments?: TicketAttachment[]
}

export interface Team {
  id: string
  name: string
}

export interface UserRecord {
  id: string
  full_name: string | null
  email: string
  role?: string
  /** From users.company_id in lookup; may be null even if user is in company_users */
  company_id?: string | null
}

export interface TicketStatusRecord {
  id: number
  slug: string
  title: string
  customer_title?: string
  color: string
  show_in_kanban: boolean
  is_active?: boolean
  sort_order: number
}

export interface StatusColumn {
  id: string
  title: string
  color: string
}

export const DEFAULT_KANBAN_COLUMNS: StatusColumn[] = [
  { id: 'open', title: 'Open', color: '#F1C232' },
  { id: 'working_team', title: 'Working Team', color: '#D9EAD3' },
  { id: 'client_review', title: 'Client Review', color: '#52c41a' },
]

export const DEFAULT_ALL_STATUSES = [
  { slug: 'open', title: 'Open' },
  { slug: 'received', title: 'Received' },
  { slug: 'question', title: 'Question' },
  { slug: 'working_team', title: 'Working Team' },
  { slug: 'am_review', title: 'AM Review' },
  { slug: 'client_review', title: 'Client Review' },
  { slug: 'feedback_received', title: 'Feedback Received' },
  { slug: 'revision', title: 'Revision' },
  { slug: 'pending', title: 'Pending' },
  { slug: 'resolved', title: 'Resolved' },
  { slug: 'closed', title: 'Closed' },
]

export const DEFAULT_ALL_STATUS_COLUMNS: StatusColumn[] = [
  { id: 'open', title: 'Open', color: '#F1C232' },
  { id: 'received', title: 'Received', color: '#C9DAF8' },
  { id: 'question', title: 'Question', color: '#6D9EEB' },
  { id: 'working_team', title: 'Working Team', color: '#D9EAD3' },
  { id: 'am_review', title: 'AM Review', color: '#6D9EEB' },
  { id: 'client_review', title: 'Client Review', color: '#52c41a' },
  { id: 'feedback_received', title: 'Feedback Received', color: '#C9DAF8' },
  { id: 'revision', title: 'Revision', color: '#1890ff' },
  { id: 'pending', title: 'Pending', color: '#8c8c8c' },
  { id: 'resolved', title: 'Resolved', color: '#52c41a' },
  { id: 'closed', title: 'Closed', color: '#595959' },
]

/** Darken a hex color by mixing with black (0-100, e.g. 30 = 30% darker) */
export function darkenColor(hex: string, percent: number = 30): string {
  if (!hex || !/^#?[0-9A-Fa-f]{3,6}$/.test(hex)) return hex
  hex = hex.replace(/^#/, '')
  if (hex.length !== 6 && hex.length !== 3) return hex
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  const r = Math.max(0, Math.round(parseInt(hex.slice(0, 2), 16) * (1 - percent / 100)))
  const g = Math.max(0, Math.round(parseInt(hex.slice(2, 4), 16) * (1 - percent / 100)))
  const b = Math.max(0, Math.round(parseInt(hex.slice(4, 6), 16) * (1 - percent / 100)))
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export type TicketSortField = 'id' | 'title' | 'priority' | 'due_date' | 'updated_at' | 'created_at' | 'company'
export type TicketSortOrder = 'asc' | 'desc'

/** Ticket list order: ascending priority — matches API and board/card/list views. */
export const TICKETS_LIST_SORT_BY = 'priority' satisfies TicketSortField as TicketSortField
export const TICKETS_LIST_SORT_ORDER = 'asc' satisfies TicketSortOrder as TicketSortOrder

function ticketClientPriorityRank(p: TicketRecord['priority']): number {
  if (p === null || p === undefined || p <= 0) return Number.MAX_SAFE_INTEGER
  return p
}

/** Sort tickets by field. For priority, sort is always ascending (lower values first); null/low ranks last. */
export function sortTickets(tickets: TicketRecord[], sortBy: TicketSortField, sortOrder: TicketSortOrder): TicketRecord[] {
  const dir = sortBy === 'priority' ? 1 : sortOrder === 'asc' ? 1 : -1
  return [...tickets].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'id':
        cmp = a.id - b.id
        break
      case 'title':
        cmp = (a.title || '').localeCompare(b.title || '')
        break
      case 'priority':
        cmp = ticketClientPriorityRank(a.priority) - ticketClientPriorityRank(b.priority)
        if (cmp === 0) {
          cmp = String(a.company?.id ?? '').localeCompare(String(b.company?.id ?? ''))
          if (cmp === 0) cmp = a.id - b.id
        }
        break
      case 'due_date':
        cmp = new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime()
        break
      case 'updated_at':
        cmp = new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime()
        break
      case 'created_at':
        cmp = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        break
      case 'company':
        cmp = (a.company?.name || '').localeCompare(b.company?.name || '')
        break
      default:
        cmp = a.id - b.id
    }
    return cmp * dir
  })
}
