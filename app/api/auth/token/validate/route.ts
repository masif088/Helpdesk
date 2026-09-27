import { NextResponse } from 'next/server'

import { apiTokens, findOneBy, update } from '@/lib/fsdb'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const tokenRow = await findOneBy(apiTokens, { token, isActive: true })

    if (!tokenRow) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    if (tokenRow.expiresAt && new Date(tokenRow.expiresAt) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    await update(apiTokens, tokenRow.id, { lastUsedAt: new Date() })

    return NextResponse.json({
      valid: true,
      user_id: tokenRow.userId,
    })
  } catch (error: any) {
    console.error('Failed to validate token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate token' },
      { status: 500 }
    )
  }
}
