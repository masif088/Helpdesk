import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { createApiKey, listApiKeys } from '@/lib/api-keys'
import { isAdmin } from '@/lib/auth-utils'
import { companies, getMany, getManyMap, users } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id || session.apiKey) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAdmin(session.user.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

/** GET /api/api-keys: every key (never the key itself), with the user it acts as. Admin only. */
export async function GET() {
  const guard = await requireAdmin()
  if (guard.error) return guard.error

  const keys = await listApiKeys()
  const userRows = await getMany(users, [...new Set(keys.flatMap((k) => [k.userId, ...(k.createdBy ? [k.createdBy] : [])]))])
  const userById = new Map(userRows.map((u) => [u.id, u]))
  const companyById = await getManyMap(companies, userRows.map((u) => u.companyId))

  return NextResponse.json(
    keys.map((k) => {
      const u = userById.get(k.userId)
      return {
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        rate_limit_per_hour: k.rateLimitPerHour,
        user: u
          ? { id: u.id, full_name: u.fullName, email: u.email, role: u.role, company: u.companyId ? companyById.get(u.companyId)?.name ?? null : null }
          : null,
        created_by: k.createdBy ? userById.get(k.createdBy)?.fullName ?? userById.get(k.createdBy)?.email ?? null : null,
        created_at: k.createdAt.toISOString(),
        expires_at: k.expiresAt?.toISOString() ?? null,
        revoked_at: k.revokedAt?.toISOString() ?? null,
        last_used_at: k.lastUsedAt?.toISOString() ?? null,
      }
    })
  )
}

/** POST /api/api-keys { name, user_id, scopes, expires_in_days? }: the key is returned once and cannot be shown again. Admin only. */
export async function POST(request: Request) {
  const guard = await requireAdmin()
  if (guard.error) return guard.error

  const body = (await request.json().catch(() => ({}))) as { name?: string; user_id?: string; scopes?: unknown; rate_limit_per_hour?: number | null; expires_in_days?: number | null }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Give the key a name, it is shown on every ticket and comment made with it' }, { status: 400 })
  if (typeof body.user_id !== 'string' || !body.user_id) return NextResponse.json({ error: 'Choose the user this key acts as' }, { status: 400 })

  const [target] = await getMany(users, [body.user_id])
  if (!target || target.deletedAt != null || (target.status ?? 'active').toLowerCase() !== 'active') {
    return NextResponse.json({ error: 'That user is not active' }, { status: 400 })
  }

  const days = typeof body.expires_in_days === 'number' && body.expires_in_days > 0 ? Math.min(Math.floor(body.expires_in_days), 3650) : null
  const { key, info } = await createApiKey({
    name,
    userId: target.id,
    scopes: body.scopes,
    rateLimitPerHour: body.rate_limit_per_hour,
    expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
    createdBy: guard.userId,
  })

  return NextResponse.json({ key, id: info.id, prefix: info.prefix, name: info.name, scopes: info.scopes, rate_limit_per_hour: info.rateLimitPerHour, expires_at: info.expiresAt?.toISOString() ?? null })
}
