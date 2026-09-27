/** Hourly billing rate on a ticket: amount per hour + currency (billable time × rate = amount billed). */
export const RATE_CURRENCIES = ['IDR', 'USD'] as const
export type RateCurrency = (typeof RATE_CURRENCIES)[number]

export const DEFAULT_RATE_CURRENCY: RateCurrency = 'IDR'

export function isRateCurrency(v: unknown): v is RateCurrency {
  return typeof v === 'string' && (RATE_CURRENCIES as readonly string[]).includes(v)
}

/** e.g. "Rp150.000/h" or "$25.00/h" */
export function formatHourlyRate(rate: number | null | undefined, currency: string | null | undefined): string {
  if (rate == null) return '—'
  const cur = isRateCurrency(currency) ? currency : DEFAULT_RATE_CURRENCY
  const amount = new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: cur === 'IDR' ? 0 : 2,
  }).format(rate)
  return `${amount}/h`
}

/**
 * Validate `hourly_rate` / `rate_currency` from a request body.
 * Returns undefined when neither key is present (no change).
 */
export function parseHourlyRateBody(
  body: Record<string, unknown>,
  keys: { rate: string; currency: string } = { rate: 'hourly_rate', currency: 'rate_currency' }
): { hourlyRate: number | null; rateCurrency: RateCurrency | null } | { error: string } | undefined {
  const hasRate = Object.prototype.hasOwnProperty.call(body, keys.rate)
  const hasCurrency = Object.prototype.hasOwnProperty.call(body, keys.currency)
  if (!hasRate && !hasCurrency) return undefined

  const raw = body[keys.rate]
  if (raw === null || raw === undefined || raw === '') {
    return { hourlyRate: null, rateCurrency: null }
  }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return { error: `${keys.rate} must be a number ≥ 0` }
  const currency = body[keys.currency] ?? DEFAULT_RATE_CURRENCY
  if (!isRateCurrency(currency)) return { error: `${keys.currency} must be one of ${RATE_CURRENCIES.join(', ')}` }
  return { hourlyRate: Math.round(n * 100) / 100, rateCurrency: currency }
}
