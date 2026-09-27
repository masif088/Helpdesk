import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { apiTokens, insert } from '@/lib/fsdb'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { name } = body

    const token = `sk_${randomBytes(32).toString('hex')}`
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    const inserted = await insert(apiTokens, {
      userId: session.user.id,
      token,
      name: name || 'Chrome Extension',
      expiresAt,
      isActive: true,
    })

    if (!inserted) {
      return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      token: inserted.token,
      expires_at: inserted.expiresAt?.toISOString() ?? null,
      name: inserted.name ?? null,
    })
  } catch (error: unknown) {
    console.error('Failed to generate token:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create token' },
      { status: 500 }
    )
  }
}
