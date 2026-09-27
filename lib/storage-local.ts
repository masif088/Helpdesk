/**
 * Local filesystem storage (for VPS via `next start` + PM2, without Firebase Storage).
 *
 * Files are stored in ./storage-data (outside /public, gitignored) and
 * served via /api/storage/file/[...path].
 *
 * Env vars:
 * - STORAGE_LOCAL_DIR: (optional) override folder location, default './storage-data'
 * - STORAGE_LOCAL_PUBLIC_URL: (optional) public base URL, default '/api/storage/file'
 */
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'

const ROOT_DIR = path.resolve(process.env.STORAGE_LOCAL_DIR || './storage-data')
const PUBLIC_BASE = (process.env.STORAGE_LOCAL_PUBLIC_URL || '/api/storage/file').replace(/\/+$/, '')

/** Resolve object key to an absolute path, rejecting traversal outside ROOT_DIR. */
function resolveKeyPath(key: string): string {
  const normalizedKey = key.replace(/^\/+/, '')
  const fullPath = path.resolve(ROOT_DIR, normalizedKey)
  if (fullPath !== ROOT_DIR && !fullPath.startsWith(ROOT_DIR + path.sep)) {
    throw new Error('Invalid storage path')
  }
  return fullPath
}

export function getPublicUrl(key: string): string {
  const encodedPath = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${PUBLIC_BASE}/${encodedPath}`
}

export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  _contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const fullPath = resolveKeyPath(key)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, buffer)
    return { url: getPublicUrl(key), error: null }
  } catch (e) {
    console.error('[Storage:local] Upload error:', e)
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return { url: null, error: msg }
  }
}

export async function getObjectBuffer(
  key: string
): Promise<{ buffer: Buffer; contentType?: string } | { error: string }> {
  try {
    const fullPath = resolveKeyPath(key)
    const buffer = await readFile(fullPath)
    return { buffer }
  } catch (e) {
    console.error('[Storage:local] GetObject error:', e)
    const msg = e instanceof Error ? e.message : 'Get failed'
    return { error: msg }
  }
}

export async function deleteObject(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const fullPath = resolveKeyPath(key)
    await rm(fullPath, { force: true })
    return { ok: true }
  } catch (e) {
    console.error('[Storage:local] Delete error:', e)
    const msg = e instanceof Error ? e.message : 'Delete failed'
    return { ok: false, error: msg }
  }
}
