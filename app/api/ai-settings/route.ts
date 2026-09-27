import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { maskApiKey } from '@/lib/ai-settings-utils'
import { canAccessAiSettings } from '@/lib/auth-utils'
import { aiSettings, find, insert } from '@/lib/fsdb'

function rowToDto(row: typeof aiSettings.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    provider: row.provider,
    openaiApiKey: maskApiKey(row.openaiApiKey),
    openaiBaseUrl: row.openaiBaseUrl ?? '',
    openaiModel: row.openaiModel ?? '',
    codexApiKey: maskApiKey(row.codexApiKey),
    codexBaseUrl: row.codexBaseUrl ?? '',
    codexModel: row.codexModel ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** GET /api/ai-settings — list all presets (API keys masked) */
export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessAiSettings((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await find(aiSettings, { orderBy: [['createdAt', 'desc']] })
  return NextResponse.json({ data: rows.map(rowToDto) })
}

const PLACEHOLDER = '***'

/** POST /api/ai-settings — create a new preset */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessAiSettings((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  const validProviders = ['openai', 'codex']
  if (body.provider && !validProviders.includes(body.provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const resolveKey = (val: string | undefined) => {
    if (!val || val.includes(PLACEHOLDER)) return null
    return val.trim() || null
  }

  const created = await insert(aiSettings, {
      name: body.name.trim(),
      isActive: false,
      provider: body.provider ?? 'openai',
      openaiApiKey: resolveKey(body.openaiApiKey),
      openaiBaseUrl: body.openaiBaseUrl?.trim() || null,
      openaiModel: body.openaiModel?.trim() || null,
      codexApiKey: resolveKey(body.codexApiKey),
      codexBaseUrl: body.codexBaseUrl?.trim() || null,
      codexModel: body.codexModel?.trim() || null,
      updatedAt: new Date(),
      updatedBy: session.user.id,
    })

  return NextResponse.json({ data: rowToDto(created) }, { status: 201 })
}
