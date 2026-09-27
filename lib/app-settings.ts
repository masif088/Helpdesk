import { appSettings, find, upsert } from '@/lib/fsdb'

export type AppSettingsMap = {
  app_name: string
  app_logo_url: string | null
  app_favicon_url: string | null
  email_sender_name: string | null
}

const DEFAULTS: AppSettingsMap = {
  app_name: 'DeskTeam360',
  app_logo_url: null,
  app_favicon_url: null,
  email_sender_name: null,
}

/** Fetch all app settings from DB and return as a typed map. Falls back to defaults for missing keys. */
export async function getAppSettings(): Promise<AppSettingsMap> {
  const rows = await find(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string | null>
  return {
    app_name: map['app_name'] ?? DEFAULTS.app_name,
    app_logo_url: map['app_logo_url'] ?? null,
    app_favicon_url: map['app_favicon_url'] ?? null,
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
}
