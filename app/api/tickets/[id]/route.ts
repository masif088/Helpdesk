import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canDeleteTickets } from '@/lib/auth-utils'
import { runAutomationRules } from '@/lib/automation-engine'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'
import { diffNewAssignees,notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import {
  findBy,
  get,
  getMany,
  insertMany,
  type Patch,
  projectStatuses,
  remove,
  removeWhere,
  tags,
  ticketAssignees,
  ticketAttachments,
  tickets,
  type TicketsRow,
  ticketTags,
  ticketTypes,
  update,
} from '@/lib/fsdb'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import {
  diffTicketSnapshots,
  enrichActivityEntityLabels,
  loadTicketActivitySnapshot,
  logTicketActivity,
} from '@/lib/ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE, parseTicketType } from '@/lib/ticket-classification'
import {
  assignSupportTicketPriorityRank,
  compactCompanySupportPriorities,
  compactSupportQueueAfterRemoval,
  parseCompanyTicketDesiredRank,
  resolveSupportQueueScope,
} from '@/lib/ticket-company-priority-order'
import {
  assertTicketContactUserAllowed,
  getEffectiveCompanyIdForUser,
} from '@/lib/ticket-contact-user'
import { sendAgentClosesTicketEmail, sendTicketAssignedEmail } from '@/lib/ticket-notification-emails'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import { assertCustomerMayUseTicketType } from '@/lib/ticket-type-customer-access'

async function triggerTicketUpdatedAutomation(ticketId: number) {
  try {
    const t = await get(tickets, ticketId)
    if (!t) return
    const [type, assigneeRows] = await Promise.all([get(ticketTypes, t.typeId), findBy(ticketAssignees, { ticketId })])
    const row = { t, typeSlug: type?.slug ?? null }
    await runAutomationRules('ticket_updated', {
      id: row.t.id,
      title: row.t.title,
      description: row.t.description,
      status: row.t.status,
      priority: row.t.priority ?? 0,
      type_slug: row.typeSlug ?? null,
      ticket_type: coerceTicketType(row.t.ticketType),
      company_id: row.t.companyId,
      created_via: row.t.createdVia,
      team_id: row.t.teamId,
      assignee_ids: assigneeRows.map((r) => r.userId),
    })
  } catch (err) {
    console.error('Automation rules error (ticket_updated):', err)
  }
}

/** Compare DB priority values after snapshot (supports nullable integer columns). */
function ticketPriSnapshot(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** PATCH /api/tickets/[id] - Update ticket (status, or full) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = await request.json()

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  const actorUserId = session.user.id!

  if (role === 'customer') {
    const access = await assertCustomerMayAccessTicket(actorUserId, ticketId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? 'Not found' : 'Forbidden' },
        { status: access.status }
      )
    }
  }

  // Quick path: only status update (e.g. kanban drag)
  if (Object.keys(body).length === 1 && body.status !== undefined) {
    const nextStatus = String(body.status)

    const cur = await get(tickets, ticketId)

    const isSupport = coerceTicketType(cur?.ticketType) === DEFAULT_TICKET_TYPE
    const companyId = cur?.companyId ?? null

    const closingSupportQueue =
      Boolean(
        isSupport &&
          companyId &&
          isClosedLikeTicketStatus(nextStatus) &&
          cur!.status !== nextStatus &&
          !isClosedLikeTicketStatus(cur!.status)
      )

    const reopenSupportQueue = Boolean(
      isSupport &&
        companyId &&
        isClosedLikeTicketStatus(cur?.status) &&
        !isClosedLikeTicketStatus(nextStatus)
    )

    const setPayload: { status: string; updatedAt: Date; priority?: number | null } = {
      status: nextStatus,
      updatedAt: new Date(),
    }
    if (closingSupportQueue) {
      setPayload.priority = null
    }
    // Clear priority when moving to closed-like or pending status
    if (isClosedLikeTicketStatus(nextStatus) || nextStatus === 'pending') {
      setPayload.priority = null
    }

    if (reopenSupportQueue) {
      await update(tickets, ticketId, setPayload)
      await assignSupportTicketPriorityRank(ticketId, 'append')
    } else if (closingSupportQueue && companyId) {
      await update(tickets, ticketId, setPayload)
      await compactCompanySupportPriorities(companyId)
    } else {
      await update(tickets, ticketId, setPayload)
    }

    const finalRow = await get(tickets, ticketId)

    const priorFromSnap = ticketPriSnapshot(cur?.priority)
    const priToSnap = ticketPriSnapshot(finalRow?.priority)

    if (cur && cur.status !== nextStatus) {
      const changedKeys: string[] = ['status']
      const changes: Record<string, { from: unknown; to: unknown }> = {
        status: { from: cur.status, to: nextStatus },
      }
      if (priorFromSnap !== priToSnap) {
        changedKeys.push('priority')
        changes.priority = { from: priorFromSnap, to: priToSnap }
      }

      const statusEntityLabels = await enrichActivityEntityLabels(changes)
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: changedKeys,
          changes,
          ...(Object.keys(statusEntityLabels).length > 0 ? { entity_labels: statusEntityLabels } : {}),
        },
      })
      try {
        const meta = await get(tickets, ticketId)
        const arows = await findBy(ticketAssignees, { ticketId })
        const recipients = [...arows.map((r) => r.userId), meta?.createdBy].filter(Boolean) as string[]
        const actorName =
          (session.user as { name?: string | null }).name ||
          session.user.email ||
          'Someone'
        await notifyTicketUsers({
          recipientUserIds: recipients,
          excludeUserId: actorUserId,
          ticketId,
          ticketTitle: meta?.title || 'Ticket',
          type: 'status_changed',
          title: 'Ticket status updated',
          body: `"${meta?.title || 'Ticket'}": ${cur.status} → ${nextStatus}`,
          actorUserId,
          actorName,
          actorRole: role ?? null,
        })
      } catch (e) {
        console.error('[PATCH ticket status] notify:', e)
      }
      try {
        const slackRow = await get(tickets, ticketId)
        if (slackRow) {
          void notifySlackTicketEvent('status_changed', {
            id: slackRow.id,
            title: slackRow.title,
            status: slackRow.status,
            teamId: slackRow.teamId ?? null,
            priority: slackRow.priority ?? null,
            companyId: slackRow.companyId ?? null,
            typeId: slackRow.typeId ?? null,
            previousStatus: cur.status,
          })
        }
      } catch (e) {
        console.error('[PATCH ticket status] slack:', e)
      }
      if (nextStatus === 'closed' && cur.status !== 'closed' && actorRole !== 'customer') {
        try {
          const closedMeta = await get(tickets, ticketId)
          await sendAgentClosesTicketEmail({ ticketId, ticketTitle: closedMeta?.title || 'Ticket', agentUserId: actorUserId })
        } catch (e) {
          console.error('[PATCH ticket status] close email:', e)
        }
      }
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true })
  }

  // Quick path: mark ticket as read for this audience only (no automation - UI only).
  // Customer open must not clear staff unread, and vice versa.
  if (Object.keys(body).length === 1 && body.mark_read === true) {
    const now = new Date()
    await update(tickets, ticketId, role === 'customer'
          ? { customerLastReadAt: now, lastReadAt: now }
          : { staffLastReadAt: now, lastReadAt: now })
    return NextResponse.json({ ok: true })
  }

  // Quick path: project board column (project_status_id)
  if (Object.keys(body).length === 1 && body.project_status_id !== undefined) {
    if (role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const trow = await get(tickets, ticketId)
    if (!trow?.projectId || coerceTicketType(trow.ticketType) !== 'project') {
      return NextResponse.json({ error: 'Not a project ticket' }, { status: 400 })
    }
    const rawPs = body.project_status_id
    const nextPs: number | null =
      rawPs === null || rawPs === ''
        ? null
        : typeof rawPs === 'number'
          ? rawPs
          : parseInt(String(rawPs), 10)
    if (nextPs !== null && Number.isNaN(nextPs)) {
      return NextResponse.json({ error: 'Invalid project_status_id' }, { status: 400 })
    }
    if (nextPs !== null) {
      const psFound = await get(projectStatuses, nextPs)
      const psRow = psFound && psFound.projectId === trow.projectId ? psFound : null
      if (!psRow) {
        return NextResponse.json({ error: 'Invalid project status' }, { status: 400 })
      }
    }
    const cur = trow
    await update(tickets, ticketId, { projectStatusId: nextPs, updatedAt: new Date() })
    if (cur && (cur.projectStatusId ?? null) !== nextPs) {
      const psChanges = { project_status_id: { from: cur.projectStatusId, to: nextPs } }
      const psEntityLabels = await enrichActivityEntityLabels(psChanges)
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['project_status_id'],
          changes: psChanges,
          ...(Object.keys(psEntityLabels).length > 0 ? { entity_labels: psEntityLabels } : {}),
        },
      })
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true })
  }

  // Quick path: ticket_type (support | spam | trash) — agents only
  if (Object.keys(body).length === 1 && body.ticket_type !== undefined) {
    if (role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const cls = parseTicketType(body.ticket_type)
    if (cls === 'trash' && !canDeleteTickets(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!cls) {
      return NextResponse.json({ error: 'Invalid ticket_type' }, { status: 400 })
    }
    const cur = await get(tickets, ticketId)
    await update(tickets, ticketId, { ticketType: cls, updatedAt: new Date(), ...(cls === 'trash' && { priority: null }) })
    if (
      cur?.companyId &&
      coerceTicketType(cur.ticketType) === DEFAULT_TICKET_TYPE &&
      cls !== DEFAULT_TICKET_TYPE
    ) {
      await compactCompanySupportPriorities(cur.companyId)
    }
    if (cur && coerceTicketType(cur.ticketType) !== cls) {
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['ticket_type'],
          changes: { ticket_type: { from: coerceTicketType(cur.ticketType), to: cls } },
        },
      })
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true, ticket_type: cls })
  }

  // Quick path: description only (from detail page)
  if (body.description !== undefined && !body.title && !body.assignees && !body.tag_ids) {
    const cur = await get(tickets, ticketId)
    const descChanged = cur && String(cur.description ?? '') !== String(body.description ?? '')
    // Preserve original on first edit only (when originalDescription is still NULL)
    const preserveOriginal = descChanged && cur!.originalDescription == null && cur!.description != null
    await update(tickets, ticketId, {
        description: body.description ?? null,
        ...(preserveOriginal ? { originalDescription: cur!.description } : {}),
        updatedAt: new Date(),
      })
    if (descChanged) {
      await logTicketActivity({
        ticketId,
        actorUserId,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['description'],
          changes: { description: { from: cur!.description, to: body.description ?? null } },
        },
      })
    }
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true })
  }

  const {
    title,
    description,
    short_note,
    status,
    team_id,
    type_id,
    priority,
    company_id,
    due_date,
    assignees,
    tag_ids,
    ticket_type,
    attachments_add = [],
    attachments_delete = [],
    contact_user_id,
  } = body

  if (actorRole === 'customer' && type_id !== undefined) {
    const typeCheck = await assertCustomerMayUseTicketType(type_id ?? null)
    if (!typeCheck.ok) {
      return NextResponse.json({ error: typeCheck.error }, { status: 400 })
    }
  }

  const beforeSnapshot = await loadTicketActivitySnapshot(ticketId)

  const prioCtxRow = await get(tickets, ticketId)
  if (!prioCtxRow) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  if (!beforeSnapshot) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  let companyIdUpdate: string | null | undefined = undefined
  if (company_id !== undefined) {
    companyIdUpdate = company_id || null
  }
  let clearContactDueToCompanyChange = false

  let ticketCrossCompanyWarning: string | undefined

  if (contact_user_id !== undefined) {
    const curRow = prioCtxRow
    const mergedCompanyId =
      company_id !== undefined ? (company_id || null) : (curRow?.companyId ?? null)
    const nextContact =
      contact_user_id === null || contact_user_id === '' ? null : String(contact_user_id)
    const contactCheck = await assertTicketContactUserAllowed(nextContact)
    if (!contactCheck.ok) {
      return NextResponse.json({ error: contactCheck.error }, { status: 400 })
    }

    if (nextContact) {
      const contactEffectiveCompany = await getEffectiveCompanyIdForUser(nextContact)
      if (contactEffectiveCompany && contactEffectiveCompany !== mergedCompanyId) {
        if (company_id !== undefined) {
          // User explicitly changed company — contact belongs to a different company, so clear the contact.
          clearContactDueToCompanyChange = true
        } else {
          // No explicit company change — auto-align company to the contact's company.
          companyIdUpdate = contactEffectiveCompany
          if (curRow?.companyId && curRow.companyId !== contactEffectiveCompany) {
            ticketCrossCompanyWarning =
              'Contact is from another company: ticket company was already aligned to the contact\'s company.'
          }
        }
      }
    }
  }

  let ticketTypeUpdate: string | undefined
  if (ticket_type !== undefined && actorRole !== 'customer') {
    const cls = parseTicketType(ticket_type)
    if (cls) {
      if (cls === 'trash' && !canDeleteTickets(role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      ticketTypeUpdate = cls
    }
  }

  const oldCompanyId = prioCtxRow.companyId ?? null
  const oldTicketType = coerceTicketType(prioCtxRow.ticketType)

  const nextCompanyResolved =
    companyIdUpdate !== undefined ? companyIdUpdate : oldCompanyId

  const nextTicketTypeResolved =
    ticketTypeUpdate !== undefined ? ticketTypeUpdate : oldTicketType

  const companyChanging = nextCompanyResolved !== oldCompanyId

  const closingForSupportQueue =
    status !== undefined &&
    String(status) === 'closed' &&
    beforeSnapshot.status !== 'closed' &&
    nextTicketTypeResolved === DEFAULT_TICKET_TYPE &&
    nextCompanyResolved != null

  const openingFromClosedSupport =
    status !== undefined &&
    beforeSnapshot.status === 'closed' &&
    String(status) !== 'closed' &&
    nextTicketTypeResolved === DEFAULT_TICKET_TYPE &&
    nextCompanyResolved != null

  /** Company queue or creator-only queue (open support tickets only). */
  const priorityRankReorder =
    priority !== undefined &&
    !closingForSupportQueue &&
    nextTicketTypeResolved === DEFAULT_TICKET_TYPE &&
    beforeSnapshot.status !== 'closed'

  const compactAfterLeavingSupport =
    ticket_type !== undefined &&
    actorRole !== 'customer' &&
    oldTicketType === DEFAULT_TICKET_TYPE &&
    nextTicketTypeResolved !== DEFAULT_TICKET_TYPE &&
    oldCompanyId != null

  const compactCompanyQueueAfterClosingSupport =
    closingForSupportQueue &&
    oldTicketType === DEFAULT_TICKET_TYPE &&
    oldCompanyId != null &&
    !companyChanging

  const needsReorderTxn =
    priorityRankReorder ||
    companyChanging ||
    compactAfterLeavingSupport ||
    openingFromClosedSupport ||
    compactCompanyQueueAfterClosingSupport

  const ticketUpdates: Patch<TicketsRow> = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(short_note !== undefined && { shortNote: short_note ?? null }),
    ...(status !== undefined && { status }),
    ...(team_id !== undefined && { teamId: team_id || null }),
    ...(type_id !== undefined && { typeId: type_id ?? null }),
    ...(closingForSupportQueue && { priority: null }),
    ...(priority !== undefined &&
      !priorityRankReorder &&
      !closingForSupportQueue && {
        priority:
          priority === null || priority === ''
            ? null
            : (() => {
                const n = Number(priority)
                return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null
              })(),
      }),
    ...(companyIdUpdate !== undefined && { companyId: companyIdUpdate }),
    ...(due_date !== undefined && { dueDate: due_date ? new Date(due_date) : null }),
    ...(ticketTypeUpdate !== undefined && { ticketType: ticketTypeUpdate }),
    ...(ticketTypeUpdate === 'trash' && { priority: null }),
    ...(clearContactDueToCompanyChange
      ? { contactUserId: null }
      : contact_user_id !== undefined && {
          contactUserId:
            contact_user_id === null || contact_user_id === '' ? null : String(contact_user_id),
        }),
  }

  if (needsReorderTxn) {
    {
      if (companyChanging && oldTicketType === DEFAULT_TICKET_TYPE && oldCompanyId != null) {
        await compactCompanySupportPriorities(oldCompanyId, ticketId)
      }

      if (Object.keys(ticketUpdates).length > 0) {
        await update(tickets, ticketId, { ...ticketUpdates, updatedAt: new Date() })
      }

      if (compactAfterLeavingSupport && oldCompanyId != null) {
        await compactCompanySupportPriorities(oldCompanyId)
      }

      if (priorityRankReorder) {
        if (priority === null || priority === '') {
          const scope = await resolveSupportQueueScope(ticketId)
          await update(tickets, ticketId, { priority: null })
          if (scope) await compactSupportQueueAfterRemoval(scope, ticketId)
        } else {
          await assignSupportTicketPriorityRank(ticketId,
            parseCompanyTicketDesiredRank(priority)
          )
        }
      } else if (openingFromClosedSupport && !priorityRankReorder) {
        await assignSupportTicketPriorityRank(ticketId, 'append')
      } else if (
        companyChanging &&
        !openingFromClosedSupport &&
        priority === undefined &&
        nextTicketTypeResolved === DEFAULT_TICKET_TYPE
      ) {
        await assignSupportTicketPriorityRank(ticketId, 'append')
      }

      if (compactCompanyQueueAfterClosingSupport && oldCompanyId) {
        await compactCompanySupportPriorities(oldCompanyId)
      }
    }
  } else if (Object.keys(ticketUpdates).length > 0) {
    await update(tickets, ticketId, { ...ticketUpdates, updatedAt: new Date() })
  }

  if (assignees !== undefined) {
    await removeWhere(ticketAssignees, [['ticketId', '==', ticketId]])
    if (assignees.length > 0) {
      await insertMany(
        ticketAssignees,
        (assignees as string[]).map((userId) => ({ ticketId, userId }))
      )
    }
  }

  if (tag_ids !== undefined) {
    await removeWhere(ticketTags, [['ticketId', '==', ticketId]])
    if (tag_ids.length > 0) {
      await insertMany(
        ticketTags,
        (tag_ids as string[]).map((tagId) => ({ ticketId, tagId }))
      )
    }
  }

  let attachmentsRemovedMeta: { id: string; file_name: string }[] = []
  if (attachments_delete?.length > 0) {
    const removedRows = (await getMany(ticketAttachments, attachments_delete as string[])).filter(
      (r) => r.ticketId === ticketId
    )
    attachmentsRemovedMeta = removedRows.map((r) => ({ id: r.id, file_name: r.fileName }))
    for (const attId of attachments_delete as string[]) await remove(ticketAttachments, attId)
  }

  if (attachments_add?.length > 0) {
    await insertMany(
      ticketAttachments,
      attachments_add.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        ticketId,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: session.user?.id,
      }))
    )
  }

  if (beforeSnapshot) {
    const afterSnapshot = await loadTicketActivitySnapshot(ticketId)
    if (afterSnapshot) {
      const changes = diffTicketSnapshots(beforeSnapshot, afterSnapshot)
      const meta: Record<string, unknown> = {}
      if (Object.keys(changes).length > 0) meta.changes = changes
      const changedKeys = Object.keys(changes)
      if (changedKeys.length > 0) meta.changed_keys = changedKeys
      if (changedKeys.length > 0) {
        const entityLabels = await enrichActivityEntityLabels(changes)
        if (Object.keys(entityLabels).length > 0) {
          meta.entity_labels = entityLabels
        }
      }
      if (attachments_add.length > 0) {
        meta.attachments_added = attachments_add.map((a: { file_name?: string }) => ({
          file_name: a.file_name ?? '',
        }))
      }
      if (attachmentsRemovedMeta.length > 0) meta.attachments_removed = attachmentsRemovedMeta
      if (Object.keys(meta).length > 0) {
        await logTicketActivity({
          ticketId,
          actorUserId,
          actorRole,
          action: 'ticket_updated',
          metadata: meta,
        })
      }

      const statusChange = changes.status as { from: unknown; to: unknown } | undefined
      if (
        statusChange &&
        statusChange.from !== statusChange.to &&
        afterSnapshot
      ) {
        void notifySlackTicketEvent('status_changed', {
          id: ticketId,
          title: afterSnapshot.title,
          status: afterSnapshot.status,
          teamId: afterSnapshot.teamId,
          priority: afterSnapshot.priority,
          companyId: afterSnapshot.companyId,
          typeId: afterSnapshot.typeId,
          previousStatus: String(statusChange.from),
        })
        try {
          const meta = await get(tickets, ticketId)
          const arows = await findBy(ticketAssignees, { ticketId })
          const recipients = [...arows.map((r) => r.userId), meta?.createdBy].filter(Boolean) as string[]
          const actorName =
            (session.user as { name?: string | null }).name ||
            session.user.email ||
            'Someone'
          await notifyTicketUsers({
            recipientUserIds: recipients,
            excludeUserId: actorUserId,
            ticketId,
            ticketTitle: afterSnapshot.title,
            type: 'status_changed',
            title: 'Ticket status updated',
            body: `"${afterSnapshot.title}": ${statusChange.from} → ${statusChange.to}`,
            actorUserId,
            actorName,
            actorRole: role ?? null,
          })
        } catch (e) {
          console.error('[PATCH ticket full] status notify:', e)
        }
      }

      const assigneeChange = changes.assignee_ids as { from: unknown; to: unknown } | undefined
      if (
        assigneeChange &&
        Array.isArray(assigneeChange.from) &&
        Array.isArray(assigneeChange.to)
      ) {
        const added = diffNewAssignees(assigneeChange.from as string[], assigneeChange.to as string[])
        if (added.length > 0) {
          try {
            const actorName =
              (session.user as { name?: string | null }).name ||
              session.user.email ||
              'Someone'
            await notifyTicketUsers({
              recipientUserIds: added,
              excludeUserId: actorUserId,
              ticketId,
              ticketTitle: afterSnapshot.title,
              type: 'assignee_added',
              title: 'You were assigned',
              body: `Added as assignee on "${afterSnapshot.title}"`,
              actorUserId,
              actorName,
              actorRole: role ?? null,
            })
          } catch (e) {
            console.error('[PATCH ticket assignees] notify:', e)
          }
          try {
            await sendTicketAssignedEmail({
              ticketId,
              ticketTitle: afterSnapshot.title,
              assignedUserIds: added,
              actorUserId,
            })
          } catch (e) {
            console.error('[PATCH ticket assignees] email:', e)
          }
        }
      }

      const tagChange = changes.tag_ids as { from: unknown; to: unknown } | undefined
      if (tagChange && Array.isArray(tagChange.from) && Array.isArray(tagChange.to) && afterSnapshot) {
        const prevIds = tagChange.from as string[]
        const nextIds = tagChange.to as string[]
        const addedIds = nextIds.filter((id) => !prevIds.includes(id))
        if (addedIds.length > 0) {
          try {
            const tagRows = await getMany(tags, addedIds)
            const addedTagNames = tagRows.map((r) => r.name ?? r.id)
            void notifySlackTicketEvent('tag_added', {
              id: ticketId,
              title: afterSnapshot.title,
              status: afterSnapshot.status,
              teamId: afterSnapshot.teamId,
              priority: afterSnapshot.priority,
              companyId: afterSnapshot.companyId,
              typeId: afterSnapshot.typeId,
              addedTagNames,
            })
          } catch (e) {
            console.error('[PATCH ticket tag_added] slack notify:', e)
          }
        }
      }
    }
  }

  await triggerTicketUpdatedAutomation(ticketId)
  bumpTicketDataVersion(ticketId)
  const resBody: Record<string, unknown> = { ok: true }
  if (ticketCrossCompanyWarning) {
    resBody.ticket_cross_company_warning = ticketCrossCompanyWarning
  }
  if (companyIdUpdate !== undefined) {
    resBody.company_id = companyIdUpdate
  }
  if (clearContactDueToCompanyChange) {
    resBody.contact_user_id = null
  }
  return NextResponse.json(resBody)
}

/**
 * DELETE /api/tickets/[id] — does not remove the ticket; moves it to trash (same as ticket_type trash).
 * Data is retained for recovery from the Trash folder.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const delRoleRaw = (session.user as { role?: string }).role
  if (!canDeleteTickets(delRoleRaw)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const delRole = delRoleRaw?.toLowerCase()
  const delActorRole: TicketActorRole = delRole === 'customer' ? 'customer' : 'agent'
  const actorUserId = session.user.id!

  const cur = await get(tickets, ticketId)
  if (!cur) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const beforeType = coerceTicketType(cur.ticketType)
  if (beforeType === 'trash') {
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true, ticket_type: 'trash' })
  }

  await update(tickets, ticketId, { ticketType: 'trash', updatedAt: new Date() })

  if (cur.companyId && beforeType === DEFAULT_TICKET_TYPE) {
    await compactCompanySupportPriorities(cur.companyId)
  }

  await logTicketActivity({
    ticketId,
    actorUserId,
    actorRole: delActorRole,
    action: 'ticket_updated',
    metadata: {
      changed_keys: ['ticket_type'],
      changes: { ticket_type: { from: beforeType, to: 'trash' }, via: 'delete_as_trash' },
    },
  })

  await triggerTicketUpdatedAutomation(ticketId)
  bumpTicketDataVersion(ticketId)

  return NextResponse.json({ ok: true, ticket_type: 'trash' })
}
