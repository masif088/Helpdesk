import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { MANUAL_KEYS_MESSAGE } from '@/lib/api-key-core'
import { loadKeyUsage } from '@/lib/api-key-usage'
import { noUsage } from '@/lib/api-key-usage-core'
import { listApiKeys } from '@/lib/api-keys'
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

  const [keys, usage] = await Promise.all([listApiKeys(), loadKeyUsage().catch(() => new Map())])
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
        usage: usage.get(k.id) ?? noUsage(),
      }
    })
  )
}

/** POST /api/api-keys: no longer allowed. Assistants connect through MCP (a sign-in); keys are not made by hand. */
export async function POST() {
  const guard = await requireAdmin()
  if (guard.error) return guard.error
  return NextResponse.json({ error: MANUAL_KEYS_MESSAGE }, { status: 403 })
}
