import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessAutomationRules } from '@/lib/auth-utils'
import { automationRules, find, insert } from '@/lib/fsdb'
import { logSettingsCreated } from '@/lib/settings-activity-log'

function ruleSnapshot(r: {
  name: string | null
  eventType: string
  conditions: unknown
  actions: unknown
  priority: number | null
  companyId: string | null
  status: boolean | null
}) {
  return {
    name: r.name,
    event_type: r.eventType,
    conditions: r.conditions,
    actions: r.actions,
    priority: r.priority ?? 0,
    company_id: r.companyId,
    status: r.status ?? true,
  }
}

/** GET /api/automation-rules - List all rules (by priority desc) */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await find(automationRules, { orderBy: [['priority', 'desc'], ['id', 'desc']] })

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    event_type: r.eventType,
    conditions: r.conditions,
    actions: r.actions,
    priority: r.priority,
    company_id: r.companyId,
    status: r.status,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/automation-rules - Create rule */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, event_type, conditions, actions, priority, company_id, status } = body

  if (!event_type) {
    return NextResponse.json({ error: 'event_type required' }, { status: 400 })
  }

  const conditionsObj = typeof conditions === 'object' ? conditions : (typeof conditions === 'string' ? JSON.parse(conditions || '{}') : {})
  const actionsObj = typeof actions === 'object' ? actions : (typeof actions === 'string' ? JSON.parse(actions || '{}') : {})

  const inserted = await insert(automationRules, {
    name: name ? String(name).trim() : null,
    eventType: String(event_type),
    conditions: conditionsObj,
    actions: actionsObj,
    priority: Number(priority) ?? 0,
    companyId: company_id || null,
    status: status !== false,
  })

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  await logSettingsCreated({
    session,
    entityType: 'automation_rule',
    entityId: String(inserted.id),
    label: inserted.name ?? `Rule #${inserted.id}`,
    snapshot: ruleSnapshot(inserted),
  })

  return NextResponse.json({
    id: inserted.id,
    name: inserted.name,
    event_type: inserted.eventType,
    conditions: inserted.conditions,
    actions: inserted.actions,
    priority: inserted.priority,
    company_id: inserted.companyId,
    status: inserted.status,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
