import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getAiChatConfig } from '@/lib/ai-chat-config'
import { canAccessAiSettings } from '@/lib/auth-utils'

/** POST /api/ai-settings/test — check the active AI configuration by listing models (no tokens used). */
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessAiSettings((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let cfg: Awaited<ReturnType<typeof getAiChatConfig>>
  try {
    cfg = await getAiChatConfig()
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Not configured' }, { status: 400 })
  }
  const t0 = Date.now()
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, error: `${cfg.provider} answered HTTP ${res.status}: ${body.slice(0, 160)}` }, { status: 502 })
    }
    const data = (await res.json().catch(() => ({}))) as { data?: { id: string }[] }
    const ids = (data.data ?? []).map((m) => m.id)
    return NextResponse.json({
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      modelAvailable: ids.length ? ids.includes(cfg.model) : null,
      latencyMs: Date.now() - t0,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Request failed' }, { status: 502 })
  }
}
