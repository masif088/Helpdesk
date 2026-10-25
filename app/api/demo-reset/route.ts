import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getBaselineInfo, restoreBaseline, saveBaseline } from '@/lib/demo-baseline'
import { getDemoResetPlan, runDemoReset } from '@/lib/demo-reset'
import { isDemoResetUnlocked, lockDemoReset } from '@/lib/demo-reset-guard'
import { isBaselineRestorePhrase, isBaselineSavePhrase, isDemoResetPhrase, mayDemoReset } from '@/lib/demo-reset-plan'

/** Only the operator account (and only while it is an admin) may even look at this. */
async function operator() {
  const session = await auth()
  const email = session?.user?.email
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!mayDemoReset(email) || !isAdmin((session.user as { role?: string }).role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: email! }
}

/** GET -> what a reset would keep and remove right now, and the saved rollback point */
export async function GET() {
  const o = await operator()
  if (o.error) return o.error
  const [plan, baseline, unlocked] = await Promise.all([getDemoResetPlan(), getBaselineInfo(), isDemoResetUnlocked()])
  return NextResponse.json({ ...plan, baseline, unlocked })
}

/**
 * POST { action?, confirm, withSample? }
 *   Every action first needs the manual unlock in the database (lib/demo-reset-guard.ts); it locks again after one run.
 *   (no action)        confirm "RESET DEMO"       empty everything for a fresh demo
 *   "save-baseline"    confirm "SAVE ROLLBACK"    keep a copy of all data as the rollback point
 *   "restore-baseline" confirm "RESTORE ROLLBACK" put all data back to the rollback point
 */
export async function POST(request: Request) {
  const o = await operator()
  if (o.error) return o.error
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; confirm?: unknown; withSample?: unknown }
  if (!(await isDemoResetUnlocked())) {
    return NextResponse.json({ error: 'Locked. Set the unlock switch by hand in the database first (see the box on this page).' }, { status: 423 })
  }
  try {
    if (body.action === 'save-baseline') {
      if (!isBaselineSavePhrase(body.confirm)) return NextResponse.json({ error: 'Type the confirmation phrase exactly' }, { status: 400 })
      const baseline = await saveBaseline(o.email!)
      await lockDemoReset()
      return NextResponse.json({ baseline })
    }
    if (body.action === 'restore-baseline') {
      if (!isBaselineRestorePhrase(body.confirm)) return NextResponse.json({ error: 'Type the confirmation phrase exactly' }, { status: 400 })
      const restored = await restoreBaseline()
      await lockDemoReset()
      return NextResponse.json(restored)
    }
    if (!isDemoResetPhrase(body.confirm)) return NextResponse.json({ error: 'Type the confirmation phrase exactly' }, { status: 400 })
    const done = await runDemoReset(o.email!, { withSample: body.withSample === true })
    await lockDemoReset()
    return NextResponse.json(done)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
