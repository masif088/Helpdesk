import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { BRANDING } from '@/lib/branding'
import { get, slackTicketNotificationRules } from '@/lib/fsdb'
import { sendSlackTestMessage } from '@/lib/slack-ticket-notify'

/** POST /api/slack-notification-rules/[id]/test — post a test message to the rule's webhook. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rule = await get(slackTicketNotificationRules, (await params).id)
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await sendSlackTestMessage(
      rule.webhookUrl,
      `:white_check_mark: *Test from ${BRANDING.name}* — Slack alerts for rule "${rule.name || 'Untitled'}" reach this channel.`
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Slack did not accept the message' }, { status: 502 })
  }
}
