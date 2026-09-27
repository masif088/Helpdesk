import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessEmailIntegration } from '@/lib/auth-utils'
import { emailSkipList, find, findOne, insert, remove } from '@/lib/fsdb'

/**
 * Ignored senders for the email sync: an exact address ("alerts@bank.com") or a whole domain ("@facebookmail.com").
 * Mail from them is never turned into tickets or replies.
 */
async function guard() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessEmailIntegration((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** Normalize input: "Foo <a@b.com>" → "a@b.com"; "facebookmail.com" / "@facebookmail.com" → "@facebookmail.com" */
function normalizeEntry(raw: string): string | null {
  let v = raw.trim().toLowerCase()
  const angle = v.match(/<([^>]+)>/)
  if (angle) v = angle[1].trim()
  if (!v) return null
  if (v.includes('@') && !v.startsWith('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
  }
  const domain = v.replace(/^@/, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? `@${domain}` : null
}

export async function GET() {
  const denied = await guard()
  if (denied) return denied
  const rows = await find(emailSkipList, { orderBy: [['createdAt', 'desc']] })
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, email: r.email, reason: r.reason, created_at: new Date(r.createdAt).toISOString() }))
  )
}

export async function POST(request: Request) {
  const denied = await guard()
  if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as { email?: string; reason?: string }
  const email = normalizeEntry(body.email ?? '')
  if (!email) {
    return NextResponse.json({ error: 'Enter an email address or a domain like @example.com' }, { status: 400 })
  }
  const existing = await findOne(emailSkipList, { where: [['emailLower', '==', email]] })
  if (existing) return NextResponse.json({ error: `${email} is already ignored` }, { status: 409 })
  const row = await insert(emailSkipList, { email, reason: body.reason?.trim() || null })
  return NextResponse.json({ id: row.id, email: row.email, reason: row.reason, created_at: new Date(row.createdAt).toISOString() })
}

export async function DELETE(request: Request) {
  const denied = await guard()
  if (denied) return denied
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await remove(emailSkipList, id)
  return NextResponse.json({ ok: true })
}
