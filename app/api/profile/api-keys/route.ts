import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { DEFAULT_RATE_LIMIT_PER_HOUR, MAX_ACTIVE_SELF_KEYS, SELF_KEY_DAYS } from '@/lib/api-key-core'
import { loadKeyUsage } from '@/lib/api-key-usage'
import { noUsage } from '@/lib/api-key-usage-core'
import { countActiveApiKeys, createApiKey, listApiKeys } from '@/lib/api-keys'

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

/** POST /api/profile/api-keys { name, scopes }: a key that acts as the signed-in user. The key is returned once. */
export async function POST(request: Request) {
  const user = await signedInUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { name?: string; scopes?: unknown }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Give the key a name, it is shown on every ticket and comment made with it' }, { status: 400 })

  if ((await countActiveApiKeys(user.id)) >= MAX_ACTIVE_SELF_KEYS) {
    return NextResponse.json({ error: `You can have ${MAX_ACTIVE_SELF_KEYS} active keys at most. Revoke one first.` }, { status: 400 })
  }

  // Expiry and hourly limit are not up to the user, whatever the request says
  const { key, info } = await createApiKey({
    name,
    userId: user.id,
    scopes: body.scopes,
    rateLimitPerHour: DEFAULT_RATE_LIMIT_PER_HOUR,
    expiresAt: new Date(Date.now() + SELF_KEY_DAYS * 86_400_000),
    createdBy: user.id,
  })
  return NextResponse.json({ key, id: info.id, prefix: info.prefix, name: info.name, scopes: info.scopes, expires_at: info.expiresAt?.toISOString() ?? null })
}
