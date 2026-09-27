import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { maskApiKey } from '@/lib/ai-settings-utils'
import { canAccessAiSettings } from '@/lib/auth-utils'
import { aiSettings, get, remove, update } from '@/lib/fsdb'

const PLACEHOLDER = '***'

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

async function getSession() {
  const session = await auth()
  if (!session?.user) return null
  if (!canAccessAiSettings((session.user as { role?: string }).role)) return null
  return session
}

/** PATCH /api/ai-settings/:id — update preset fields */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const existing = await get(aiSettings, id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const validProviders = ['openai', 'codex']
  if (body.provider && !validProviders.includes(body.provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const resolve = (incoming: string | undefined, current: string | null | undefined) => {
    if (incoming === undefined || incoming === null) return current ?? null
    if (incoming.includes(PLACEHOLDER)) return current ?? null
    return incoming.trim() || null
  }

  const updated = await update(aiSettings, id, {
      name: body.name?.trim() ?? existing.name,
      provider: body.provider ?? existing.provider,
      openaiApiKey: resolve(body.openaiApiKey, existing.openaiApiKey),
      openaiBaseUrl: resolve(body.openaiBaseUrl, existing.openaiBaseUrl),
      openaiModel: resolve(body.openaiModel, existing.openaiModel),
      codexApiKey: resolve(body.codexApiKey, existing.codexApiKey),
      codexBaseUrl: resolve(body.codexBaseUrl, existing.codexBaseUrl),
      codexModel: resolve(body.codexModel, existing.codexModel),
      updatedAt: new Date(),
      updatedBy: session.user.id,
    })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: rowToDto(updated) })
}

/** DELETE /api/ai-settings/:id — delete a preset (cannot delete active one) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await get(aiSettings, id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.isActive) {
    return NextResponse.json({ error: 'Cannot delete the active configuration. Activate another one first.' }, { status: 400 })
  }

  await remove(aiSettings, id)
  return NextResponse.json({ ok: true })
}
