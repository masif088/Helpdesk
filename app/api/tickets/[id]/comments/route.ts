import { google } from 'googleapis'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { apiViaLabel } from '@/lib/api-key-core'
import { unauthorizedResponse } from '@/lib/api-key-http'
import { createAppUser, findUserByEmail } from '@/lib/app-users'
import { runTicketCommentAutomation } from '@/lib/automation-engine'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import {
  commentAttachments,
  companies,
  companyUsers,
  emailIntegrations,
  findBy,
  findOneBy,
  get,
  getMany,
  insert,
  insertIgnore,
  insertMany,
  messageTemplates,
  teamMembers,
  ticketAssignees,
  ticketCcRecipients,
  ticketComments,
  tickets,
  update,
  users,
  type UsersRow,
} from '@/lib/fsdb'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'
import { portalGmail } from '@/lib/portal-gmail'
import { markFirstResponse } from '@/lib/sla'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { sendNoteAddedNotificationEmail } from '@/lib/ticket-notification-emails'

const AGENT_REQUESTER_REPLIES_TEMPLATE_KEY = 'agent_notification_requester_replies' as const

function truncateVarchar(s: string | null | undefined, maxLen: number): string {
  if (s == null || s === '') return ''
  const str = String(s).trim()
  return str.length <= maxLen ? str : str.slice(0, maxLen)
}

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

async function sendAgentRequesterRepliesEmail(params: {
  ticketId: number
  actorUserId: string
  ticketTitle: string
  bodyPreview: string
  replyHtml?: string
}) {
  const { ticketId, actorUserId, ticketTitle, bodyPreview, replyHtml } = params

  const ticketRow = await get(tickets, ticketId)
  if (!ticketRow?.teamId) return

  const members = await findBy(teamMembers, { teamId: ticketRow.teamId })
  const memberUsers = await getMany(users, members.map((m) => m.userId))

  const recipientMap = new Map<string, UsersRow>()
  for (const u of memberUsers) {
    if (u.id && u.email) recipientMap.set(u.id, u)
  }

  // Also include the company's active manager if set and not already in the list
  if (ticketRow.companyId) {
    const companyRow = await get(companies, ticketRow.companyId)
    if (companyRow?.activeManagerId && !recipientMap.has(companyRow.activeManagerId)) {
      const managerUser = await get(users, companyRow.activeManagerId)
      if (managerUser?.email) recipientMap.set(managerUser.id, managerUser)
    }
  }

  const recipients = Array.from(recipientMap.values()).filter((u) => u.id !== actorUserId)

  if (recipients.length === 0) return

  const senderUser = await get(users, actorUserId)
  const senderMap = userRowToMergeMap(senderUser ?? null)

  const tpl = await findOneBy(messageTemplates, { key: AGENT_REQUESTER_REPLIES_TEMPLATE_KEY })
  if (!tpl || tpl.status !== 'active') return

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const safeBase = baseUrl.replace(/\/$/, '')
  const ticketUrl = `${safeBase}/tickets/${ticketId}`
  const defaultSubject = `Requester replied on Ticket #${ticketId}`
  const subject = (tpl.emailSubject?.trim() || defaultSubject)
    .replace(/\{\{\s*ticket_id\s*\}\}/g, String(ticketId))
    .replace(/\{\{\s*ticket\s*\}\}/g, `#${ticketId}`)
  const subjectMime = encodeSubjectHeader(subject)

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return

  const integration = await findOneBy(emailIntegrations, { provider: 'google', isActive: true })
  if (!integration?.accessToken) return

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${safeBase}/api/email/google/callback`)
  let accessToken = integration.accessToken
  const expiresAt = integration.expiresAt ? new Date(integration.expiresAt) : null
  const needsRefresh = !expiresAt || expiresAt <= new Date()
  if (needsRefresh && integration.refreshToken) {
    oauth2Client.setCredentials({ refresh_token: integration.refreshToken })
    const { credentials } = await oauth2Client.refreshAccessToken()
    accessToken = credentials.access_token ?? integration.accessToken
    if (credentials.access_token && credentials.expiry_date) {
      await update(emailIntegrations, integration.id, {
        accessToken: credentials.access_token,
        expiresAt: new Date(credentials.expiry_date),
        updatedAt: new Date(),
      })
    }
  } else {
    oauth2Client.setCredentials({ access_token: accessToken })
  }

  const gmail = portalGmail(oauth2Client)
  const fromEmail = integration.emailAddress || 'noreply@example.com'
  const rawTpl = tpl.content?.trim() ?? ''

  for (const recipient of recipients) {
    const recipientMap = userRowToMergeMap(recipient)
    const mergedTpl = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, {
          origin: safeBase,
          ticketId: String(ticketId),
          recipient: recipientMap,
          sender: senderMap,
          extra: {
            reply_content: replyHtml ?? bodyPreview,
            reply_preview: bodyPreview,
          },
          useDomMerge: false,
        })
      : ''

    const fallbackHtml =
      `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
      `<p>The requester has replied on <strong>Ticket #${ticketId}</strong>.</p>` +
      `<p><strong>${ticketTitle}</strong></p>` +
      `<p>${bodyPreview || '(attachment)'}</p>` +
      `<p>Open ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`

    const bodyHtml = mergedTpl || fallbackHtml
    const rawEmail = [
      `From: ${fromEmail}`,
      `To: ${recipient.email}`,
      `Subject: ${subjectMime}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      bodyHtml,
    ].join('\r\n')

    const raw = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) return unauthorizedResponse(session)

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const apiKey = session?.apiKey ?? null
  const body = await request.json()
  const {
    comment,
    // Staff keys write internal notes unless they ask for a reply; customers can only reply
    visibility = apiKey ? 'note' : 'reply',
    author_type = 'agent',
    attachments = [],
    tagged_user_ids = [],
    cc_emails = [],
    bcc_emails = [],
  } = body as {
    comment?: string
    visibility?: string
    author_type?: string
    attachments?: Array<{ file_url: string; file_name: string; file_path: string }>
    tagged_user_ids?: string[]
    cc_emails?: string[]
    bcc_emails?: string[]
  }

  const role = (authUser as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'
  if (isCustomer) {
    const access = await assertCustomerMayAccessTicket(authUser.id, ticketId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? 'Not found' : 'Forbidden' },
        { status: access.status }
      )
    }
  }
  const effectiveVisibility = isCustomer ? 'reply' : visibility
  const effectiveAuthorType = isCustomer ? 'customer' : author_type
  const effectiveTaggedIds = isCustomer ? [] : (Array.isArray(tagged_user_ids) ? tagged_user_ids : [])
  /** Portal customers must not set CC/BCC (UI disabled); ignore forged payloads. */
  const effectiveCcEmails = isCustomer ? [] : Array.isArray(cc_emails) ? cc_emails : []
  const effectiveBccEmails = isCustomer ? [] : Array.isArray(bcc_emails) ? bcc_emails : []

  const row = await insert(ticketComments, {
    ticketId,
    userId: authUser.id,
    comment: comment || '',
    visibility: effectiveVisibility,
    authorType: effectiveAuthorType,
    taggedUserIds: effectiveTaggedIds.length > 0 ? effectiveTaggedIds : null,
    ccEmails:
      effectiveCcEmails.length > 0 ? effectiveCcEmails.filter((e: string) => e?.trim()) : null,
    bccEmails:
      effectiveBccEmails.length > 0 ? effectiveBccEmails.filter((e: string) => e?.trim()) : null,
    via: apiKey ? apiViaLabel(apiKey.name) : null,
  })

  if (!row) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  // Service level: the team's first public reply stops the response clock
  if (!isCustomer && effectiveAuthorType === 'agent' && (effectiveVisibility === 'reply' || effectiveVisibility === 'public')) {
    await markFirstResponse(ticketId, row.createdAt).catch((e) => console.error('[comments] first response:', e))
  }

  await logTicketActivity({
    ticketId,
    actorUserId: authUser.id,
    actorRole: isCustomer ? 'customer' : 'agent',
    action: 'comment_added',
    relatedCommentId: row.id,
    metadata: {
      visibility: effectiveVisibility,
      author_type: effectiveAuthorType,
      ...(apiKey ? { via: apiViaLabel(apiKey.name), api_key_id: apiKey.id } : {}),
      body_preview: (comment || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200),
    },
  })

  const allCcEmails = [
    ...effectiveCcEmails.filter((e: string) => e?.trim()?.includes('@')),
  ].map((e: string) => e.trim().toLowerCase()).filter(Boolean)

  let ticketCompanyId: string | null = null
  if (allCcEmails.length > 0) {
    const ticketRow = await get(tickets, ticketId)
    ticketCompanyId = ticketRow?.companyId ?? null
  }

  for (const trimmed of allCcEmails) {
    if (!trimmed) continue
    try {
      await insertIgnore(ticketCcRecipients, { ticketId, email: truncateVarchar(trimmed, 255) })
    } catch {}

    if (ticketCompanyId) {
      const ccUser = await findUserByEmail(trimmed)
      if (ccUser) {
        await update(users, ccUser.id, { companyId: ticketCompanyId, updatedAt: new Date() })
        try {
          await insertIgnore(companyUsers, { companyId: ticketCompanyId, userId: ccUser.id })
        } catch {}
      } else {
        try {
          const newCcUser = await createAppUser({
            email: truncateVarchar(trimmed, 255),
            fullName: truncateVarchar(trimmed.split('@')[0] || 'User', 255),
            companyId: ticketCompanyId,
            role: 'customer',
          })
          await insertIgnore(companyUsers, { companyId: ticketCompanyId, userId: newCcUser.id })
        } catch (e) {
          console.error('[Comments] CC user create failed:', trimmed, (e as Error)?.message)
        }
      }
    }
  }

  let commentAttachmentsOut: Array<{ id: string; file_url: string; file_name: string }> = []
  if (attachments.length > 0) {
    const inserted = await insertMany(
      commentAttachments,
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        commentId: row.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: authUser.id,
      }))
    )
    commentAttachmentsOut = inserted.map((r) => ({
      id: r.id,
      file_url: r.fileUrl,
      file_name: r.fileName,
    }))
  }

  try {
    await runTicketCommentAutomation(ticketId, {
      visibility: effectiveVisibility,
      authorType: effectiveAuthorType,
    })
  } catch (err) {
    console.error('Automation rules error (ticket_comment_added):', err)
  }

  try {
    const ticketRow = await get(tickets, ticketId)
    const assignRows = await findBy(ticketAssignees, { ticketId })
    const assigneeIds = assignRows.map((r) => r.userId)
    const createdBy = ticketRow?.createdBy ?? null
    const contactUser = ticketRow?.contactUserId ?? null
    const allIds = [
      ...new Set([
        ...effectiveTaggedIds,
        ...assigneeIds,
        ...(createdBy ? [createdBy] : []),
        ...(contactUser && contactUser !== createdBy ? [contactUser] : []),
      ]),
    ]
    const taggedSet = new Set(effectiveTaggedIds)
    const mentionRecipients = allIds.filter((id) => taggedSet.has(id))
    const commentRecipients = allIds.filter((id) => !taggedSet.has(id))
    const actorName = authUser.name || authUser.email || 'Someone'
    const preview = (comment || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ') // change the nbsp to normal space
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
    const ticketTitle = ticketRow?.title || 'Ticket'
    if (mentionRecipients.length > 0) {
      await notifyTicketUsers({
        recipientUserIds: mentionRecipients,
        excludeUserId: authUser.id,
        ticketId,
        ticketTitle,
        type: 'mention',
        title: `${actorName} mentioned you`,
        body: preview || 'New note on ticket',
        actorUserId: authUser.id,
        actorName,
        actorRole: role ?? null,
      })
    }
    // Customer replied → notify staff on the thread (not customers; filtered in notifyTicketUsers).
    if (isCustomer && effectiveTaggedIds.length === 0 && commentRecipients.length > 0) {
      await notifyTicketUsers({
        recipientUserIds: commentRecipients,
        excludeUserId: authUser.id,
        ticketId,
        ticketTitle,
        type: 'new_comment',
        title: 'New ticket activity',
        body: `${actorName}: ${preview || '(attachment)'}`,
        actorUserId: authUser.id,
        actorName,
        actorRole: 'customer',
      })
    }
    // Staff/manager/admin reply (conversation) → notify customers on the thread only (filtered in notifyTicketUsers).
    if (
      !isCustomer &&
      effectiveVisibility === 'reply' &&
      effectiveTaggedIds.length === 0 &&
      commentRecipients.length > 0
    ) {
      await notifyTicketUsers({
        recipientUserIds: commentRecipients,
        excludeUserId: authUser.id,
        ticketId,
        ticketTitle,
        type: 'new_comment',
        title: 'New reply on ticket',
        body: `${actorName}: ${preview || '(attachment)'}`,
        actorUserId: authUser.id,
        actorName,
        actorRole: role ?? null,
      })
    }
  } catch (e) {
    console.error('[comments] firebase notify:', e)
  }

  const taggedUserPayload = await getMany(users, effectiveTaggedIds)
  const tagged_users = taggedUserPayload.map((u) => ({
    id: u.id,
    full_name: u.fullName,
    email: u.email,
  }))

  bumpTicketDataVersion(ticketId)

  if (isCustomer) {
    try {
      const slackTicket = await get(tickets, ticketId)
      if (slackTicket) {
        const slackPreview = (comment || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220)
        void notifySlackTicketEvent('client_reply', {
          id: slackTicket.id,
          title: slackTicket.title,
          status: slackTicket.status,
          teamId: slackTicket.teamId ?? null,
          priority: slackTicket.priority,
          companyId: slackTicket.companyId ?? null,
          typeId: slackTicket.typeId ?? null,
          bodyPreview: slackPreview || undefined,
          actorName: authUser.name || authUser.email || undefined,
        })
      }
    } catch (err) {
      console.error('[comments] slack notify:', err)
    }

    try {
      const ticketForMail = await get(tickets, ticketId)
      const mailPreview = (comment || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)
      await sendAgentRequesterRepliesEmail({
        ticketId,
        actorUserId: authUser.id,
        ticketTitle: ticketForMail?.title || 'Ticket',
        bodyPreview: mailPreview,
        replyHtml: comment || undefined,
      })
    } catch (err) {
      console.error('[comments] team email notify:', err)
    }
  }

  if (effectiveVisibility === 'note') {
    try {
      const ticketForNote = await get(tickets, ticketId)
      const notePreview = (comment || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)
      await sendNoteAddedNotificationEmail({
        ticketId,
        ticketTitle: ticketForNote?.title || 'Ticket',
        notePreview,
        noteHtml: comment || undefined,
        actorUserId: authUser.id,
      })
    } catch (err) {
      console.error('[comments] note email notify:', err)
    }
  }

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    user_id: row.userId,
    comment: row.comment,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    visibility: row.visibility ?? 'reply',
    author_type: row.authorType ?? 'agent',
    tagged_user_ids: row.taggedUserIds ?? [],
    tagged_users,
    cc_emails: row.ccEmails ?? [],
    bcc_emails: row.bccEmails ?? [],
    via: row.via ?? null,
    user: { id: authUser.id, full_name: authUser.name, email: authUser.email, avatar_url: authUser.image },
    comment_attachments: commentAttachmentsOut,
  })
}
