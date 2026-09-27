import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyUsers, findBy, getMany, users } from '@/lib/fsdb'

/** GET /api/companies/[id]/users - List users in company (for CC/BCC preselect) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId } = await params
  if (!companyId) {
    return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
  }

  const [directUsers, cuRows] = await Promise.all([
    findBy(users, { companyId, role: 'customer' }),
    findBy(companyUsers, { companyId }),
  ])

  const userIdsFromCu = cuRows.map((r) => r.userId).filter(Boolean)
  const linkedUsers = (await getMany(users, userIdsFromCu)).filter((u) => u.role === 'customer')

  const seen = new Set<string>()
  const merged: Array<{ id: string; full_name: string | null; email: string }> = []
  for (const u of [...directUsers, ...linkedUsers]) {
    if (!u.email || seen.has(u.email)) continue
    seen.add(u.email)
    merged.push({
      id: u.id,
      full_name: u.fullName ?? null,
      email: u.email,
    })
  }

  return NextResponse.json({
    users: merged.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
  })
}
