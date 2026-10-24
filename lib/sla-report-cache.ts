/**
 * The SLA & satisfaction report is expensive to build (comments, activity log, assignees), so it is kept for the rest of the
 * day per date range. "Refresh" on the page rebuilds it on demand.
 */
import dayjs from 'dayjs'
import { revalidateTag, unstable_cache } from 'next/cache'

import { getSlaReport } from '@/lib/sla-report'

export const SLA_REPORT_TAG = 'sla-report' as const

const cached = unstable_cache(async (from: string, to: string, day: string) => {
  void day // part of the cache key: a new day, a new report
  return getSlaReport(from, to)
}, ['sla-report-v1'], { revalidate: 24 * 3600, tags: [SLA_REPORT_TAG] })

export const getSlaReportCached = (from: string, to: string) => cached(from, to, dayjs().format('YYYY-MM-DD'))

export const refreshSlaReport = () => revalidateTag(SLA_REPORT_TAG, { expire: 0 })
