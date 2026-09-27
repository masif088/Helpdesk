import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyDailyActiveAssignments, find, patchMany } from '@/lib/fsdb'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** POST — set active_time = 0 for all existing Saturday/Sunday rows in company_daily_active_assignments. */
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((sessionRole(session) ?? '').toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // snapshot_date is 'YYYY-MM-DD' (UTC calendar day): 0 = Sunday, 6 = Saturday
  const nonZero = await find(companyDailyActiveAssignments, { where: [['activeTime', '!=', 0]] })
  const weekend = nonZero.filter((r) => {
    const dow = new Date(`${r.snapshotDate}T00:00:00Z`).getUTCDay()
    return dow === 0 || dow === 6
  })
  await patchMany(
    companyDailyActiveAssignments,
    weekend.map((r) => ({ id: r.id, patch: { activeTime: 0 } }))
  )

  return NextResponse.json({ ok: true, rows_updated: weekend.length })
}
