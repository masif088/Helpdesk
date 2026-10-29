// Pure helpers for API keys (no database, no path aliases: also used by the proxy and by tests).

export const API_KEY_PREFIX = 'tk_live_'

export const API_KEY_SCOPES = ['tickets:read', 'tickets:create', 'comments:create', 'calendar:read', 'calendar:write'] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  'tickets:read': 'Read tickets (list, search, detail with comments)',
  'tickets:create': 'Create tickets',
  'comments:create': 'Add comments / notes to tickets',
  'calendar:read': 'Read the calendar (meetings, leave, holidays, due dates)',
  'calendar:write': 'Add, change and delete calendar events',
}

/** Calls per hour a key may make unless the admin sets another limit on it */
export const DEFAULT_RATE_LIMIT_PER_HOUR = 100
export const MAX_RATE_LIMIT_PER_HOUR = 10_000

/** A key people make for themselves (Profile) always lasts this long and runs at the default limit; only an admin can give more. */
export const SELF_KEY_DAYS = 14
export const MAX_ACTIVE_SELF_KEYS = 5

/** A usable limit: a whole number from 1 up to the maximum; anything else means "the default". */
export function normalizeRateLimit(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : NaN
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_RATE_LIMIT_PER_HOUR) : DEFAULT_RATE_LIMIT_PER_HOUR
}

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number }

/** Sliding one-hour window per key, kept in memory (one server process, so it restarts from zero when the app restarts). */
export function createRateLimiter(windowMs = 3_600_000) {
  const calls = new Map<string, number[]>()
  return {
    hit(id: string, limit: number, now = Date.now()): RateLimitResult {
      const recent = (calls.get(id) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= limit) {
        calls.set(id, recent)
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) }
      }
      recent.push(now)
      calls.set(id, recent)
      return { ok: true, remaining: limit - recent.length }
    },
    reset(id?: string) {
      if (id) calls.delete(id)
      else calls.clear()
    },
  }
}

/** What an API key may call. Anything else answers 401 for a key, even if the user behind it could do it in the portal. */
const ROUTES: Array<{ method: string; pattern: RegExp; scope: ApiKeyScope }> = [
  { method: 'GET', pattern: /^\/api\/tickets$/, scope: 'tickets:read' },
  { method: 'GET', pattern: /^\/api\/tickets\/lookup$/, scope: 'tickets:read' },
  { method: 'GET', pattern: /^\/api\/tickets\/\d+\/detail$/, scope: 'tickets:read' },
  { method: 'POST', pattern: /^\/api\/tickets$/, scope: 'tickets:create' },
  { method: 'POST', pattern: /^\/api\/tickets\/\d+\/comments$/, scope: 'comments:create' },
  { method: 'GET', pattern: /^\/api\/calendar\/events$/, scope: 'calendar:read' },
  { method: 'GET', pattern: /^\/api\/calendar\/lookup$/, scope: 'calendar:read' },
  { method: 'GET', pattern: /^\/api\/calendar\/events\/[\w-]+$/, scope: 'calendar:read' },
  { method: 'POST', pattern: /^\/api\/calendar\/events$/, scope: 'calendar:write' },
  { method: 'PATCH', pattern: /^\/api\/calendar\/events\/[\w-]+$/, scope: 'calendar:write' },
  { method: 'DELETE', pattern: /^\/api\/calendar\/events\/[\w-]+$/, scope: 'calendar:write' },
]

/** Calls that need no key at all (they hold nothing private), so a request that carries a key is not refused for them either. */
const PUBLIC_ROUTES: Array<{ method: string; pattern: RegExp }> = [{ method: 'GET', pattern: /^\/api\/skill$/ }]

export function isPublicApiRoute(method: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return PUBLIC_ROUTES.some((r) => r.method === method.toUpperCase() && r.pattern.test(path))
}

/** The scope an API key needs for this request, or null when keys may not call it at all. */
export function scopeForRequest(method: string, pathname: string): ApiKeyScope | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const m = method.toUpperCase()
  return ROUTES.find((r) => r.method === m && r.pattern.test(path))?.scope ?? null
}

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === 'string' && (API_KEY_SCOPES as readonly string[]).includes(value)
}

/** Keeps the known scopes only, once each; falls back to read-only when nothing valid is given. */
export function normalizeScopes(input: unknown): ApiKeyScope[] {
  const list = Array.isArray(input) ? input.filter(isApiKeyScope) : []
  const unique = [...new Set(list)]
  return unique.length > 0 ? unique : ['tickets:read']
}

/** Pulls the key out of an `Authorization: Bearer tk_live_...` header; null for anything else (cookie sessions, other tokens). */
export function bearerApiKey(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')
  return m && m[1].startsWith(API_KEY_PREFIX) ? m[1] : null
}

/** The part of a key that is safe to show in lists ("tk_live_AbCd…"). */
export function keyPreview(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 4)
}

/** Marker stored on tickets (`source`) and comments (`via`), shown in the portal and in the activity log. */
export function apiViaLabel(keyName: string): string {
  return `API · ${keyName.trim() || 'unnamed key'}`
}

/** Active = not revoked and not expired. */
export function apiKeyUsable(key: { revokedAt?: Date | null; expiresAt?: Date | null }, now = new Date()): boolean {
  if (key.revokedAt) return false
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return false
  return true
}
