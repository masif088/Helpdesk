/**
 * Automation rules engine: evaluate conditions and apply actions when tickets are
 * created, updated, or when a new comment/reply/note is added.
 */
import { pickAutoAssignee } from '@/lib/agent-suggestions'
import { sendAutomationLog } from '@/lib/automation-log-webhook'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import {
  automationRules,
  companies,
  find,
  findBy,
  findOneBy,
  get,
  insert,
  insertIgnore,
  insertMany,
  type Patch,
  teams,
  ticketAssignees,
  ticketChecklist,
  ticketComments,
  tickets,
  type TicketsRow,
  ticketStatuses,
  ticketTags,
  ticketTypes,
  update,
} from '@/lib/fsdb'

import type { AutomationActions } from './automation-actions-types'
import { AUTOMATION_NOTE_USER_ID } from './automation-constants'
import type { OurCondition, OurConditionGroup, OurConditionLeaf } from './condition-builder-utils'
import { bumpTicketDataVersion } from './firebase/ticket-sync-server'
import { diffTicketSnapshots, loadTicketActivitySnapshot, logTicketActivity } from './ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE, parseTicketType } from './ticket-classification'
import { applyCompanySupportPriorityRank } from './ticket-company-priority-order'

function automationNoteHtmlHasText(html: string | undefined | null): boolean {
  if (!html?.trim()) return false
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0
}

export interface TicketContext {
  id: number
  /** Ticket title (portal & API). Condition field `subject` also reads this (email-style name). */
  title?: string | null
  description?: string | null
  status?: string | null
  /** Integer ticket Priority value */
  priority?: number | null
  /** Ticket type slug (ticket_types.slug), for conditions e.g. Type = bug */
  type_slug?: string | null
  /** Row ticket_type: support | spam | trash */
  ticket_type?: string | null
  company_id?: string | null
  created_via?: string | null
  team_id?: string | null
  sender_email?: string | null
  sender_domain?: string | null
  assignee_ids?: string[]
  /** Set for event ticket_comment_added: reply | note */
  comment_visibility?: string | null
  /** Set for event ticket_comment_added: agent | customer | automation */
  comment_author_type?: string | null
  /** Days since ticket was last updated (for time_trigger rules) */
  days_since_updated?: number | null
}

export type AutomationEventType =
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_comment_added'
  | 'ticket_reply_added'
  | 'ticket_note_added'
  /** Scheduled (POST /api/automation/time-trigger) */
  | 'time_trigger'

function isLeaf(c: OurCondition): c is OurConditionLeaf {
  return !('conditions' in c) || !Array.isArray((c as OurConditionGroup).conditions)
}

function isEmptyAutomationValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true
  if (typeof raw === 'string') return raw.trim() === ''
  if (Array.isArray(raw)) return raw.length === 0
  return false
}

function evalLeaf(leaf: OurConditionLeaf, ctx: TicketContext): boolean {
  const field = String(leaf.field || '').toLowerCase()
  const op = String(leaf.operator || '=')
    .toLowerCase()
    .replace(/\s+/g, '')
  const expectVal = leaf.value

  if (field === 'priority') {
    const act = ctx.priority
    const actNum =
      act === null || act === undefined || Number.isNaN(Number(act)) ? NaN : Number(act)
    const expNum = Number(expectVal)

    if (op === 'null' || op === 'isnull') {
      return act === null || act === undefined || Number.isNaN(actNum)
    }
    if (op === 'notnull' || op === 'isnotnull') {
      return act !== null && act !== undefined && !Number.isNaN(actNum)
    }

    switch (op) {
      case '=':
        return !Number.isNaN(actNum) && !Number.isNaN(expNum) && actNum === expNum
      case '!=':
        return Number.isNaN(actNum) || Number.isNaN(expNum) || actNum !== expNum
      case 'in': {
        const list = String(expectVal ?? '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n))
        return list.length > 0 && !Number.isNaN(actNum) && list.includes(actNum)
      }
      case 'notin': {
        const list = String(expectVal ?? '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n))
        return list.length === 0 || Number.isNaN(actNum) || !list.includes(actNum)
      }
      default:
        return String(ctx.priority ?? '').toLowerCase() === String(expectVal ?? '').toLowerCase()
    }
  }

  // Numeric comparison for days_since_updated
  if (field === 'days_since_updated') {
    const actual = ctx.days_since_updated ?? null
    if (actual === null) return false
    const expected = Number(expectVal)
    if (!Number.isFinite(expected)) return false
    switch (op) {
      case '>': return actual > expected
      case '>=': return actual >= expected
      case '<': return actual < expected
      case '<=': return actual <= expected
      case '=': return actual === expected
      case '!=': return actual !== expected
      default: return actual > expected
    }
  }

  const getRaw = (): unknown => {
    switch (field) {
      case 'subject':
      case 'title':
        return ctx.title ?? null
      case 'description':
        return ctx.description ?? null
      case 'type':
      case 'type_slug':
        return ctx.type_slug ?? null
      case 'ticket_type':
        return ctx.ticket_type ?? null
      case 'status':
        return ctx.status ?? null
      case 'sender_domain':
        return ctx.sender_domain ?? null
      case 'sender_email':
        return ctx.sender_email ?? null
      case 'assignee_id':
        return (ctx.assignee_ids ?? [])[0] ?? null
      case 'created_via':
        return ctx.created_via ?? null
      case 'comment_visibility':
        return ctx.comment_visibility ?? null
      case 'comment_author_type':
        return ctx.comment_author_type ?? null
      default:
        return null
    }
  }

  const raw = getRaw()

  if (op === 'null' || op === 'isnull') {
    return isEmptyAutomationValue(raw)
  }
  if (op === 'notnull' || op === 'isnotnull') {
    return !isEmptyAutomationValue(raw)
  }

  const actualStr = raw === null || raw === undefined ? '' : String(raw).toLowerCase()
  const expectStr = String(expectVal ?? '').toLowerCase()

  switch (op) {
    case '=':
      return actualStr === expectStr
    case '!=':
      return actualStr !== expectStr
    case 'contains':
      return actualStr.includes(expectStr)
    case 'beginswith':
      return actualStr.startsWith(expectStr)
    case 'endswith':
      return actualStr.endsWith(expectStr)
    case 'in': {
      const list = String(expectVal ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      return list.length > 0 && list.includes(actualStr)
    }
    case 'notin': {
      const list = String(expectVal ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      return list.length === 0 || !list.includes(actualStr)
    }
    default:
      return actualStr === expectStr
  }
}

function evalConditions(cond: OurConditionGroup, ctx: TicketContext): boolean {
  const operator = (cond.operator ?? 'AND').toUpperCase()
  const conditions = cond.conditions ?? []

  if (conditions.length === 0) return true

  const results = conditions.map((c) => {
    if (isLeaf(c)) return evalLeaf(c, ctx)
    return evalConditions(c as OurConditionGroup, ctx)
  })

  return operator === 'OR' ? results.some(Boolean) : results.every(Boolean)
}

/** Load ticket + assignees for automation context (shared across triggers). */
export async function loadAutomationTicketContext(ticketId: number): Promise<TicketContext | null> {
  const t = await get(tickets, ticketId)
  if (!t) return null
  const [type, assigneeRows] = await Promise.all([get(ticketTypes, t.typeId), findBy(ticketAssignees, { ticketId })])
  const row = { typeSlug: type?.slug ?? null }

  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority ?? 0,
    type_slug: row.typeSlug ?? null,
    ticket_type: coerceTicketType(t.ticketType),
    company_id: t.companyId,
    created_via: t.createdVia,
    team_id: t.teamId,
    assignee_ids: assigneeRows.map((r) => r.userId),
  }
}

/**
 * After a human or customer comment is saved. Skips author_type automation to avoid loops.
 */
export async function runTicketCommentAutomation(
  ticketId: number,
  comment: { visibility: string; authorType: string }
): Promise<void> {
  if (comment.authorType === 'automation') return
  const base = await loadAutomationTicketContext(ticketId)
  if (!base) return
  const ctx = {
    ...base,
    comment_visibility: comment.visibility ?? 'reply',
    comment_author_type: comment.authorType ?? 'agent',
  }
  const isNote = comment.visibility === 'note'
  await runAutomationRules('ticket_comment_added', ctx)
  await runAutomationRules(isNote ? 'ticket_note_added' : 'ticket_reply_added', ctx)
}

export async function runAutomationRules(
  eventType: AutomationEventType,
  ctx: TicketContext,
  opts?: {
    /** Skip a rule before evaluating it (time trigger: already fired for this idle period) */
    skipRule?: (ruleId: number) => boolean
    /** Called for each rule whose conditions matched (before its actions run) */
    onRuleMatched?: (ruleId: number) => void
  }
): Promise<void> {
  /** Higher `priority` value runs first; every matching rule runs (not only the first). */
  const rows = await find(automationRules, {
    where: [
      ['eventType', '==', eventType],
      ['status', '==', true],
    ],
    orderBy: [['priority', 'desc']],
  })

  let didBumpTicketData = false
  const requestBump = () => {
    didBumpTicketData = true
  }

  for (const rule of rows) {
    if (!rule.conditions || typeof rule.conditions !== 'object') continue
    const cond = rule.conditions as OurConditionGroup
    if (!('operator' in cond) || !Array.isArray(cond.conditions)) continue

    const companyMatch = !rule.companyId || rule.companyId === ctx.company_id
    if (!companyMatch) continue
    if (opts?.skipRule?.(rule.id)) continue
    if (!evalConditions(cond, ctx)) continue
    opts?.onRuleMatched?.(rule.id)

    sendAutomationLog({
      event: 'automation_matched',
      ticket_id: ctx.id,
      email: ctx.sender_email ?? '',
      subject: ctx.title ?? '',
      detail: `rule=${rule.name ?? rule.id} event=${eventType}`,
    }).catch(() => {})

    const actions = (rule.actions || {}) as AutomationActions
    const updates: Patch<TicketsRow> = {}

    let queuePriorityRaw: unknown | undefined
    if (
      actions.priority !== undefined &&
      actions.priority !== null &&
      `${actions.priority}`.trim() !== ''
    ) {
      queuePriorityRaw = actions.priority
    }

    if (actions.type_slug) {
      const t = await findOneBy(ticketTypes, { slug: String(actions.type_slug) })
      if (t) updates.typeId = t.id
    }
    if (actions.status_slug) {
      const st = await findOneBy(ticketStatuses, { slug: String(actions.status_slug) })
      if (st) updates.status = st.slug
    }
    if (actions.team_id) {
      const tm = await get(teams, actions.team_id)
      if (tm) updates.teamId = tm.id
    }
    if (actions.company_id) {
      const co = await get(companies, actions.company_id)
      if (co) updates.companyId = co.id
    }
    if (actions.ticket_type !== undefined && actions.ticket_type !== null && actions.ticket_type !== '') {
      const cls = parseTicketType(actions.ticket_type)
      if (cls) updates.ticketType = cls
    }

    const effectiveTicketType =
      updates.ticketType !== undefined
        ? coerceTicketType(updates.ticketType as string)
        : coerceTicketType(ctx.ticket_type)

    const useSupportQueueReorder = Boolean(
      ctx.company_id &&
        effectiveTicketType === DEFAULT_TICKET_TYPE &&
        queuePriorityRaw !== undefined
    )

    if (queuePriorityRaw !== undefined && !useSupportQueueReorder) {
      const n = Number(queuePriorityRaw)
      if (Number.isFinite(n)) {
        updates.priority = Math.max(0, Math.floor(n))
      }
    }

    const willMutateTicket =
      Object.keys(updates).length > 0 ||
      Boolean(actions.tag_ids?.length) ||
      Boolean(actions.auto_assign_by_skill) ||
      useSupportQueueReorder
    const beforeAuto = willMutateTicket ? await loadTicketActivitySnapshot(ctx.id) : null

    if (Object.keys(updates).length > 0 || useSupportQueueReorder) {
      if (Object.keys(updates).length > 0) {
        await update(tickets, ctx.id, { ...updates, updatedAt: new Date() })
      }
      if (useSupportQueueReorder && queuePriorityRaw !== undefined) {
        await applyCompanySupportPriorityRank(ctx.id, queuePriorityRaw)
      }
      requestBump()
    }

    if (actions.tag_ids?.length) {
      const existing = await findBy(ticketTags, { ticketId: ctx.id })
      const existingIds = new Set(existing.map((r) => r.tagId))
      const toAdd = actions.tag_ids.filter((id) => !existingIds.has(id))
      if (toAdd.length > 0) {
        await insertMany(ticketTags, toAdd.map((tagId) => ({ ticketId: ctx.id, tagId })))
        requestBump()
      }
    }

    if (actions.assignee_ids?.length) {
      const existing = await findBy(ticketAssignees, { ticketId: ctx.id })
      const existingIds = new Set(existing.map((r) => r.userId))
      const toAdd = actions.assignee_ids.filter((id) => !existingIds.has(id))
      if (toAdd.length > 0) {
        for (const userId of toAdd) await insertIgnore(ticketAssignees, { ticketId: ctx.id, userId })
        requestBump()
      }
    }

    // Auto-assign by skill: after tags / type / team above, so the skills it looks at are the up-to-date ones
    if (actions.auto_assign_by_skill && typeof actions.auto_assign_by_skill === 'object') {
      const cfg = actions.auto_assign_by_skill
      const minMatch = Math.min(100, Math.max(1, Math.round(Number(cfg.min_match) || 100)))
      const existing = await findBy(ticketAssignees, { ticketId: ctx.id })
      if (cfg.only_if_unassigned === false || existing.length === 0) {
        const pick = await pickAutoAssignee(ctx.id, { minMatch, teamOnly: Boolean(cfg.team_only) })
        if (pick) {
          await insertIgnore(ticketAssignees, { ticketId: ctx.id, userId: pick.agent.userId })
          requestBump()
          const title = ctx.title ?? 'Ticket'
          try {
            await notifyTicketUsers({
              recipientUserIds: [pick.agent.userId],
              ticketId: ctx.id,
              ticketTitle: title,
              type: 'assignee_added',
              title: 'You were assigned',
              body: `Automatically assigned on "${title}" (${pick.agent.matchPercent}% skill match: ${pick.agent.matched.join(', ')})`,
              actorUserId: 'automation',
              actorName: 'Automation',
              actorRole: 'automation',
            })
          } catch (e) {
            console.error('[automation auto_assign_by_skill] notify:', e)
          }
        }
      }
    }

    if (beforeAuto) {
      const afterAuto = await loadTicketActivitySnapshot(ctx.id)
      if (afterAuto) {
        const diff = diffTicketSnapshots(beforeAuto, afterAuto)
        if (Object.keys(diff).length > 0) {
          await logTicketActivity({
            ticketId: ctx.id,
            actorUserId: null,
            actorRole: 'automation',
            action: 'ticket_updated',
            metadata: {
              source: 'automation_rule',
              rule_id: rule.id,
              rule_name: rule.name ?? null,
              changed_keys: Object.keys(diff),
              changes: diff,
            },
          })
        }
      }
    }

    if (automationNoteHtmlHasText(actions.add_note)) {
      const noteUserId = actions.add_note_user_id?.trim() || AUTOMATION_NOTE_USER_ID
      const noteRow = await insert(ticketComments, {
        ticketId: ctx.id,
        userId: noteUserId,
        comment: actions.add_note!.trim(),
        visibility: 'note',
        authorType: 'automation',
      })
      if (noteRow) {
        requestBump()
        await logTicketActivity({
          ticketId: ctx.id,
          actorUserId: noteUserId,
          actorRole: 'automation',
          action: 'comment_added',
          relatedCommentId: noteRow.id,
          metadata: {
            visibility: 'note',
            author_type: 'automation',
            source: 'automation_rule',
            rule_id: rule.id,
            rule_name: rule.name ?? null,
          },
        })
      }
    }

    if (actions.add_checklist_items?.length) {
      const items = actions.add_checklist_items
        .map((t) => (typeof t === 'string' ? t : '').trim())
        .filter(Boolean)
      if (items.length > 0) {
        const existing = await findBy(ticketChecklist, { ticketId: ctx.id })
        const existingTitles = new Set(existing.map((r) => r.title?.toLowerCase() ?? ''))
        const maxOrder = existing.reduce((m, r) => Math.max(m, r.orderIndex ?? 0), -1)
        const toAdd = items.filter((title) => !existingTitles.has(title.toLowerCase()))
        if (toAdd.length > 0) {
          await insertMany(
            ticketChecklist,
            toAdd.map((title, idx) => ({
              ticketId: ctx.id,
              title,
              isCompleted: false,
              orderIndex: maxOrder + 1 + idx,
            }))
          )
          requestBump()
        }
      }
    }

    const fresh = await loadAutomationTicketContext(ctx.id)
    if (fresh) {
      ctx.title = fresh.title
      ctx.description = fresh.description
      ctx.status = fresh.status
      ctx.type_slug = fresh.type_slug
      ctx.company_id = fresh.company_id
      ctx.created_via = fresh.created_via
      ctx.team_id = fresh.team_id
      ctx.assignee_ids = fresh.assignee_ids
    }
  }

  if (didBumpTicketData) {
    bumpTicketDataVersion(ctx.id)
  }
}
