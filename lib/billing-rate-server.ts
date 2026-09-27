import { companies, get } from '@/lib/fsdb'

/**
 * Company default hourly rate, copied onto a ticket when it is created for (or moved to) that company.
 * Tickets keep their own copy so later changes to the company default do not re-price existing work.
 */
export async function companyDefaultRate(
  companyId: string | null | undefined
): Promise<{ hourlyRate: number; rateCurrency: string } | Record<string, never>> {
  if (!companyId) return {}
  const c = await get(companies, companyId)
  if (c?.defaultHourlyRate == null) return {}
  return { hourlyRate: c.defaultHourlyRate, rateCurrency: c.defaultRateCurrency ?? 'IDR' }
}
