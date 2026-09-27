import { randomBytes } from 'crypto'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { afterUserRowChanged, findUserByEmail, setUserPassword } from '@/lib/app-users'
import { isContactKind } from '@/lib/contact-kind'
import {
  companies,
  companyUsers,
  emailIntegrations,
  findOneBy,
  get,
  messageTemplates,
  type Patch,
  removeWhere,
  update,
  users,
} from '@/lib/fsdb'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'
import {
  actorRoleFromSession,
  logSystemActivity,
  logUserUpdated,
  userRowToLogSnapshot,
} from '@/lib/system-activity-log'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

function generateTemporaryPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length]
  }
  return out
}

async function sendCustomerResetPasswordEmail(params: {
  toEmail: string
  temporaryPassword: string
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) {
    throw new Error('Email integration not configured')
  }

  const tpl = await findOneBy(messageTemplates, { key: 'requester_notification_password_reset' })
  if (!tpl || tpl.status !== 'active') return

  const integration = await findOneBy(emailIntegrations, { provider: 'google', isActive: true })

  if (!integration?.accessToken) {
    throw new Error('Email integration not connected')
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

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const fromEmail = integration.emailAddress || 'noreply@example.com'
  const appSettings = await getAppSettings()
  const fromHeader = formatFromHeader(appSettings.email_sender_name, fromEmail)
  const safeBaseUrl = baseUrl.replace(/\/$/, '')
  const loginUrl = `${safeBaseUrl}/login`
  const changePasswordUrl = `${safeBaseUrl}/change-password`
  const subject = 'Your portal password has been reset'
  const subjectMime = encodeSubjectHeader(subject)

  // Fetch recipient user row for merge maps
  const recipientUser = await findUserByEmail(params.toEmail)

  const recipientMap = userRowToMergeMap(recipientUser ?? null)

  const fallbackHtml =
    `<p>Hello,</p>` +
    `<p>An admin has reset your portal password.</p>` +
    `<p><strong>Temporary password:</strong> <code>${params.temporaryPassword}</code></p>` +
    `<p>Please sign in at <a href="${loginUrl}">${loginUrl}</a> and change your password immediately at <a href="${changePasswordUrl}">${changePasswordUrl}</a>.</p>` +
    `<p>If you did not expect this reset, please contact your administrator right away.</p>`

  const rawTpl = tpl.content?.trim() ?? ''
  const bodyHtml = rawTpl
    ? mergeMessageTemplateHtml(rawTpl, {
        origin: safeBaseUrl,
        ticketId: '',
        recipient: recipientMap,
        sender: recipientMap,
        extra: {
          temporary_password: params.temporaryPassword,
          login_url: loginUrl,
          change_password_url: changePasswordUrl,
        },
        useDomMerge: false,
      })
    : fallbackHtml

  const rawEmail = [
    `From: ${fromHeader}`,
    `To: ${params.toEmail}`,
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

async function sendUserActivationEmail(params: { toEmail: string }) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) {
    throw new Error('Email integration not configured')
  }

  const tpl = await findOneBy(messageTemplates, { key: 'requester_notification_user_activation' })

  const integration = await findOneBy(emailIntegrations, { provider: 'google', isActive: true })

  if (!integration?.accessToken) {
    throw new Error('Email integration not connected')
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

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const fromEmail = integration.emailAddress || 'noreply@example.com'
  const appSettings = await getAppSettings()
  const fromHeader = formatFromHeader(appSettings.email_sender_name, fromEmail)
  const safeBaseUrl = baseUrl.replace(/\/$/, '')
  const loginUrl = `${safeBaseUrl}/login`
  const changePasswordUrl = `${safeBaseUrl}/change-password`
  const subject = 'Activate your portal account'
  const subjectMime = encodeSubjectHeader(subject)

  const recipientUser = await findUserByEmail(params.toEmail)

  const recipientMap = userRowToMergeMap(recipientUser ?? null)

  const fallbackHtml =
    `<p>Hello,</p>` +
    `<p>A portal account has been created for you.</p>` +
    `<p>You can login at <a href="${loginUrl}">${loginUrl}</a> and update your password at <a href="${changePasswordUrl}">${changePasswordUrl}</a>.</p>`

  // Manual admin send should always deliver; use template when active, otherwise fallback.
  const rawTpl = tpl?.status === 'active' ? tpl.content?.trim() ?? '' : ''
  const bodyHtml = rawTpl
    ? mergeMessageTemplateHtml(rawTpl, {
        origin: safeBaseUrl,
        ticketId: '',
        recipient: recipientMap,
        sender: recipientMap,
        useDomMerge: false,
      })
    : fallbackHtml

  const rawEmail = [
    `From: ${fromHeader}`,
    `To: ${params.toEmail}`,
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

/** GET /api/users/[id] - Get user detail */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const userDoc = await get(users, id)
  if (!userDoc) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  const row = { user: userDoc, company: await get(companies, userDoc.companyId) }

  const u = row.user
  return NextResponse.json({
    id: u.id,
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    full_name: u.fullName,
    role: u.role,
    status: u.status,
    company_id: u.companyId,
    company: row.company ? { id: row.company.id, name: row.company.name } : null,
    avatar_url: u.avatarUrl,
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    updated_at: u.updatedAt ? new Date(u.updatedAt).toISOString() : '',
    last_login_at: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    last_active_at: u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : null,
    phone: u.phone,
    department: u.department,
    position: u.position,
    bio: u.bio,
    timezone: u.timezone,
    locale: u.locale,
    is_email_verified: u.isEmailVerified,
    contact_kind: u.contactKind ?? null,
  })
}

/** PATCH /api/users/[id] - Update user */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isAdmin = role === 'admin'
  const targetUser = await get(users, id)
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const beforeSnapshot = userRowToLogSnapshot(targetUser)

  if (body.send_reset_email) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if ((targetUser.role || '').toLowerCase() !== 'customer') {
      return NextResponse.json({ error: 'Reset email is only available for customer users' }, { status: 400 })
    }
    if (!targetUser.email) {
      return NextResponse.json({ error: 'Customer email is missing' }, { status: 400 })
    }
    const temporaryPassword = generateTemporaryPassword(12)
    await setUserPassword(targetUser, temporaryPassword, { mustChangePassword: true, revokeSessions: true })
    await update(users, id, { updatedAt: new Date() })
    await sendCustomerResetPasswordEmail({
      toEmail: targetUser.email,
      temporaryPassword,
    })
    await logUserUpdated({
      actorUserId: session.user.id ?? null,
      actorRole: actorRoleFromSession(session),
      targetUserId: id,
      before: beforeSnapshot,
      after: beforeSnapshot,
      extra: { password_reset_email_sent: true },
    })
    return NextResponse.json({ ok: true, sent: true })
  }

  if (body.send_activation_email) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!targetUser.email) {
      return NextResponse.json({ error: 'User email is missing' }, { status: 400 })
    }
    await sendUserActivationEmail({ toEmail: targetUser.email })
    await logUserUpdated({
      actorUserId: session.user.id ?? null,
      actorRole: actorRoleFromSession(session),
      targetUserId: id,
      before: beforeSnapshot,
      after: beforeSnapshot,
      extra: { activation_email_sent: true },
    })
    return NextResponse.json({ ok: true, sent: true })
  }

  const updateData: Patch<typeof users.$inferSelect> = {}
  if (body.full_name !== undefined) updateData.fullName = body.full_name
  if (body.first_name !== undefined) updateData.firstName = body.first_name || null
  if (body.last_name !== undefined) updateData.lastName = body.last_name || null
  if (body.role !== undefined) updateData.role = body.role
  if (body.status !== undefined) {
    updateData.status = body.status
    if (String(body.status).toLowerCase() === 'active') {
      updateData.deletedAt = null
    }
  }
  if (body.company_id !== undefined) updateData.companyId = body.company_id || null
  const removingFromCompany = body.company_id === null || body.company_id === ''
  if (body.avatar_url !== undefined) updateData.avatarUrl = body.avatar_url
  if (body.phone !== undefined) updateData.phone = body.phone || null
  if (body.department !== undefined) updateData.department = body.department || null
  if (body.position !== undefined) updateData.position = body.position || null
  if (body.bio !== undefined) updateData.bio = body.bio || null
  if (body.timezone !== undefined) updateData.timezone = body.timezone || 'UTC'
  if (body.locale !== undefined) updateData.locale = body.locale || 'en'
  if (body.is_email_verified !== undefined) updateData.isEmailVerified = body.is_email_verified
  if (body.contact_kind !== undefined) {
    if (!isContactKind(body.contact_kind)) {
      return NextResponse.json({ error: 'contact_kind must be person or automated' }, { status: 400 })
    }
    updateData.contactKind = body.contact_kind
  }

  // Admin can change any user's password
  if (isAdmin && body.password) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    await setUserPassword(targetUser, String(body.password), { revokeSessions: true })
  }

  const passwordChanged = Boolean(isAdmin && body.password)
  const afterRow = await update(users, id, { ...updateData, updatedAt: new Date() })
  if (removingFromCompany) {
    await removeWhere(companyUsers, [['userId', '==', id]])
  }

  if (afterRow) {
    await afterUserRowChanged(targetUser, afterRow)
    const extra: Record<string, unknown> = {}
    if (passwordChanged) extra.password_changed = true
    await logUserUpdated({
      actorUserId: session.user.id ?? null,
      actorRole: actorRoleFromSession(session),
      targetUserId: id,
      before: beforeSnapshot,
      after: userRowToLogSnapshot(afterRow),
      extra: Object.keys(extra).length ? extra : undefined,
    })
  }

  revalidateTicketsLookupCatalog()
  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/users/[id] — does not remove the row; deactivates the account (same as a soft delete).
 * User cannot sign in until an admin sets status back to active (clears deleted_at).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (id === session.user.id) {
    return NextResponse.json({ error: 'You cannot deactivate your own account this way' }, { status: 400 })
  }

  const target = await get(users, id)
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const deactivated = await update(users, id, {
    status: 'inactive',
    deletedAt: new Date(),
    updatedAt: new Date(),
  })
  if (deactivated) await afterUserRowChanged(target, deactivated)

  await logSystemActivity({
    category: 'user',
    action: 'user_deactivated',
    entityType: 'user',
    entityId: id,
    actorUserId: session.user.id ?? null,
    actorRole: role ?? 'admin',
    metadata: {
      email: target.email ?? null,
      previous_status: target.status ?? null,
    },
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({ ok: true, deactivated: true })
}
