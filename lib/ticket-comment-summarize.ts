import { getAiChatConfig } from '@/lib/ai-chat-config'
export { linkifyAiOutputItems, linkifyPlainTextForHtml, summaryItemsToCommentHtml } from '@/lib/ticket-comment-utils'
export type { AiSummarizeResult, LocalizedSummarizeComment, LocalizedSummarizeContext,SummarizeAnchorRequest } from '@/lib/ticket-summarize-types'

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

/** Strip HTML for OpenAI prompts; keeps hyperlink URLs so AI can use them as references. */
export function stripHtmlForPrompt(html: string): string {
  let s = String(html || '')
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')

  s = s.replace(
    /<a\s+[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_, q1: string, q2: string, q3: string, inner: string) => {
      const href = (q1 || q2 || q3 || '').trim()
      const label = decodeBasicHtmlEntities(
        inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      )
      const url = decodeBasicHtmlEntities(href)
      if (!url) return label
      if (!label) return `Link: ${url}`
      if (label === url) return `Link: ${url}`
      return `${label} (link: ${url})`
    }
  )

  s = s.replace(
    /<img[^>]*\ssrc\s*=\s*["']([^"'<>]+)["'][^>]*>/gi,
    (_, src: string) => ` [image: ${decodeBasicHtmlEntities(src.trim())}] `
  )

  s = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  return decodeBasicHtmlEntities(s).replace(/\s+/g, ' ').trim()
}

/** Max comments sent to OpenAI (oldest-first slice when over limit). */
export const SUMMARIZE_MAX_COMMENTS = 100

// Types moved to lib/ticket-summarize-types.ts (re-exported above)
import type { LocalizedSummarizeContext, SummarizeAnchorRequest } from '@/lib/ticket-summarize-types'
/** Slice ordered comments: focal + `before` above + `after` below. */
export function pickCommentWindow<T extends { id: string }>(
  ordered: T[],
  commentId: string,
  before = 3,
  after = 3
): { window: T[]; focalIndex: number } | null {
  const focalIndex = ordered.findIndex((c) => c.id === commentId)
  if (focalIndex < 0) return null
  const start = Math.max(0, focalIndex - before)
  const end = Math.min(ordered.length, focalIndex + after + 1)
  return { window: ordered.slice(start, end), focalIndex: focalIndex - start }
}

export function buildLocalizedSummarizePrompt(ctx: LocalizedSummarizeContext): string {
  const descriptionBlock = `Ticket description:\n${(ctx.ticketDescription ?? '').slice(0, 8000) || '(empty)'}`

  const commentsBlock =
    ctx.comments.length > 0
      ? ctx.comments
          .map((c, i) => {
            const focal = c.isFocal ? ' [FOCAL]' : ''
            return `[${i + 1}]${focal} ${c.createdAt} | ${c.author} (${c.authorType}, ${c.visibility})\n${c.body.slice(0, 4000)}`
          })
          .join('\n\n')
      : '(no comments in this excerpt)'

  const excerptIntro =
    ctx.anchor === 'comment'
      ? 'Excerpt = full ticket thread (description + all comments below). The comment marked [FOCAL] is the primary focus; include the rest as context.'
      : 'Excerpt = full ticket thread: description + all comments (chronological, all authors).'

  const voiceHint =
    ctx.anchor === 'comment'
      ? `Primary focus: comment by ${ctx.focalAuthor} (${ctx.focalAuthorType}) marked [FOCAL]. Write summary/checklist from the whole thread but emphasize that comment and follow-ups it implies.`
      : 'Summarize the entire thread for agents (all authors: customer, agents, automation context if any). Use clear neutral agent voice (third person or "we" as the support team).'

  return `You are summarizing a support ticket thread for agents.

Ticket title: ${ctx.ticketTitle}
${excerptIntro}

${descriptionBlock ? `${descriptionBlock}\n\n` : ''}Comments in excerpt:
${commentsBlock}

${voiceHint}

Return JSON only: {"summary":["..."],"checklist":["..."]}

Write ALL output in English only.

"summary" — for internal comment / description (narrative recap):
- Use as many bullets as needed.
- Write in the focal author's voice (first person where natural): context, status, blockers, asks, and merged piecemeal ("nyicil") updates.
- When links appear in the excerpt (format: "text (link: https://...)"), mention important URLs as references in the recap.
- Each bullet is a clear prose point (not imperative commands); split topics but keep readable summary style.
- No markdown, no numbering inside strings.

"checklist" — for task checklist (commands only):
- Use as many items as needed for a full task breakdown.
- Each item = one actionable imperative command in English (verb first, e.g. "Update homepage banner", "Send draft to client for approval").
- When the excerpt includes links (shown as "link: https://..."), turn them into clear tasks and cite the URL in the command when it helps (e.g. "Review design at link: https://...").
- Split compound work into separate commands; no markdown, no numbering inside strings.
- Do not duplicate "summary" bullets verbatim — checklist is the actionable task list derived from the excerpt.`
}

/** @deprecated Full-thread prompt; kept for reference. Prefer buildLocalizedSummarizePrompt. */
export type CommentSummarizeContext = {
  ticketTitle: string
  ticketDescription: string
  ticketStatus: string
  checklistTitles: string[]
  comments: Array<{
    author: string
    visibility: string
    createdAt: string
    body: string
  }>
}

export function buildCommentSummarizePrompt(ctx: CommentSummarizeContext): string {
  const checklistBlock =
    ctx.checklistTitles.length > 0
      ? `Checklist:\n${ctx.checklistTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : 'Checklist: (empty)'

  const commentsBlock =
    ctx.comments.length > 0
      ? ctx.comments
          .map(
            (c, i) =>
              `[${i + 1}] ${c.createdAt} | ${c.author} (${c.visibility})\n${c.body.slice(0, 4000)}`
          )
          .join('\n\n')
      : '(no comments yet)'

  return `You are summarizing a support ticket thread for agents.

Ticket title: ${ctx.ticketTitle}
Status: ${ctx.ticketStatus}
Description: ${ctx.ticketDescription.slice(0, 8000) || '(empty)'}

${checklistBlock}

Comments (oldest to newest):
${commentsBlock}

Return a concise bullet summary as JSON only: {"items":["bullet 1","bullet 2",...]}
Rules:
- make sure the bullets are in the same language as the ticket/comments (prefer English if mixed).
- Each bullet is one clear action or fact (max 120 chars).
- No markdown, no numbering inside strings.
- Focus on status, blockers, customer asks, and next steps.`
}

import type { AiSummarizeResult } from '@/lib/ticket-summarize-types'

function normalizeSummaryStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((s) => s.length > 0)
}

export function parseAiSummarizeFromOpenAiContent(raw: string): AiSummarizeResult {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed
  try {
    const parsed = JSON.parse(jsonText) as {
      summary?: unknown
      checklist?: unknown
      items?: unknown
    }
    const summary = normalizeSummaryStringArray(parsed.summary ?? parsed.items)
    const checklist = normalizeSummaryStringArray(parsed.checklist)
    return { summary, checklist }
  } catch {
    const fallback = trimmed
      .split('\n')
      .map((line) => line.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter((s) => s.length > 2)
    return { summary: fallback, checklist: [] }
  }
}

/** @deprecated Use parseAiSummarizeFromOpenAiContent */
export function parseSummaryItemsFromOpenAiContent(raw: string): string[] {
  return parseAiSummarizeFromOpenAiContent(raw).summary
}

export async function requestAiLocalizedSummary(prompt: string): Promise<AiSummarizeResult> {
  const { provider, apiKey, baseUrl, model } = await getAiChatConfig()

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 10000,
      messages: [
        {
          role: 'system',
          content: 'You output valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    const label = provider === 'codex' ? 'Codex' : 'OpenAI'
    throw new Error(errBody || `${label} request failed (${res.status})`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content ?? ''
  const result = parseAiSummarizeFromOpenAiContent(content)
  if (result.summary.length === 0 && result.checklist.length === 0) {
    throw new Error('AI returned an empty summary')
  }
  return result
}

/** @deprecated Use requestAiLocalizedSummary */
export async function requestOpenAiLocalizedSummary(prompt: string): Promise<AiSummarizeResult> {
  return requestAiLocalizedSummary(prompt)
}

/** @deprecated Use requestOpenAiLocalizedSummary */
export async function requestOpenAiCommentSummary(prompt: string): Promise<string[]> {
  const result = await requestAiLocalizedSummary(prompt)
  return result.summary.length > 0 ? result.summary : result.checklist
}

export function parseSummarizeAnchorBody(body: unknown): SummarizeAnchorRequest {
  if (body && typeof body === 'object') {
    const o = body as { anchor?: string; commentId?: string }
    if (o.anchor === 'comment' && typeof o.commentId === 'string' && o.commentId.trim()) {
      return { type: 'comment', commentId: o.commentId.trim() }
    }
    if (o.anchor === 'ticket') return { type: 'ticket' }
    if (o.anchor === 'description') return { type: 'description' }
  }
  return { type: 'description' }
}

/** Trim comment list to API limit while keeping focal comment when possible. */
export function sliceCommentsForSummarize<T extends { id: string }>(
  ordered: T[],
  focalCommentId?: string | null
): T[] {
  if (ordered.length <= SUMMARIZE_MAX_COMMENTS) return ordered
  const focalIndex = focalCommentId ? ordered.findIndex((c) => c.id === focalCommentId) : -1
  if (focalIndex < 0) return ordered.slice(-SUMMARIZE_MAX_COMMENTS)
  const half = Math.floor(SUMMARIZE_MAX_COMMENTS / 2)
  let start = Math.max(0, focalIndex - half)
  const end = Math.min(ordered.length, start + SUMMARIZE_MAX_COMMENTS)
  start = Math.max(0, end - SUMMARIZE_MAX_COMMENTS)
  return ordered.slice(start, end)
}
