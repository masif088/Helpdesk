/**
 * App branding from env (client-safe — only NEXT_PUBLIC_* vars, inlined at build time).
 *
 *   NEXT_PUBLIC_APP_NAME         name in the sidebar, top navbar, emails, print/export ("Helpdesk")
 *   NEXT_PUBLIC_APP_TITLE        browser tab / share title (default: the app name)
 *   NEXT_PUBLIC_APP_DESCRIPTION  meta + share description
 *   NEXT_PUBLIC_APP_LOGO         logo image
 *   NEXT_PUBLIC_APP_FAVICON      favicon (default /favicon.ico)
 *
 * Logo / favicon: a relative path ("logo.png", "/brand/logo.svg") is served from `public/`;
 * a full URL ("https://…", e.g. Firebase Storage or another site) is used as-is.
 * Settings → App Branding (stored in Firestore) overrides these when filled in.
 */

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

/** Relative path → file in `public/`; absolute URL (http/https, protocol-relative, data:) → unchanged. */
export function resolveAssetUrl(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  if (/^(https?:)?\/\//i.test(v) || /^data:/i.test(v)) return v
  return `/${v.replace(/^\.?\/+/, '')}`
}

const name = env(process.env.NEXT_PUBLIC_APP_NAME) ?? 'Helpdesk'

export const BRANDING = {
  name,
  title: env(process.env.NEXT_PUBLIC_APP_TITLE) ?? name,
  description: env(process.env.NEXT_PUBLIC_APP_DESCRIPTION) ?? `${name} — ticketing and client support`,
  logo: resolveAssetUrl(process.env.NEXT_PUBLIC_APP_LOGO),
  favicon: resolveAssetUrl(process.env.NEXT_PUBLIC_APP_FAVICON) ?? '/favicon.ico',
  siteUrl: env(process.env.NEXT_PUBLIC_SITE_URL),
} as const
