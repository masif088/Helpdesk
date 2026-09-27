/**
 * Serve files stored locally (STORAGE_PROVIDER=local). Mirrors the public-read
 * behavior of Firebase Storage URLs — no auth check, since uploaded URLs are meant
 * to be shareable.
 */
import { NextResponse } from 'next/server'

import { getObjectBuffer } from '@/lib/storage-local'

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  const key = segments.map((s) => decodeURIComponent(s)).join('/')

  const result = await getObjectBuffer(key)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  const ext = key.split('.').pop()?.toLowerCase() || ''
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
