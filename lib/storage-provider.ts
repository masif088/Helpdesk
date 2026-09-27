/**
 * Storage provider dispatcher. Switch via STORAGE_PROVIDER env var:
 * - 'firebase' (default): Firebase Storage (see lib/storage-firebase.ts)
 * - 'local': local filesystem on VPS (see lib/storage-local.ts)
 */
import * as firebase from './storage-firebase'
import * as local from './storage-local'

export type StorageProvider = 'firebase' | 'local'

export function getStorageProvider(): StorageProvider {
  return (process.env.STORAGE_PROVIDER || 'firebase').trim().toLowerCase() === 'local'
    ? 'local'
    : 'firebase'
}

function impl() {
  return getStorageProvider() === 'local' ? local : firebase
}

export function getPublicUrl(path: string): string {
  return impl().getPublicUrl(path)
}

export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  return impl().uploadBuffer(path, buffer, contentType)
}

export async function getObjectBuffer(
  path: string
): Promise<{ buffer: Buffer; contentType?: string } | { error: string }> {
  return impl().getObjectBuffer(path)
}

export async function deleteObject(path: string): Promise<{ ok: boolean; error?: string }> {
  return impl().deleteObject(path)
}

/** Object key from a stored public URL (or the key itself). */
export function keyFromPublicUrl(urlOrKey: string): string {
  if (getStorageProvider() === 'local') {
    const base = (process.env.STORAGE_LOCAL_PUBLIC_URL || '/api/storage/file').replace(/\/+$/, '')
    const rest = urlOrKey.startsWith(base) ? urlOrKey.slice(base.length) : urlOrKey
    return rest
      .replace(/^\/+/, '')
      .split('/')
      .map((s) => decodeURIComponent(s))
      .join('/')
  }
  return firebase.keyFromPublicUrl(urlOrKey)
}
