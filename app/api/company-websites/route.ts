import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyWebsites, find, insert, updateWhere } from '@/lib/fsdb'

/** GET /api/company-websites?company_id=... */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const isPrimary = searchParams.get('is_primary')

  let rows = await find(companyWebsites, { where: [companyId && ['companyId', '==', companyId]] })

  if (isPrimary !== null && isPrimary !== undefined) {
    rows = rows.filter((r) => r.isPrimary === (isPrimary === 'true'))
  }

  rows.sort((a, b) => {
    if ((a.isPrimary ? 1 : 0) !== (b.isPrimary ? 1 : 0)) return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const db2 = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return db2 - da
  })

  const data = rows.map((r) => ({
    id: r.id,
    company_id: r.companyId,
    url: r.url,
    title: r.title,
    description: r.description,
    is_primary: r.isPrimary ?? false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json({ data })
}

/** POST /api/company-websites */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { company_id, url, title, description, is_primary } = body

  if (!company_id || !url) {
    return NextResponse.json({ error: 'company_id and url are required' }, { status: 400 })
  }

  if (is_primary) {
    await updateWhere(companyWebsites, [['companyId', '==', company_id]], { isPrimary: false })
  }

  const row = await insert(companyWebsites, {
    companyId: company_id,
    url,
    title: title || null,
    description: description || null,
    isPrimary: is_primary || false,
  })

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: row.id,
      company_id: row.companyId,
      url: row.url,
      title: row.title,
      description: row.description,
      is_primary: row.isPrimary ?? false,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
    },
    success: true,
  }, { status: 201 })
}
