import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyCompanyRead } from '@/lib/api-guard'
import { companyAttributes, find, insert } from '@/lib/fsdb'

function canEdit(role?: string) {
  return ['admin', 'manager'].includes((role ?? '').toLowerCase())
}

/** GET /api/companies/[id]/attributes */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const denied = await denyCompanyRead(session.user, id)
  if (denied) return denied
  const rows = await find(companyAttributes, {
    where: [['companyId', '==', id]],
    orderBy: [['createdAt', 'asc']],
  })
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      company_id: r.companyId,
      meta_key: r.metaKey,
      meta_value: r.metaValue,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    })),
  })
}

/** POST /api/companies/[id]/attributes */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  if (!canEdit(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const metaKey = String(body.meta_key || '').trim()
  if (!metaKey) return NextResponse.json({ error: 'meta_key is required' }, { status: 400 })

  const row = await insert(companyAttributes, { companyId: id, metaKey, metaValue: body.meta_value ?? null })

  if (!row) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  return NextResponse.json({
    id: row.id,
    company_id: row.companyId,
    meta_key: row.metaKey,
    meta_value: row.metaValue,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}
