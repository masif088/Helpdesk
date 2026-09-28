/** Hourly billing rate on a ticket: amount per hour + currency (billable time × rate = amount billed). */
export const RATE_CURRENCIES = ['IDR', 'USD'] as const
export type RateCurrency = (typeof RATE_CURRENCIES)[number]

export const DEFAULT_RATE_CURRENCY: RateCurrency = 'IDR'

export function isRateCurrency(v: unknown): v is RateCurrency {
  return typeof v === 'string' && (RATE_CURRENCIES as readonly string[]).includes(v)
}

/** e.g. "Rp150.000" or "$25.00" */
export function formatMoney(amount: number, currency: string | null | undefined): string {
  const cur = isRateCurrency(currency) ? currency : DEFAULT_RATE_CURRENCY
  return new Intl.NumberFormat(cur === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: cur === 'IDR' ? 0 : 2,
  }).format(amount)
}

/** e.g. "Rp150.000/h" or "$25.00/h" */
export function formatHourlyRate(rate: number | null | undefined, currency: string | null | undefined): string {
  if (rate == null) return '—'
  return `${formatMoney(rate, currency)}/h`
}

/**
 * Ticket price from a request body: `fixed_price` (whole ticket, whatever the hours) or `hourly_rate`.
 * A fixed price clears the hourly rate and vice versa. Returns undefined when no price key is present.
 */
export function parseTicketPriceBody(
  body: Record<string, unknown>
): { hourlyRate: number | null; rateCurrency: RateCurrency | null; fixedPrice?: number | null } | { error: string } | undefined {
  const hourly = parseHourlyRateBody(body)
  if (!Object.prototype.hasOwnProperty.call(body, 'fixed_price')) return hourly
  if (hourly && 'error' in hourly) return hourly
  const raw = body.fixed_price
  if (raw === null || raw === undefined || raw === '') {
    return { hourlyRate: hourly?.hourlyRate ?? null, rateCurrency: hourly?.rateCurrency ?? null, fixedPrice: null }
  }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return { error: 'fixed_price must be a number ≥ 0' }
  const currency = body.rate_currency ?? DEFAULT_RATE_CURRENCY
  if (!isRateCurrency(currency)) return { error: `rate_currency must be one of ${RATE_CURRENCIES.join(', ')}` }
  return { hourlyRate: null, rateCurrency: currency, fixedPrice: Math.round(n * 100) / 100 }
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
