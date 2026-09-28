import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { type AppSettingsMap,getAppSettings, setAppSetting } from '@/lib/app-settings'
import { isAdmin } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await getAppSettings()
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as Partial<AppSettingsMap>
  const allowed: (keyof AppSettingsMap)[] = [
    'app_name',
    'app_logo_url',
    'app_favicon_url',
    'email_sender_name',
    'invoice_issuer',
    'invoice_payment_info',
    'invoice_footer',
  ]

  for (const key of allowed) {
    if (key in body) {
      await setAppSetting(key, (body[key] as string | null) ?? null)
    }
  }
  if ('inbox_reminder_hours' in body) {
    const n = Number(body.inbox_reminder_hours)
    if (!Number.isFinite(n) || n < 0 || n > 720) {
      return NextResponse.json({ error: 'inbox_reminder_hours must be between 0 and 720' }, { status: 400 })
    }
    await setAppSetting('inbox_reminder_hours', String(n))
  }

  return NextResponse.json({ ok: true })
}
