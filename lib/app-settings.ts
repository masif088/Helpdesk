import { BRANDING, resolveAssetUrl } from '@/lib/branding'
import { appSettings, find, upsert } from '@/lib/fsdb'

export type AppSettingsMap = {
  app_name: string
  app_logo_url: string | null
  app_favicon_url: string | null
  email_sender_name: string | null
}

/** Defaults come from env branding (lib/branding.ts); values saved in Settings → App Branding win. */
const DEFAULTS: AppSettingsMap = {
  app_name: BRANDING.name,
  app_logo_url: BRANDING.logo,
  app_favicon_url: null,
  email_sender_name: null,
}

/** In-process cache: app settings are read on every page render (root layout metadata) but rarely change. */
const CACHE_TTL_MS = 60_000
const g = globalThis as typeof globalThis & {
  __appSettingsCache?: { at: number; value: Promise<AppSettingsMap> }
}

/** Fetch all app settings (cached for 60s per server process) as a typed map. Falls back to defaults for missing keys. */
export async function getAppSettings(): Promise<AppSettingsMap> {
  const hit = g.__appSettingsCache
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  const value = loadAppSettings()
  g.__appSettingsCache = { at: Date.now(), value }
  value.catch(() => {
    if (g.__appSettingsCache?.value === value) g.__appSettingsCache = undefined
  })
  return value
}

async function loadAppSettings(): Promise<AppSettingsMap> {
  const rows = await find(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string | null>
  return {
    app_name: map['app_name'] || DEFAULTS.app_name,
    app_logo_url: resolveAssetUrl(map['app_logo_url']) ?? DEFAULTS.app_logo_url,
    app_favicon_url: resolveAssetUrl(map['app_favicon_url']),
    email_sender_name: map['email_sender_name'] ?? null,
  }
}

/** Return a formatted From header value, e.g. "Support <noreply@example.com>" or just the email. */
export function formatFromHeader(senderName: string | null, email: string): string {
  const name = senderName?.trim()
  if (!name) return email
  const safeName = name.replace(/"/g, "'")
  return `"${safeName}" <${email}>`
}

/** Upsert a single setting. */
export async function setAppSetting(key: keyof AppSettingsMap, value: string | null) {
  await upsert(appSettings, { key, value, updatedAt: new Date() })
  g.__appSettingsCache = undefined
}
