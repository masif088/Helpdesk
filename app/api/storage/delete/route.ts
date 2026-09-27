/**
 * Delete a draft upload from storage.
 * POST body: { path: string } - path = object key (e.g. CompanyName/draft/xxx.pdf) or its public URL
 */
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { deleteObject, keyFromPublicUrl } from '@/lib/storage-provider'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  let path = body?.path
  if (!path || typeof path !== 'string') {
    return NextResponse.json(
      { error: 'Missing path', success: false },
      { status: 400 }
    )
  }
  path = keyFromPublicUrl(path.trim())
  if (!path) {
    return NextResponse.json(
      { error: 'Empty path', success: false },
      { status: 400 }
    )
  }
  // Only allow deleting draft paths (CompanyName/draft/... or draft/draft/...)
  if (!path.includes('/draft/')) {
    return NextResponse.json(
      { error: 'Only draft paths can be deleted', success: false },
      { status: 403 }
    )
  }
  const result = await deleteObject(path)
  if (result.ok) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json(
    { success: false, error: result.error || 'Delete failed' },
    { status: 500 }
  )
}
