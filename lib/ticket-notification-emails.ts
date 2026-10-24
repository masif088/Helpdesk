import { google } from 'googleapis'

import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import {
  companies,
  emailIntegrations,
  findBy,
  findOneBy,
  get,
  getMany,
  messageTemplates,
  teamMembers,
  tickets,
  update,
  users,
  type UsersRow,
} from '@/lib/fsdb'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'
import { portalGmail } from '@/lib/portal-gmail'

async function fetchCompanyName(companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null
  const row = await get(companies, companyId)
  return row?.name ?? null
}

/** Users that are members of a team. */
async function teamMemberUsers(teamId: string): Promise<UsersRow[]> {
  const members = await findBy(teamMembers, { teamId })
  return getMany(users, members.map((m) => m.userId))
}

function mergeSubject(subject: string, ticketId: number, ticketTitle?: string): string {
  return subject
    .replace(/\{\{\s*ticket_id\s*\}\}/g, String(ticketId))
    .replace(/\{\{\s*ticket_title\s*\}\}/g, ticketTitle ?? '—')
}

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

type GmailSender = {
  gmail: ReturnType<typeof google.gmail>
  fromEmail: string
  integrationId: string
}

async function getGmailSender(): Promise<GmailSender | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) return null

  const integration = await findOneBy(emailIntegrations, { provider: 'google', isActive: true })

  if (!integration?.accessToken) return null

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${baseUrl.replace(/\/$/, '')}/api/email/google/callback`)
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

  return {
    gmail: portalGmail(oauth2Client),
    fromEmail: integration.emailAddress || 'noreply@example.com',
    integrationId: integration.id,
  }
}

async function sendRawEmail(
  sender: GmailSender,
  to: string,
  subject: string,
  bodyHtml: string,
  fromHeader?: string,
  opts?: { inReplyTo?: string | null; gmailThreadId?: string | null }
) {
  const subjectMime = encodeSubjectHeader(subject)
  const lines = [
    `From: ${fromHeader ?? sender.fromEmail}`,
    `To: ${to}`,
    `Subject: ${subjectMime}`,
    'MIME-Version: 1.0',
  ]
  if (opts?.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`)
    lines.push(`References: ${opts.inReplyTo}`)
  }
  lines.push('Content-Type: text/html; charset=UTF-8', '', bodyHtml)
  const rawEmail = lines.join('\r\n')
  const raw = Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const requestBody: { raw: string; threadId?: string } = { raw }
  if (opts?.gmailThreadId) requestBody.threadId = opts.gmailThreadId
  await sender.gmail.users.messages.send({ userId: 'me', requestBody })
}

/**
 * Send a one-off HTML email from the connected mailbox (e.g. an invoice). `to` may list several addresses.
 * Returns false when no mailbox is connected.
 */
export async function sendHtmlEmail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return false
  await sendRawEmail(gmailSender, to, subject, bodyHtml, formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail))
  return true
}

/**
 * Send `requester_notification_agent_closes` to the ticket creator when an agent closes the ticket.
 */
export async function sendAgentClosesTicketEmail(params: {
  ticketId: number
  ticketTitle: string
  agentUserId: string
}) {
  const { ticketId, ticketTitle, agentUserId } = params

  const tpl = await findOneBy(messageTemplates, { key: 'requester_notification_agent_closes' })
  if (!tpl || tpl.status !== 'active') return

  const ticketRow = await get(tickets, ticketId)
  if (!ticketRow?.createdBy) return

  const recipient = await get(users, ticketRow.createdBy)
  if (!recipient?.email) return

  const agent = await get(users, agentUserId)
  const companyName = await fetchCompanyName(ticketRow.companyId)

  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const recipientMap = userRowToMergeMap(recipient, companyName)
  const senderMap = userRowToMergeMap(agent ?? null)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = mergeSubject(tpl.emailSubject?.trim() || `Ticket #${ticketId} has been closed`, ticketId, ticketTitle)

  const mergedHtml = rawTpl
    ? mergeMessageTemplateHtml(rawTpl, { origin: baseUrl, ticketId: String(ticketId), recipient: recipientMap, sender: senderMap, extra: { ticket_title: ticketTitle }, useDomMerge: false })
    : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
      `<p>Your ticket <strong>#${ticketId}: ${ticketTitle}</strong> has been closed.</p>` +
      `<p>View ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`
  // Clients are asked how it went (they rate on the ticket page in the portal)
  const bodyHtml =
    recipient.role?.toLowerCase() === 'customer'
      ? mergedHtml + `<p style="margin-top:16px;">How did we do? <a href="${ticketUrl}">Rate this ticket</a> — it takes a few seconds.</p>`
      : mergedHtml

  await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader, { gmailThreadId: ticketRow.gmailThreadId })
}

/**
 * Send `agent_notification_new_ticket_created` to all team members when a ticket is
 * created by a customer (or via email). NOT sent when created by agent/staff/admin.
 */
export async function sendNewTicketAgentNotificationEmail(params: {
  ticketId: number
  ticketTitle: string
  teamId: string
  creatorUserId: string
}) {
  const { ticketId, ticketTitle, teamId, creatorUserId } = params

  const tpl = await findOneBy(messageTemplates, { key: 'agent_notification_new_ticket_created' })
  if (!tpl || tpl.status !== 'active') return

  const recipients = (await teamMemberUsers(teamId))
    .filter((u) => Boolean(u.email))
    .filter((u) => u.id !== creatorUserId)

  if (recipients.length === 0) return

  const creator = await get(users, creatorUserId)
  const creatorCompanyName = await fetchCompanyName(creator?.companyId)
  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const senderMap = userRowToMergeMap(creator ?? null, creatorCompanyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = mergeSubject(tpl.emailSubject?.trim() || `New ticket #${ticketId} assigned to your team`, ticketId, ticketTitle)

  for (const recipient of recipients) {
    const recipientCompanyName = await fetchCompanyName(recipient.companyId)
    const recipientMap = userRowToMergeMap(recipient, recipientCompanyName)
    const bodyHtml = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, { origin: baseUrl, ticketId: String(ticketId), recipient: recipientMap, sender: senderMap, extra: { ticket_title: ticketTitle }, useDomMerge: false })
      : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
        `<p>A new ticket has been submitted: <strong>#${ticketId}: ${ticketTitle}</strong></p>` +
        `<p>View ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`
    await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader)
  }
}

/**
 * Send `agent_notification_ticket_assigned_agent` to each newly-assigned user when
 * the ticket's assignees list changes.
 */
export async function sendTicketAssignedEmail(params: {
  ticketId: number
  ticketTitle: string
  assignedUserIds: string[]
  actorUserId: string
}) {
  const { ticketId, ticketTitle, assignedUserIds, actorUserId } = params
  if (assignedUserIds.length === 0) return

  const tpl = await findOneBy(messageTemplates, { key: 'agent_notification_ticket_assigned_agent' })
  if (!tpl || tpl.status !== 'active') return

  const ticketRow = await get(tickets, ticketId)

  const actor = await get(users, actorUserId)
  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const senderMap = userRowToMergeMap(actor ?? null)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = mergeSubject(tpl.emailSubject?.trim() || `You have been assigned to Ticket #${ticketId}`, ticketId, ticketTitle)

  for (const userId of assignedUserIds) {
    if (userId === actorUserId) continue
    const recipient = await get(users, userId)
    if (!recipient?.email) continue
    const recipientCompanyName = await fetchCompanyName(recipient.companyId ?? ticketRow?.companyId)
    const recipientMap = userRowToMergeMap(recipient, recipientCompanyName)
    const bodyHtml = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, { origin: baseUrl, ticketId: String(ticketId), recipient: recipientMap, sender: senderMap, extra: { ticket_title: ticketTitle }, useDomMerge: false })
      : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
        `<p>You have been assigned to <strong>Ticket #${ticketId}: ${ticketTitle}</strong> by ${senderMap.full_name !== '—' ? senderMap.full_name : 'an agent'}.</p>` +
        `<p><a href="${ticketUrl}">View Ticket</a></p>`
    await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader)
  }
}

/**
 * Send `agent_notification_note_added` to all team members when anyone adds a note
 * (internal note, visibility = 'note').
 */
export async function sendNoteAddedNotificationEmail(params: {
  ticketId: number
  ticketTitle: string
  notePreview: string
  noteHtml?: string
  actorUserId: string
}) {
  const { ticketId, ticketTitle, notePreview, noteHtml, actorUserId } = params

  const tpl = await findOneBy(messageTemplates, { key: 'agent_notification_note_added' })
  if (!tpl || tpl.status !== 'active') return

  const ticketRow = await get(tickets, ticketId)
  if (!ticketRow?.teamId) return

  const recipients = (await teamMemberUsers(ticketRow.teamId))
    .filter((u) => Boolean(u.email))
    .filter((u) => u.id !== actorUserId)

  if (recipients.length === 0) return

  const actor = await get(users, actorUserId)
  const actorCompanyName = await fetchCompanyName(actor?.companyId)
  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const senderMap = userRowToMergeMap(actor ?? null, actorCompanyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = mergeSubject(tpl.emailSubject?.trim() || `Note added on Ticket #${ticketId}`, ticketId, ticketTitle)

  for (const recipient of recipients) {
    const recipientCompanyName = await fetchCompanyName(recipient.companyId)
    const recipientMap = userRowToMergeMap(recipient, recipientCompanyName)
    const bodyHtml = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, {
          origin: baseUrl,
          ticketId: String(ticketId),
          recipient: recipientMap,
          sender: senderMap,
          extra: { ticket_title: ticketTitle, reply_content: noteHtml ?? notePreview, reply_preview: notePreview },
          useDomMerge: false,
        })
      : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
        `<p>A note was added on <strong>Ticket #${ticketId}: ${ticketTitle}</strong></p>` +
        `<p>${notePreview || '(attachment)'}</p>` +
        `<p>View ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`
    await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader)
  }
}
