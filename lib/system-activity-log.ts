import { insert, systemActivityLog } from '@/lib/fsdb'

export type SystemActivityCategory = 'user' | 'auth' | 'settings'

export type SystemActivityAction =
  | 'user_created'
  | 'user_updated'
  | 'user_deactivated'
  | 'user_login'
  | 'settings_created'
  | 'settings_updated'
  | 'settings_deleted'

export type SystemEntityType =
  | 'user'
  | 'tag'
  | 'ticket_status'
  | 'ticket_type'
  | 'ticket_priority'
  | 'job_type'
  | 'automation_rule'
  | 'message_template'
  | 'slack_notification_rule'

export function diffRecordFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of keys) {
    const b = before[k]
    const a = after[k]
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[k] = { from: b ?? null, to: a ?? null }
    }
  }
  return changes
}

export async function logSystemActivity(params: {
  category: SystemActivityCategory
  action: SystemActivityAction
  entityType?: SystemEntityType | string | null
  entityId?: string | null
  actorUserId: string | null
  actorRole?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await insert(systemActivityLog, {
      actorUserId: params.actorUserId,
      actorRole: (params.actorRole ?? 'agent').slice(0, 32),
      category: params.category,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      metadata: params.metadata ?? null,
    })
  } catch (err) {
    console.error('[system_activity_log]', err)
  }
}

export function actorRoleFromSession(session: { user?: { role?: string | null } | null }): string {
  return (session.user as { role?: string } | undefined)?.role?.toLowerCase() ?? 'agent'
}

const USER_LOG_KEYS = [
  'email',
  'full_name',
  'first_name',
  'last_name',
  'role',
  'status',
  'company_id',
  'department',
  'position',
  'phone',
  'timezone',
  'locale',
  'is_email_verified',
] as const

export function userRowToLogSnapshot(u: {
  email?: string | null
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  role?: string | null
  status?: string | null
  companyId?: string | null
  department?: string | null
  position?: string | null
  phone?: string | null
  timezone?: string | null
  locale?: string | null
  isEmailVerified?: boolean | null
}): Record<string, unknown> {
  return {
    email: u.email ?? null,
    full_name: u.fullName ?? null,
    first_name: u.firstName ?? null,
    last_name: u.lastName ?? null,
    role: u.role ?? null,
    status: u.status ?? null,
    company_id: u.companyId ?? null,
    department: u.department ?? null,
    position: u.position ?? null,
    phone: u.phone ?? null,
    timezone: u.timezone ?? null,
    locale: u.locale ?? null,
    is_email_verified: u.isEmailVerified ?? null,
  }
}

export async function logUserCreated(params: {
  actorUserId: string | null
  actorRole?: string | null
  createdUserId: string
  snapshot: Record<string, unknown>
}): Promise<void> {
  await logSystemActivity({
    category: 'user',
    action: 'user_created',
    entityType: 'user',
    entityId: params.createdUserId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: { created: params.snapshot },
  })
}

export async function logUserUpdated(params: {
  actorUserId: string | null
  actorRole?: string | null
  targetUserId: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  extra?: Record<string, unknown>
}): Promise<void> {
  const changes = diffRecordFields(params.before, params.after, [...USER_LOG_KEYS])
  const meta: Record<string, unknown> = { ...params.extra }
  if (Object.keys(changes).length > 0) {
    meta.changes = changes
    meta.changed_keys = Object.keys(changes)
  }
  if (Object.keys(meta).length === 0) return
  await logSystemActivity({
    category: 'user',
    action: 'user_updated',
    entityType: 'user',
    entityId: params.targetUserId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    metadata: meta,
  })
}

export async function logUserLogin(params: {
  userId: string
  role?: string | null
  email?: string | null
  provider?: string | null
}): Promise<void> {
  await logSystemActivity({
    category: 'auth',
    action: 'user_login',
    entityType: 'user',
    entityId: params.userId,
    actorUserId: params.userId,
    actorRole: params.role ?? 'user',
    metadata: {
      email: params.email ?? null,
      provider: params.provider ?? 'credentials',
    },
  })
}
