/**
 * Firebase Storage (Cloud Storage bucket of the Firebase project).
 *
 * Env vars:
 * - FIREBASE_STORAGE_BUCKET (optional): bucket name; defaults to NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   (e.g. my-project.firebasestorage.app)
 *
 * Files are served through the Firebase download endpoint (`?alt=media`); `storage.rules` allows public
 * read so stored URLs work in the portal, emails and Slack the same way public bucket URLs did.
 * Uploads / deletes only happen server-side through the Admin SDK.
 */
import { getStorage } from 'firebase-admin/storage'

import { getFirebaseAdminApp } from '@/lib/firebase/admin'

export function storageBucketName(): string | null {
  return (
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    null
  )
}

function getBucket() {
  const app = getFirebaseAdminApp()
  const name = storageBucketName()
  if (!app || !name) {
    console.warn('[Storage] Firebase Storage not configured')
    return null
  }
  return getStorage(app).bucket(name)
}

function normalizeKey(path: string): string {
  return path.replace(/^\/+/, '')
}

/** Public download URL for an object key. */
export function getPublicUrl(path: string): string {
  const key = normalizeKey(path)
  const bucket = storageBucketName()
  if (!bucket) return `/${key}`
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(key)}?alt=media`
}

/** Object key from a URL produced by `getPublicUrl` (or the key itself). */
export function keyFromPublicUrl(urlOrKey: string): string {
  const m = urlOrKey.match(/\/v0\/b\/[^/]+\/o\/([^?#]+)/)
  if (m) return decodeURIComponent(m[1])
  return normalizeKey(urlOrKey)
}

/** Upload file buffer to Firebase Storage */
export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  const bucket = getBucket()
  if (!bucket) {
    return { url: null, error: 'Storage not configured' }
  }
  const key = normalizeKey(path)
  try {
    await bucket.file(key).save(buffer, {
      resumable: false,
      contentType: contentType || 'application/octet-stream',
    })
    return { url: getPublicUrl(key), error: null }
  } catch (e) {
    console.error('[Storage] Upload error:', e)
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return { url: null, error: msg }
  }
}

/** Download object bytes (server-only). path = object key. */
export async function getObjectBuffer(
  path: string
): Promise<{ buffer: Buffer; contentType?: string } | { error: string }> {
  const bucket = getBucket()
  if (!bucket) {
    return { error: 'Storage not configured' }
  }
  const key = normalizeKey(path)
  if (!key) return { error: 'Empty key' }

  try {
    const file = bucket.file(key)
    const [[buffer], [meta]] = await Promise.all([file.download(), file.getMetadata()])
    return { buffer, contentType: meta.contentType }
  } catch (e) {
    console.error('[Storage] Download error:', e)
    const msg = e instanceof Error ? e.message : 'Get failed'
    return { error: msg }
  }
}

/** Delete an object. path = object key (no leading slash). Missing objects count as deleted. */
export async function deleteObject(
  path: string
): Promise<{ ok: boolean; error?: string }> {
  const bucket = getBucket()
  if (!bucket) {
    return { ok: false, error: 'Storage not configured' }
  }
  const key = normalizeKey(path)
  if (!key) return { ok: false, error: 'Empty key' }

  try {
    await bucket.file(key).delete({ ignoreNotFound: true })
    return { ok: true }
  } catch (e) {
    console.error('[Storage] Delete error:', e)
    const msg = e instanceof Error ? e.message : 'Delete failed'
    return { ok: false, error: msg }
  }
}

/** Connectivity check for settings: bucket reachable with the service account. */
export async function checkBucket(): Promise<{ ok: boolean; bucket: string | null; error?: string }> {
  const bucket = getBucket()
  if (!bucket) return { ok: false, bucket: null, error: 'Storage not configured' }
  try {
    const [exists] = await bucket.exists()
    return exists ? { ok: true, bucket: bucket.name } : { ok: false, bucket: bucket.name, error: 'Bucket not found' }
  } catch (e) {
    return { ok: false, bucket: bucket.name, error: e instanceof Error ? e.message : 'Failed' }
  }
}
