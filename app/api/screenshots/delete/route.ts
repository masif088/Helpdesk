import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { get, remove, screenshots } from '@/lib/fsdb'
import { deleteObject } from '@/lib/storage-provider'

/** POST /api/screenshots/delete - Delete screenshot (for web app with session) */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const row = await get(screenshots, id)

  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
  }

  await remove(screenshots, id)

  if (row.filePath) {
    try {
      await deleteObject(row.filePath)
    } catch (e) {
      console.error('Failed to delete file from storage:', e)
    }
  }

  return NextResponse.json({ success: true })
}
