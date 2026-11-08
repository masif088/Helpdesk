/** The public address of the portal (https://host, no trailing slash): NEXT_PUBLIC_SITE_URL, else what the request says it was sent to. */
export function siteOrigin(request: Request): string {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fixed) return fixed.replace(/\/+$/, '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
    return `${proto || (local ? 'http' : 'https')}://${host}`
  }
  return new URL(request.url).origin
}
