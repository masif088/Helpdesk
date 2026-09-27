import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessAutomationRules } from '@/lib/auth-utils'
import { automationRules, get, type Patch, remove, update } from '@/lib/fsdb'
import { logSettingsDeleted, logSettingsUpdated } from '@/lib/settings-activity-log'

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

const RULE_LOG_KEYS = ['name', 'event_type', 'conditions', 'actions', 'priority', 'company_id', 'status']

/** PATCH /api/automation-rules/[id] - Update rule */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, event_type, conditions, actions, priority, company_id, status } = body

  const values: Record<string, unknown> = {}
  if (name !== undefined) values.name = name ? String(name).trim() : null
  if (event_type !== undefined) values.eventType = String(event_type)
  if (conditions !== undefined) {
    values.conditions = typeof conditions === 'object' ? conditions : JSON.parse(conditions || '{}')
  }
  if (actions !== undefined) {
    values.actions = typeof actions === 'object' ? actions : JSON.parse(actions || '{}')
  }
  if (priority !== undefined) values.priority = Number(priority) ?? 0
  if (company_id !== undefined) values.companyId = company_id || null
  if (status !== undefined) values.status = !!status

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const ruleId = parseInt(id, 10)
  const current = await get(automationRules, ruleId)
  if (!current) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  const updated = await update(automationRules, ruleId, values as Patch<typeof automationRules.$inferSelect>)

  if (!updated) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  await logSettingsUpdated({
    session,
    entityType: 'automation_rule',
    entityId: String(ruleId),
    label: updated.name ?? `Rule #${ruleId}`,
    before: ruleSnapshot(current),
    after: ruleSnapshot(updated),
    keys: RULE_LOG_KEYS,
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    event_type: updated.eventType,
    conditions: updated.conditions,
    actions: updated.actions,
    priority: updated.priority,
    company_id: updated.companyId,
    status: updated.status,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/automation-rules/[id] - Delete rule */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ruleId = parseInt(id, 10)

  const current = await get(automationRules, ruleId)
  if (!current) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  const deleted = await remove(automationRules, ruleId)

  if (!deleted) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
  }

  await logSettingsDeleted({
    session,
    entityType: 'automation_rule',
    entityId: String(ruleId),
    label: current.name ?? `Rule #${ruleId}`,
    snapshot: ruleSnapshot(current),
  })

  return NextResponse.json({ success: true })
}
