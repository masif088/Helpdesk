import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { find, jobTypes } from '@/lib/fsdb'

/** GET /api/job-types — active job types for time tracker selects (ordered). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = (
    await find(jobTypes, {
      where: [['isActive', '==', true]],
      orderBy: [['sortOrder', 'asc'], ['slug', 'asc']],
    })
  ).map((r) => ({ slug: r.slug, title: r.title, sort_order: r.sortOrder }))

  return NextResponse.json(
    rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      sort_order: r.sort_order,
    }))
  )
}
