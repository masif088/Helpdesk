import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAiApiKeyConfigError } from '@/lib/ai-chat-config'
import { isAdminOrManager } from '@/lib/auth-utils'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'
import { findBy, get, getManyMap, sortRows, ticketComments, tickets, users } from '@/lib/fsdb'
import {
  getTicketAiSummary,
  markTicketAiSummaryApplied,
  parseSummarizeAnchorFromSearchParams,
  saveTicketAiSummary,
  type TicketAiSummaryApplyTarget,
  ticketAiSummaryToJson,
} from '@/lib/ticket-ai-summary'
import {
  buildLocalizedSummarizePrompt,
  parseSummarizeAnchorBody,
  requestAiLocalizedSummary,
  sliceCommentsForSummarize,
  stripHtmlForPrompt,
  type SummarizeAnchorRequest,
} from '@/lib/ticket-comment-summarize'

function authorLabel(name: string | null, email: string | null): string {
  return name || email || 'Unknown'
}

async function authorizeTicketSummarize(ticketId: number, userId: string, role: string) {
  if (role === 'customer') {
    const access = await assertCustomerMayAccessTicket(userId, ticketId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? 'Ticket not found' : 'Forbidden' },
        { status: access.status }
      )
    }
  }
  const ticket = await get(tickets, ticketId)
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }
  return null
}

type CommentRow = {
  comment: (typeof ticketComments.$inferSelect)
  userName: string | null
  userEmail: string | null
}

async function buildPromptContext(
  ticketId: number,
  anchor: SummarizeAnchorRequest,
  role: string
) {
  const ticketRow = await get(tickets, ticketId)
  if (!ticketRow) return null
  const creator = await get(users, ticketRow.createdBy)
  const ticket = {
    ...ticketRow,
    creatorName: creator?.fullName ?? null,
    creatorEmail: creator?.email ?? null,
  }

  const allComments = await findBy(ticketComments, { ticketId })
  const scoped = role === 'customer' ? allComments.filter((c) => c.visibility !== 'note') : allComments
  const authorById = await getManyMap(users, scoped.map((c) => c.userId))
  const commentRows: CommentRow[] = sortRows(scoped, [['createdAt', 'asc']]).map((comment) => ({
    comment,
    userName: authorById.get(comment.userId)?.fullName ?? null,
    userEmail: authorById.get(comment.userId)?.email ?? null,
  }))

  const mapComment = (r: CommentRow, isFocal: boolean) => ({
    id: r.comment.id,
    isFocal,
    author: authorLabel(r.userName, r.userEmail),
    authorType: r.comment.authorType ?? 'agent',
    visibility: r.comment.visibility ?? 'reply',
    createdAt: r.comment.createdAt ? new Date(r.comment.createdAt).toISOString() : '',
    body: stripHtmlForPrompt(r.comment.comment ?? ''),
  })

  const ticketDescription = stripHtmlForPrompt(ticket.description ?? '')
  const rowsWithId = commentRows.map((r) => ({ row: r, id: r.comment.id }))
  const threadSlice = sliceCommentsForSummarize(
    rowsWithId,
    anchor.type === 'comment' ? anchor.commentId : null
  )

  if (anchor.type === 'comment') {
    const focalIndex = threadSlice.findIndex((r) => r.id === anchor.commentId)
    if (focalIndex < 0) return { error: 'Comment not found' as const }

    const focalRow = threadSlice[focalIndex].row
    return {
      promptCtx: {
        ticketTitle: ticket.title,
        anchor: 'comment' as const,
        focalAuthor: authorLabel(focalRow.userName, focalRow.userEmail),
        focalAuthorType: focalRow.comment.authorType ?? 'agent',
        ticketDescription,
        comments: threadSlice.map((w) => mapComment(w.row, w.id === anchor.commentId)),
      },
      anchorType: 'comment',
      focalCommentId: anchor.commentId,
    }
  }

  return {
    promptCtx: {
      ticketTitle: ticket.title,
      anchor: anchor.type === 'ticket' ? ('ticket' as const) : ('description' as const),
      focalAuthor: authorLabel(ticket.creatorName, ticket.creatorEmail),
      focalAuthorType: 'agent',
      ticketDescription,
      comments: threadSlice.map((w) => mapComment(w.row, false)),
    },
    anchorType: anchor.type === 'ticket' ? 'ticket' : 'description',
    focalCommentId: null as string | null,
  }
}

/** GET — return saved summary for this anchor (?anchor=comment&commentId= | description | ticket). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase() ?? 'user'
  const authErr = await authorizeTicketSummarize(ticketId, session.user.id, role)
  if (authErr) return authErr

  const anchor = parseSummarizeAnchorFromSearchParams(new URL(request.url).searchParams)
  if (!anchor) {
    return NextResponse.json({ error: 'anchor query required' }, { status: 400 })
  }

  if (anchor.type === 'ticket' && !isAdminOrManager(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const row = await getTicketAiSummary(ticketId, anchor)
  if (!row) {
    return NextResponse.json({ error: 'No saved summary for this anchor' }, { status: 404 })
  }

  return NextResponse.json(ticketAiSummaryToJson(row))
}

/**
 * POST — generate once per ticket, then return cached result on later calls.
 * Body: anchor (description | ticket | comment+commentId) used only on first generation.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase() ?? 'user'
  const userId = session.user.id

  const authErr = await authorizeTicketSummarize(ticketId, userId, role)
  if (authErr) return authErr

  const body = await request.json().catch(() => ({}))
  const anchor = parseSummarizeAnchorBody(body)

  if (anchor.type === 'ticket' && !isAdminOrManager(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await getTicketAiSummary(ticketId, anchor)
  if (existing) {
    return NextResponse.json(ticketAiSummaryToJson(existing))
  }

  const built = await buildPromptContext(ticketId, anchor, role)
  if (!built) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }
  if ('error' in built) {
    return NextResponse.json({ error: built.error }, { status: 404 })
  }

  try {
    const result = await requestAiLocalizedSummary(
      buildLocalizedSummarizePrompt(built.promptCtx)
    )
    const row = await saveTicketAiSummary({
      ticketId,
      anchor,
      summary: result.summary,
      checklist: result.checklist,
      createdByUserId: userId,
    })
    return NextResponse.json({ ...ticketAiSummaryToJson(row), cached: false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Summary failed'
    console.error('[comments/summarize]', err)
    const status = isAiApiKeyConfigError(msg) ? 503 : 502
    return NextResponse.json({ error: msg }, { status })
  }
}

/** PATCH — mark summary as applied to comment, description, or checklist. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase() ?? 'user'
  const authErr = await authorizeTicketSummarize(ticketId, session.user.id, role)
  if (authErr) return authErr

  const body = (await request.json().catch(() => ({}))) as {
    apply?: string
    anchor?: string
    commentId?: string
  }
  const apply = body.apply
  if (apply !== 'comment' && apply !== 'description' && apply !== 'checklist') {
    return NextResponse.json({ error: 'apply must be comment, description, or checklist' }, { status: 400 })
  }

  const anchor = parseSummarizeAnchorBody(body)
  const row = await getTicketAiSummary(ticketId, anchor)
  if (!row) {
    return NextResponse.json({ error: 'No saved summary for this anchor' }, { status: 404 })
  }

  await markTicketAiSummaryApplied(ticketId, anchor, apply as TicketAiSummaryApplyTarget)
  const updated = await getTicketAiSummary(ticketId, anchor)
  return NextResponse.json(updated ? ticketAiSummaryToJson(updated) : ticketAiSummaryToJson(row))
}
