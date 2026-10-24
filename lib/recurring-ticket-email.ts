import { google } from 'googleapis'

import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { companies, emailIntegrations, findOneBy, get, messageTemplates, update, users } from '@/lib/fsdb'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'
import { portalGmail } from '@/lib/portal-gmail'

export const RECURRING_TICKET_CREATED_TEMPLATE_KEY =
  'requester_notification_recurring_ticket_created' as const

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

function mergeSubject(subject: string, ticketId: number, ticketTitle?: string): string {
  return subject
    .replace(/\{\{\s*ticket_id\s*\}\}/g, String(ticketId))
    .replace(/\{\{\s*ticket_title\s*\}\}/g, ticketTitle ?? '—')
}

export type SendRecurringTicketCreatedEmailParams = {
  ticketId: number
  ticketTitle: string
  companyId: string | null
  /** Prefer this user's email when set; otherwise fall back to company.email */
  contactUserId: string | null
  /** Optional actor for {{ sender.* }} placeholders (rule creator) */
  createdByUserId?: string | null
}

/**
 * Notify company email (or contact user if set) when a recurring rule creates a ticket.
 * Uses message template `requester_notification_recurring_ticket_created`.
 */
export async function sendRecurringTicketCreatedEmail(
  params: SendRecurringTicketCreatedEmailParams
): Promise<boolean> {
  const { ticketId, ticketTitle, companyId, contactUserId, createdByUserId } = params

  let recipientEmail: string | null = null
  let recipientUser: typeof users.$inferSelect | null = null
  let companyName: string | null = null
  let companyEmail: string | null = null

  if (companyId) {
    const companyRow = await get(companies, companyId)
    companyName = companyRow?.name ?? null
    companyEmail = companyRow?.email?.trim() || null
  }

  if (contactUserId) {
    const contact = await get(users, contactUserId)
    const email = contact?.email?.trim() || null
    if (email) {
      recipientEmail = email
      recipientUser = contact ?? null
    } else {
      console.warn(
        `[recurring-ticket-email] contact user ${contactUserId} has no email; falling back to company email`
      )
    }
  }

  if (!recipientEmail) {
    recipientEmail = companyEmail
  }

  if (!recipientEmail) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: no contact email and no company email`
    )
    return false
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set`
    )
    return false
  }

  const integration = await findOneBy(emailIntegrations, { provider: 'google', isActive: true })

  if (!integration?.accessToken) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: no active Google email integration`
    )
    return false
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl.replace(/\/$/, '')}/api/email/google/callback`
  )

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
  const appSettings = await getAppSettings()
  const fromHeader = formatFromHeader(appSettings.email_sender_name, fromEmail)
  const safeBase = baseUrl.replace(/\/$/, '')
  const ticketUrl = `${safeBase}/tickets/${ticketId}`

  const tpl = await findOneBy(messageTemplates, { key: RECURRING_TICKET_CREATED_TEMPLATE_KEY, status: 'active' })

  if (!tpl) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: template ${RECURRING_TICKET_CREATED_TEMPLATE_KEY} not active`
    )
    return false
  }

  let senderUser: typeof users.$inferSelect | null = null
  if (createdByUserId) {
    senderUser = await get(users, createdByUserId)
  }

  const recipientMap = userRowToMergeMap(recipientUser, companyName)
  if (!recipientUser && recipientEmail) {
    recipientMap.email = recipientEmail
    if (companyName) recipientMap.company_name = companyName
    if (recipientMap.full_name === '—') recipientMap.full_name = companyName || recipientEmail
  }

  const senderMap = userRowToMergeMap(senderUser, companyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = mergeSubject(
    tpl.emailSubject?.trim() || `Recurring ticket #{{ ticket_id }} has been created`,
    ticketId,
    ticketTitle
  )
  const subjectMime = encodeSubjectHeader(subject)

  const mergedTpl = rawTpl
    ? mergeMessageTemplateHtml(rawTpl, {
        origin: safeBase,
        ticketId: String(ticketId),
        recipient: recipientMap,
        sender: senderMap,
        extra: { ticket_title: ticketTitle },
        useDomMerge: false,
      })
    : ''

  const fallbackHtml =
    `<p>Hello${recipientMap.full_name !== '—' ? ` ${recipientMap.full_name}` : ''},</p>` +
    `<p>A scheduled recurring ticket has been created.</p>` +
    `<p><strong>Ticket #${ticketId}</strong>: ${ticketTitle}</p>` +
    `<p>You can view your ticket here: <a href="${ticketUrl}">${ticketUrl}</a></p>`

  const bodyHtml = mergedTpl || fallbackHtml
  const rawEmail = [
    `From: ${fromHeader}`,
    `To: ${recipientEmail}`,
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

  return true
}
