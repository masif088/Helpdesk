import { type App,cert, getApps, initializeApp } from 'firebase-admin/app'
import { type Auth, getAuth } from 'firebase-admin/auth'
import { type Firestore,getFirestore } from 'firebase-admin/firestore'
import { getMessaging, type Messaging } from 'firebase-admin/messaging'

function normalizePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key
}

function adminProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    undefined
  )
}

/** Local Firebase Emulator Suite: no service account needed, only a project id. */
function usingEmulators(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim() || process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim())
}

export function isFirebaseAdminConfigured(): boolean {
  if (usingEmulators()) return Boolean(adminProjectId())
  return Boolean(
    adminProjectId() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_PRIVATE_KEY?.trim()
  )
}


export function getFirebaseAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null
  if (getApps().length > 0) {
    return getApps()[0]!
  }
  const projectId = adminProjectId()!
  if (usingEmulators() && !process.env.FIREBASE_PRIVATE_KEY?.trim()) {
    return initializeApp({ projectId })
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!.trim()
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY!.trim())
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
}

export function getFirebaseAdminAuth(): Auth | null {
  const app = getFirebaseAdminApp()
  return app ? getAuth(app) : null
}

export function getFirebaseAdminFirestore(): Firestore | null {
  const app = getFirebaseAdminApp()
  return app ? getFirestore(app) : null
}

export function getFirebaseAdminMessaging(): Messaging | null {
  const app = getFirebaseAdminApp()
  return app ? getMessaging(app) : null
}
