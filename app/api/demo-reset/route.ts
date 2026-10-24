import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getDemoResetPlan, runDemoReset } from '@/lib/demo-reset'
import { isDemoResetPhrase, mayDemoReset } from '@/lib/demo-reset-plan'

/** Only the operator account (and only while it is an admin) may even look at this. */
async function operator() {
  const session = await auth()
  const email = session?.user?.email
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!mayDemoReset(email) || !isAdmin((session.user as { role?: string }).role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: email! }
}

/** GET -> what a reset would keep and remove right now */
export async function GET() {
  const o = await operator()
  if (o.error) return o.error
  return NextResponse.json(await getDemoResetPlan())
}

/** POST { confirm: "RESET DEMO", withSample?: boolean } -> runs the reset */
export async function POST(request: Request) {
  const o = await operator()
  if (o.error) return o.error
  const body = (await request.json().catch(() => ({}))) as { confirm?: unknown; withSample?: unknown }
  if (!isDemoResetPhrase(body.confirm)) return NextResponse.json({ error: 'Type the confirmation phrase exactly' }, { status: 400 })
  try {
    return NextResponse.json(await runDemoReset(o.email!, { withSample: body.withSample === true }))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
