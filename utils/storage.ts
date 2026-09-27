/**
 * Storage — client-side helpers only (browser → /api/upload, /api/storage/delete).
 *
 * Server-side code must call lib/storage-provider directly (see those API
 * routes) — never import this module from server code, since the upload/
 * delete implementations (e.g. lib/storage-local.ts) use Node builtins
 * (`fs/promises`) that cannot be bundled for the browser.
 */

export async function uploadFile(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const formData = new FormData()
    formData.set('file', file)
    formData.set('path', path)
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const text = await res.text()
    let data: Record<string, unknown> = {}
    try { data = JSON.parse(text) } catch { /* non-JSON response */ }
    if (!res.ok) {
      const msg = (data?.error as string) || `Upload failed (HTTP ${res.status})`
      console.error('[upload]', res.status, text)
      return { url: null, error: msg }
    }
    return { url: (data.url as string) ?? null, error: null }
  } catch (error: unknown) {
    console.error('Failed to upload file:', error)
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Failed to upload file',
    }
  }
}

export async function uploadAvatar(
  file: File,
  userId: string
): Promise<{ url: string | null; error: string | null }> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${userId}-${Date.now()}.${fileExt}`
  const filePath = `avatars/${fileName}`
  return await uploadFile(file, filePath)
}

/** Sanitize filename for storage path (keep extension, safe name). */
function sanitizeFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'file'
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return ext ? `${safe}.${ext}` : safe
}

/** Sanitize company name for storage path. No company → non-company. */
function sanitizeCompanyName(name: string | undefined): string {
  const s = (name || '').trim()
  if (!s || s.toLowerCase() === 'unknown') return 'non-company'
  const safe = s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return safe || 'non-company'
}

export type TicketFileFolder = 'attachments' | 'comments'

/**
 * Upload file for ticket attachment or comment.
 * Path pattern: tickets/company_name/#ticket_id/{attachments|comments}/{timestamp}_{filename}
 */
export async function uploadTicketFile(
  file: File,
  ticketId: string | number,
  folder: TicketFileFolder,
  companyName: string | undefined
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const company = sanitizeCompanyName(companyName)
  const idPart = `#${ticketId}`
  const unix = Math.floor(Date.now() / 1000)
  const safeName = sanitizeFileName(file.name)
  const filePath = `tickets/${company}/${idPart}/${folder}/${unix}_${safeName}`
  const result = await uploadFile(file, filePath)
  if (result.error || !result.url)
    return { url: null, path: null, error: result.error ?? null }
  return { url: result.url, path: filePath, error: null }
}

/**
 * Upload file for ticket when ticket not yet created (draft).
 * Path pattern: tickets/company_name/draft/{attachments|comments}/{timestamp}_{filename}
 */
export async function uploadTicketFileDraft(
  file: File,
  folder: TicketFileFolder,
  companyName?: string
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const company = sanitizeCompanyName(companyName)
  const unix = Math.floor(Date.now() / 1000)
  const safeName = sanitizeFileName(file.name)
  const filePath = `tickets/${company}/draft/${folder}/${unix}_${safeName}`
  const result = await uploadFile(file, filePath)
  if (result.error || !result.url)
    return { url: null, path: null, error: result.error ?? null }
  return { url: result.url, path: filePath, error: null }
}

/** Upload image for ticket/comment. Path: ticket/{ticketId}/{unixtime}.{ext}. Use 'draft' when ticketId not provided. */
export async function uploadTicketImage(
  file: File,
  ticketId?: string | number
): Promise<{ url: string | null; error: string | null }> {
  const id = ticketId != null ? String(ticketId) : 'draft'
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const unix = Math.floor(Date.now() / 1000)
  const filePath = `ticket/${id}/${unix}.${ext}`
  return await uploadFile(file, filePath)
}

export async function deleteFile(path: string): Promise<boolean> {
  try {
    const res = await fetch('/api/storage/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = await res.json().catch(() => ({}))
    return data?.success === true
  } catch (error) {
    console.error('Failed to delete file:', error)
    return false
  }
}
