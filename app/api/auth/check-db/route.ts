/**
 * GET /api/auth/check-db — verify Firestore / Firebase Auth connectivity (login page only shows errors).
 */
import { NextResponse } from 'next/server'

import { isFirebaseAdminConfigured } from '@/lib/firebase/admin'
import { count, users } from '@/lib/fsdb'

export const dynamic = 'force-dynamic'

export async function GET() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'unknown'

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        host: projectId,
        error: 'Firebase Admin is not configured.',
        hint: 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.',
      },
      { status: 500 }
    )
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && !process.env.FIREBASE_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        host: projectId,
        error: 'Firebase Web API key is not set.',
        hint: 'Set NEXT_PUBLIC_FIREBASE_API_KEY (Project settings → General → Web API key).',
      },
      { status: 500 }
    )
  }

  try {
    const userCount = await count(users)
    return NextResponse.json({
      ok: true,
      host: projectId,
      userCount,
      message:
        userCount === 0
          ? 'The users collection is empty. Run: npm run db:seed.'
          : 'Firestore OK',
    })
  } catch (err: unknown) {
    const e = err as Error & { code?: string | number }
    return NextResponse.json(
      {
        ok: false,
        host: projectId,
        error: e?.message || String(err),
        code: e?.code != null ? String(e.code) : undefined,
        hint: 'Check the Firebase service account credentials and that Firestore is enabled for the project.',
      },
      { status: 500 }
    )
  }
}
