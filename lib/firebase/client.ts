import { type FirebaseApp,getApps, initializeApp } from 'firebase/app'
import { type Firestore,getFirestore } from 'firebase/firestore'

export type ClientFirebaseConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

/**
 * Read Firebase client config. Login happens on the server (session cookie);
 * the browser SDK signs in with a custom token for realtime Firestore listeners / FCM web.
 */
export function getClientFirebaseConfig(): Partial<ClientFirebaseConfig> {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  }
}

export function isFirebaseClientConfigured(): boolean {
  const c = getClientFirebaseConfig()
  return Boolean(
    c.apiKey &&
      c.authDomain &&
      c.projectId &&
      c.storageBucket &&
      c.messagingSenderId &&
      c.appId
  )
}
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseClientConfigured()) return null
  const cfg = getClientFirebaseConfig() as ClientFirebaseConfig
  if (getApps().length > 0) {
    return getApps()[0]!
  }
  return initializeApp(cfg)
}

let firestoreCache: Firestore | null | undefined

export function getFirebaseFirestore(): Firestore | null {
  if (!isFirebaseClientConfigured()) return null
  if (firestoreCache !== undefined) return firestoreCache
  const app = getFirebaseApp()
  firestoreCache = app ? getFirestore(app) : null
  return firestoreCache
}


export async function getFirebaseMessaging(): Promise<
  import('firebase/messaging').Messaging | null
> {
  if (typeof window === 'undefined') return null
  if (!isFirebaseClientConfigured()) return null
  const { getMessaging, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) return null
  const app = getFirebaseApp()
  if (!app) return null
  return getMessaging(app)
}

export function getFirebaseWebVapidKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  return k && k.length > 0 ? k : undefined
}
