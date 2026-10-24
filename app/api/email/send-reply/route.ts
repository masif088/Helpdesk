import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { emailIntegrations, emailMessages, findBy, findOneBy, get, insert, sortRows, tickets, update } from '@/lib/fsdb'
import { portalGmail } from '@/lib/portal-gmail'
import { getObjectBuffer } from '@/lib/storage-provider'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
}

function guessMimeType(fileName: string, headerType?: string): string {
  const t = headerType?.split(';')[0]?.trim()
  if (t && t !== 'binary/octet-stream' && t !== 'application/octet-stream') return t
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

function foldBase64(b64: string): string {
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76))
  }
  return lines.join('\r\n')
}

function contentDispositionAttachment(fileName: string): string {
  const asciiSafe = fileName.replace(/[^\x20-\x7E]/g, '_')
  const star = encodeURIComponent(fileName)
  return `attachment; filename="${asciiSafe.replace(/["\\]/g, '_')}"; filename*=UTF-8''${star}`
}

type IncomingAttachment = { file_url?: string; file_name: string; file_path?: string }

/** RFC 2047 encode subject when it contains non-ASCII (e.g. ticket title). */
function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}


async function loadAttachmentBytes(a: IncomingAttachment): Promise<{
  buffer: Buffer
  mime: string
  fileName: string
}> {
  const fileName = a.file_name?.trim() || 'attachment'
  if (a.file_path?.trim()) {
    const got = await getObjectBuffer(a.file_path.trim())
    if (!('error' in got)) {
      return {
        buffer: got.buffer,
        mime: guessMimeType(fileName, got.contentType),
        fileName,
      }
    }
    console.warn('[send-reply] Storage get failed for', a.file_path, got.error)
  }
  const url = a.file_url?.trim()
  if (url) {
    const res = await fetch(url)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const ct = res.headers.get('content-type') || undefined
      return { buffer: buf, mime: guessMimeType(fileName, ct), fileName }
    }
    console.warn('[send-reply] Fetch failed for', url, res.status)
  }
  throw new Error(`Could not load attachment: ${fileName}`)
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      ticketId,
      commentBody = '',
      ticketTitle,
      toEmail: toEmailRaw,
      companyEmail: companyEmailLegacy,
      ccEmails = [],
      bccEmails = [],
      attachments: rawAttachments = [],
    } = body as {
      ticketId: number
      commentBody?: string
      ticketTitle?: string
      /** Primary recipient (e.g. ticket creator / customer) */
      toEmail?: string
      /** @deprecated use toEmail — still accepted for older clients */
      companyEmail?: string
      ccEmails?: string[]
      bccEmails?: string[]
      attachments?: IncomingAttachment[]
    }

    const recipientEmail = (typeof toEmailRaw === 'string' ? toEmailRaw.trim() : '') || (typeof companyEmailLegacy === 'string' ? companyEmailLegacy.trim() : '')

    const ticketIdNum =
      typeof ticketId === 'number' && Number.isFinite(ticketId)
        ? ticketId
        : parseInt(String(ticketId ?? ''), 10)

    const attachmentList = Array.isArray(rawAttachments) ? rawAttachments : []
    const bodyText = typeof commentBody === 'string' ? commentBody : ''
    const hasText = bodyText.trim().length > 0
    const hasFiles = attachmentList.length > 0

    if (!Number.isFinite(ticketIdNum) || ticketIdNum < 1 || !recipientEmail || (!hasText && !hasFiles)) {
      return NextResponse.json(
        { error: 'Missing ticketId, recipient email (toEmail), or message body / attachments' },
        { status: 400 }
      )
    }

    const ccList = Array.isArray(ccEmails) ? ccEmails.filter((e) => e?.trim()) : []
    const bccList = Array.isArray(bccEmails) ? bccEmails.filter((e) => e?.trim()) : []

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Email integration not configured' },
        { status: 503 }
      )
    }

    const integration = await findOneBy(emailIntegrations, { provider: 'google', isActive: true })

    if (!integration?.accessToken) {
      return NextResponse.json(
        { error: 'Email integration not connected' },
        { status: 503 }
      )
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      `${baseUrl}/api/email/google/callback`
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

    const gmail = portalGmail(oauth2Client, { human: true })
    const fromEmailAddress = integration.emailAddress || 'noreply@example.com'

    const appSettings = await getAppSettings()
    const displayName = appSettings.email_sender_name?.trim() || null
    const fromEmail = formatFromHeader(displayName, fromEmailAddress)

    const ticketRow = await get(tickets, ticketIdNum)

    // Subject is resolved after firstIncoming is fetched below — placeholder here.
    let subjectPlain = ''
    let subjectMime = ''

    // Agent replies thread to the notification email we sent when the ticket was created.
    // This keeps all replies in the same thread as the customer's original email (the notification
    // was sent as a reply to the customer's email, so they share a threadId).
    const ticketEmails = sortRows(await findBy(emailMessages, { ticketId: ticketIdNum }), [['syncedAt', 'asc']])
    const notificationEmail = ticketEmails.find((m) => m.direction === 'outgoing' && m.rfcMessageId != null)

    // Fallback: if no outgoing notification exists (e.g. ticket created via portal),
    // use the first incoming email from the customer.
    const recipientLower = recipientEmail.toLowerCase()
    const firstIncoming = notificationEmail
      ? undefined
      : ticketEmails.find(
          (m) =>
            m.direction === 'incoming' &&
            m.rfcMessageId != null &&
            (m.fromEmail ?? '').toLowerCase().includes(recipientLower)
        )

    const threadId = ticketRow?.gmailThreadId || notificationEmail?.threadId || firstIncoming?.threadId || null
    let inReplyTo = notificationEmail?.rfcMessageId || firstIncoming?.rfcMessageId || null

    // Use the notification email's subject so Gmail groups the reply in the same conversation.
    // Fall back to raw ticket title if no notification subject is stored.
    const rawTitle = (ticketRow?.title || ticketTitle || '').trim()
    const fallbackSubject = rawTitle ? `Ticket #${ticketIdNum} - ${rawTitle}` : `Ticket #${ticketIdNum}`
    subjectPlain = notificationEmail?.subject?.trim() || fallbackSubject
    subjectMime = encodeSubjectHeader(subjectPlain)

    if (threadId && !inReplyTo) {
      try {
        const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId })
        const messages = threadRes.data.messages || []
        const lastMsg = messages[messages.length - 1]
        if (lastMsg?.id) {
          const msgRes = await gmail.users.messages.get({ userId: 'me', id: lastMsg.id, format: 'metadata', metadataHeaders: ['Message-ID'] })
          const msgHeaders = (msgRes.data.payload?.headers || []) as { name: string; value: string }[]
          const mid = msgHeaders.find((h) => h.name.toLowerCase() === 'message-id')?.value?.trim()
          if (mid) inReplyTo = mid
        }
      } catch {
        // continue without In-Reply-To
      }
    }

    const ticketUrl = `${baseUrl}/tickets/${ticketIdNum}`
    // const portalFooter = `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#666;">To view ticket details, please visit our portal: <a href="${ticketUrl}">${ticketUrl}</a></p>`
    const innerHtml =
      hasText
        ? (bodyText.trim().includes('<')
            ? bodyText.trim()
            : bodyText.trim().replace(/\n/g, '<br>'))
        : '<p>&nbsp;</p>'
    const bodyHtml = innerHtml 
    // + portalFooter

    const headers: string[] = [
      'From: ' + fromEmail,
      'To: ' + recipientEmail,
      'Subject: ' + subjectMime,
      'MIME-Version: 1.0',
    ]
    if (ccList.length > 0) headers.push('Cc: ' + ccList.join(', '))
    if (bccList.length > 0) headers.push('Bcc: ' + bccList.join(', '))
    if (inReplyTo) {
      headers.push('In-Reply-To: ' + inReplyTo)
      headers.push('References: ' + inReplyTo)
    }

    let emailBody: string
    if (!hasFiles) {
      headers.push('Content-Type: text/html; charset=UTF-8')
      headers.push('')
      headers.push(bodyHtml)
      emailBody = headers.join('\r\n')
    } else {
      const loaded = await Promise.all(attachmentList.map((a) => loadAttachmentBytes(a)))
      const mixedBoundary = 'mix_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
      headers.push('')

      const parts: string[] = [
        `--${mixedBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyHtml,
      ]
      for (const { buffer, mime, fileName } of loaded) {
        parts.push(
          `--${mixedBoundary}`,
          `Content-Type: ${mime}; name="${fileName.replace(/"/g, '')}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: ${contentDispositionAttachment(fileName)}`,
          '',
          foldBase64(buffer.toString('base64'))
        )
      }
      parts.push(`--${mixedBoundary}--`)
      emailBody = headers.join('\r\n') + '\r\n' + parts.join('\r\n')
    }

    const raw = Buffer.from(emailBody)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const requestBody: { raw: string; threadId?: string } = { raw }
    // threadId is required by the Gmail API to place the sent message into the correct thread.
    // In-Reply-To/References headers handle threading in the recipient's email client.
    if (threadId) {
      requestBody.threadId = threadId
    }

    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    })

    const sentMessageId = sendRes.data.id
    const sentThreadId = sendRes.data.threadId

    if (sentMessageId) {
      await insert(emailMessages, {
        gmailMessageId: sentMessageId,
        threadId: sentThreadId || null,
        fromEmail,
        toEmail: recipientEmail,
        subject: subjectPlain,
        snippet: bodyText.trim().slice(0, 500) || (hasFiles ? `(${attachmentList.length} attachment(s))` : ''),
        ticketId: ticketIdNum,
        direction: 'outgoing',
      })
      if (sentThreadId && ticketRow && !ticketRow.gmailThreadId) {
        await update(tickets, ticketIdNum, { gmailThreadId: sentThreadId, updatedAt: new Date() })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Send reply email error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
