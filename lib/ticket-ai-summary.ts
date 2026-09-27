import { getByKey, insert, ticketAiSummaries, updateByKey } from '@/lib/fsdb'
import {
  summarizeAnchorType,
  summarizeFocalCommentId,
} from '@/lib/ticket-ai-summary-anchor'
import type { SummarizeAnchorRequest } from '@/lib/ticket-comment-summarize'

export {
  parseSummarizeAnchorFromSearchParams,
  summarizeAnchorSearchParams,
} from '@/lib/ticket-ai-summary-anchor'

export type TicketAiSummaryRow = typeof ticketAiSummaries.$inferSelect

/** Doc key of the one saved summary per anchor (ticket + anchor type + focal comment or null). */
function anchorKey(ticketId: number, anchor: SummarizeAnchorRequest) {
  return {
    ticketId,
    anchorType: summarizeAnchorType(anchor),
    focalCommentId: summarizeFocalCommentId(anchor) ?? null,
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((s) => s.length > 0)
}

export function ticketAiSummaryToJson(row: TicketAiSummaryRow) {
  const summary = normalizeStringArray(row.summary)
  const checklist = normalizeStringArray(row.checklist)
  return {
    summary,
    checklist,
    items: summary,
    cached: true as const,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    anchor_type: row.anchorType,
    focal_comment_id: row.focalCommentId,
    applied_to_comment: Boolean(row.appliedToCommentAt),
    applied_to_description: Boolean(row.appliedToDescriptionAt),
    applied_to_checklist: Boolean(row.appliedToChecklistAt),
  }
}

export async function getTicketAiSummary(
  ticketId: number,
  anchor: SummarizeAnchorRequest
): Promise<TicketAiSummaryRow | null> {
  return getByKey(ticketAiSummaries, anchorKey(ticketId, anchor))
}

export async function saveTicketAiSummary(params: {
  ticketId: number
  anchor: SummarizeAnchorRequest
  summary: string[]
  checklist: string[]
  createdByUserId: string
}): Promise<TicketAiSummaryRow> {
  return insert(ticketAiSummaries, {
    ...anchorKey(params.ticketId, params.anchor),
    summary: params.summary,
    checklist: params.checklist,
    createdByUserId: params.createdByUserId,
  })
}

export type TicketAiSummaryApplyTarget = 'comment' | 'description' | 'checklist'

export async function markTicketAiSummaryApplied(
  ticketId: number,
  anchor: SummarizeAnchorRequest,
  target: TicketAiSummaryApplyTarget
): Promise<void> {
  const now = new Date()
  const patch =
    target === 'comment'
      ? { appliedToCommentAt: now }
      : target === 'description'
        ? { appliedToDescriptionAt: now }
        : { appliedToChecklistAt: now }
  await updateByKey(ticketAiSummaries, anchorKey(ticketId, anchor), patch)
}
