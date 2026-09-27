import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { get, remove, slackTicketNotificationRules, update } from '@/lib/fsdb'
import { normalizeSlackRuleFilter } from '@/lib/slack-notification-rule-filter'
import { isSlackIncomingWebhookUrl, maskWebhookUrlForDisplay } from '@/lib/slack-ticket-notify'

function rowToJson(r: typeof slackTicketNotificationRules.$inferSelect) {
  return {
    id: r.id,
    name: r.name ?? '',
    webhook_url_masked: maskWebhookUrlForDisplay(r.webhookUrl),
    is_enabled: r.isEnabled ?? true,
    filter: r.filter,
    sort_order: r.sortOrder ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }
}

/** PATCH /api/slack-notification-rules/[id] */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await get(slackTicketNotificationRules, id)
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Partial<typeof slackTicketNotificationRules.$inferInsert> = {
    updatedAt: new Date(),
  }

  if (typeof body.name === 'string') {
    updates.name = body.name.trim().slice(0, 255) || null
  }
  if (body.is_enabled !== undefined) {
    updates.isEnabled = body.is_enabled !== false
  }
  if (typeof body.sort_order === 'number' && Number.isInteger(body.sort_order)) {
    updates.sortOrder = body.sort_order
  }
  if (body.filter !== undefined) {
    updates.filter = normalizeSlackRuleFilter(body)
  }
  if (typeof body.webhook_url === 'string') {
    const w = body.webhook_url.trim()
    if (w.length > 0) {
      if (!isSlackIncomingWebhookUrl(w)) {
        return NextResponse.json(
          { error: 'webhook_url must be a Slack Incoming Webhook (https://hooks.slack.com/services/...)' },
          { status: 400 }
        )
      }
      updates.webhookUrl = w
    }
  }

  const updated = await update(slackTicketNotificationRules, id, updates)

  if (!updated) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(rowToJson(updated))
}

/** DELETE /api/slack-notification-rules/[id] */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const deleted = await remove(slackTicketNotificationRules, id)

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
