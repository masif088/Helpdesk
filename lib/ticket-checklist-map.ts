import type { ticketChecklist, users } from '@/lib/fsdb'

type ChecklistRow = typeof ticketChecklist.$inferSelect
type CompleterRow = Pick<typeof users.$inferSelect, 'id' | 'fullName' | 'email'> | null | undefined

export type ChecklistItemDto = {
  id: string
  ticket_id: number
  title: string
  is_completed: boolean
  order_index: number
  group_name: string | null
  created_at: string
  completed_at: string | null
  completed_by_user_id: string | null
  completed_by_name: string | null
  completion_note: string | null
}

export function mapChecklistItemToDto(row: ChecklistRow, completer?: CompleterRow): ChecklistItemDto {
  return {
    id: row.id,
    ticket_id: row.ticketId,
    title: row.title,
    is_completed: Boolean(row.isCompleted),
    order_index: row.orderIndex ?? 0,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    completed_at: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    completed_by_user_id: row.completedByUserId ?? null,
    completed_by_name: completer?.fullName || completer?.email || null,
    group_name: row.groupName ?? null,
    completion_note: row.completionNote ?? null,
  }
}
