import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getFirebaseAdminApp, isFirebaseAdminConfigured } from '@/lib/firebase/admin'
import { count, users } from '@/lib/fsdb'
import { checkBucket } from '@/lib/storage-firebase'
import { getStorageProvider } from '@/lib/storage-provider'

export type ConnectionCheckResult = {
  key: string
  label: string
  status: 'ok' | 'error' | 'not_configured'
  message: string
  latencyMs?: number
}

async function checkDatabase(): Promise<ConnectionCheckResult> {
  const t0 = Date.now()
  try {
    const n = await count(users)
    return { key: 'database', label: 'Firestore Database', status: 'ok', message: `Connected (${n} users)`, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { key: 'database', label: 'Firestore Database', status: 'error', message: e instanceof Error ? e.message : 'Connection failed' }
  }
}

async function checkStorage(): Promise<ConnectionCheckResult> {
  if (getStorageProvider() === 'local') {
    return { key: 'storage', label: 'File Storage', status: 'ok', message: 'Local filesystem (STORAGE_PROVIDER=local)' }
  }
  const t0 = Date.now()
  const r = await checkBucket()
  if (!r.bucket) {
    return { key: 'storage', label: 'Firebase Storage', status: 'not_configured', message: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET / Firebase Admin not set' }
  }
  if (!r.ok) {
    return { key: 'storage', label: 'Firebase Storage', status: 'error', message: r.error || 'Failed' }
  }
  return { key: 'storage', label: 'Firebase Storage', status: 'ok', message: `Bucket "${r.bucket}" reachable`, latencyMs: Date.now() - t0 }
}

async function checkFirebase(): Promise<ConnectionCheckResult> {
  if (!isFirebaseAdminConfigured()) {
    return { key: 'firebase', label: 'Firebase Admin SDK', status: 'not_configured', message: 'FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY not set' }
  }
  const t0 = Date.now()
  try {
    const app = getFirebaseAdminApp()
    if (!app) throw new Error('App init returned null')
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''
    return { key: 'firebase', label: 'Firebase Admin SDK', status: 'ok', message: `Project: ${projectId}`, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { key: 'firebase', label: 'Firebase Admin SDK', status: 'error', message: e instanceof Error ? e.message : 'Failed' }
  }
}

async function checkGoogleEmail(): Promise<ConnectionCheckResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return { key: 'google_email', label: 'Google Email (OAuth)', status: 'not_configured', message: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set' }
  }
  return { key: 'google_email', label: 'Google Email (OAuth)', status: 'ok', message: 'Credentials configured (OAuth flow ready)' }
}

async function checkAi(): Promise<ConnectionCheckResult> {
  const provider = process.env.AI_PROVIDER || 'openai'

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return { key: 'ai', label: 'AI (OpenAI)', status: 'not_configured', message: 'OPENAI_API_KEY not set' }
    const t0 = Date.now()
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return { key: 'ai', label: 'AI (OpenAI)', status: 'error', message: `HTTP ${res.status}` }
      return { key: 'ai', label: 'AI (OpenAI)', status: 'ok', message: `Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`, latencyMs: Date.now() - t0 }
    } catch (e) {
      return { key: 'ai', label: 'AI (OpenAI)', status: 'error', message: e instanceof Error ? e.message : 'Failed' }
    }
  }

  if (provider === 'codex') {
    const baseUrl = process.env.CODEX_BASE_URL
    const apiKey = process.env.CODEX_API_KEY
    if (!baseUrl || !apiKey) return { key: 'ai', label: 'AI (Codex proxy)', status: 'not_configured', message: 'CODEX_BASE_URL / CODEX_API_KEY not set' }
    const t0 = Date.now()
    try {
      const url = baseUrl.replace(/\/v1\/?$/, '') + '/v1/models'
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return { key: 'ai', label: 'AI (Codex proxy)', status: 'error', message: `HTTP ${res.status}` }
      return { key: 'ai', label: 'AI (Codex proxy)', status: 'ok', message: `Base: ${baseUrl}`, latencyMs: Date.now() - t0 }
    } catch (e) {
      return { key: 'ai', label: 'AI (Codex proxy)', status: 'error', message: e instanceof Error ? e.message : 'Failed' }
    }
  }

  return { key: 'ai', label: 'AI', status: 'not_configured', message: `Unknown provider: ${provider}` }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const results = await Promise.all([
    checkDatabase(),
    checkStorage(),
    checkFirebase(),
    checkGoogleEmail(),
    checkAi(),
  ])

  return NextResponse.json({ results, checkedAt: new Date().toISOString() })
}
