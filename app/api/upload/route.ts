/**
 * Upload file to storage (Firebase Storage, or local filesystem with STORAGE_PROVIDER=local).
 * Client components can POST FormData with 'file' and 'path'.
 */
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { uploadBuffer } from '@/lib/storage-provider'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const path = formData.get('path') as string | null

  if (!file || !path) {
    return NextResponse.json(
      { error: 'Missing file or path' },
      { status: 400 }
    )
  }

  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'File too large (max 50 MB)' },
      { status: 413 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'application/octet-stream'

  const result = await uploadBuffer(path, buffer, contentType)
  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 }
    )
  }

  return NextResponse.json({
    url: result.url,
    path,
  })
}
