import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { getCompanyBilling } from '@/lib/company-billing'
import { companies, get } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

/** GET /api/companies/[id]/billing — billed / paid / outstanding (admin & manager only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  if (!(await get(companies, id))) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  return NextResponse.json({ data: await getCompanyBilling(id) })
}
