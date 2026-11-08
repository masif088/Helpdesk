import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { MANUAL_KEYS_MESSAGE } from '@/lib/api-key-core'
import { loadKeyUsage } from '@/lib/api-key-usage'
import { noUsage } from '@/lib/api-key-usage-core'
import { listApiKeys } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

async function signedInUser() {
  const session = await auth()
  // A key can never make keys
  return session?.user?.id && !session.apiKey ? session.user : null
}

/** GET /api/profile/api-keys: the keys that act as the signed-in user (never the key itself). */
export async function GET() {
  const user = await signedInUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [keys, usage] = await Promise.all([listApiKeys(user.id), loadKeyUsage().catch(() => new Map())])
  return NextResponse.json(
    keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      rate_limit_per_hour: k.rateLimitPerHour,
      created_at: k.createdAt.toISOString(),
      expires_at: k.expiresAt?.toISOString() ?? null,
      revoked_at: k.revokedAt?.toISOString() ?? null,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      usage: usage.get(k.id) ?? noUsage(),
    }))
  )
}

/** POST /api/profile/api-keys: no longer allowed. Assistants connect through MCP (a sign-in); keys are not made by hand. */
export async function POST() {
  const user = await signedInUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ error: MANUAL_KEYS_MESSAGE }, { status: 403 })
}
