import { type Firestore, Timestamp } from 'firebase-admin/firestore'

import { getFirebaseAdminFirestore } from '@/lib/firebase/admin'

import { installFsdbTrace } from './trace'

export class FirestoreNotConfiguredError extends Error {
  constructor() {
    super('Firestore is not configured (set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)')
    this.name = 'FirestoreNotConfiguredError'
  }
}

const globalForFs = globalThis as typeof globalThis & { __deskteamFsSettingsApplied?: boolean }

/** Admin Firestore used for all app data. Throws when Firebase Admin env vars are missing. */
export function fdb(): Firestore {
  const fs = getFirebaseAdminFirestore()
  if (!fs) throw new FirestoreNotConfiguredError()
  installFsdbTrace()
  if (!globalForFs.__deskteamFsSettingsApplied) {
    try {
      fs.settings({ ignoreUndefinedProperties: true })
    } catch {
      // settings() throws once the instance was used (HMR) — the first call already applied them.
    }
    globalForFs.__deskteamFsSettingsApplied = true
  }
  return fs
}

/** Firestore cannot store arrays directly inside arrays; they are wrapped on write and unwrapped on read. */
const NESTED_ARRAY_KEY = '__nestedArray'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Prepare a JS value for Firestore (drops undefined, wraps nested arrays). Dates/sentinels pass through. */
export function encodeValue(v: unknown, insideArray = false): unknown {
  if (v === undefined) return undefined
  if (Array.isArray(v)) {
    const arr = v.map((x) => encodeValue(x, true)).filter((x) => x !== undefined)
    return insideArray ? { [NESTED_ARRAY_KEY]: arr } : arr
  }
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      const e = encodeValue(val)
      if (e !== undefined) out[k] = e
    }
    return out
  }
  if (typeof v === 'bigint') return Number(v)
  return v
}

/** Convert a Firestore value back to plain JS (Timestamp → Date, nested arrays unwrapped). */
export function decodeValue(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate()
  if (Array.isArray(v)) return v.map(decodeValue)
  if (isPlainObject(v)) {
    if (NESTED_ARRAY_KEY in v && Object.keys(v).length === 1) {
      return (v[NESTED_ARRAY_KEY] as unknown[]).map(decodeValue)
    }
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = decodeValue(val)
    return out
  }
  return v
}
