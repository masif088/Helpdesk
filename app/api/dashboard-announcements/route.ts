import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { announcementVisibleForViewer } from '@/lib/dashboard-announcement'
import { dashboardAnnouncements, find } from '@/lib/fsdb'

/** GET — published announcements visible to current user (id + title only). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const viewerRole = (session.user as { role?: string }).role

  try {
    const rows = await find(dashboardAnnouncements, {
      where: [['isPublished', '==', true]],
      orderBy: [['sortOrder', 'asc'], ['updatedAt', 'desc']],
    })

    const items = rows
      .filter((r) => announcementVisibleForViewer(r, viewerRole))
      .map((r) => ({ id: r.id, title: r.title }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
