import { NextRequest, NextResponse } from 'next/server'

import { companies, companyDailyActiveAssignments, find, upsert } from '@/lib/fsdb'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function utcTodayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function resolveSnapshotDate(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return utcTodayYmd()
  if (!DATE_RE.test(raw)) return null
  const [y, m, d] = raw.split('-').map((x) => parseInt(x, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return raw
}

function cronAuthResult(request: NextRequest): 'ok' | 'missing_secret' | 'bad_key' {
  const secret = process.env.COMPANY_DAILY_ACTIVE_CRON_SECRET?? process.env.SYNC_INBOX_CRON_SECRET
  if (!secret) return 'missing_secret'
  const authHeader = request.headers.get('authorization')
  const apiKey = request.headers.get('x-api-key')
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKey
  if (key !== secret) return 'bad_key'
  return 'ok'
}

/**
 * POST /api/cron/company-daily-active
 * Snapshot all companies: active_team_id, active_manager_id, active_time for one UTC calendar day (Company Log table).
 *
 * Auth: set COMPANY_DAILY_ACTIVE_CRON_SECRET and send Authorization: Bearer <secret> or x-api-key: <secret>.
 *
 * Query: ?date=YYYY-MM-DD (optional, default today UTC). Body JSON { "date": "..." } overrides query.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = cronAuthResult(request)
    if (auth === 'missing_secret') {
      return NextResponse.json(
        { error: 'COMPANY_DAILY_ACTIVE_CRON_SECRET is not set' },
        { status: 503 }
      )
    }
    if (auth === 'bad_key') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let bodyDate: string | undefined
    try {
      const body = await request.json().catch(() => null)
      if (body && typeof body.date === 'string') bodyDate = body.date
    } catch {
      /* ignore */
    }

    const fromQuery = request.nextUrl.searchParams.get('date') ?? undefined
    const snapshotDate = resolveSnapshotDate(bodyDate ?? fromQuery)
    if (!snapshotDate) {
      return NextResponse.json({ error: 'Invalid date; use YYYY-MM-DD (UTC calendar day).' }, { status: 400 })
    }

    // Saturday (6) and Sunday (0) in UTC — store active_time as 0
    const [sy, sm, sd] = snapshotDate.split('-').map(Number)
    const dow = new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay()
    const isWeekend = dow === 0 || dow === 6

    const allCompanies = await find(companies)
    const companyCount = allCompanies.length

    // One row per company per day (doc key = company + date): insert or refresh the active_* snapshot.
    for (const c of allCompanies) {
      const snapshot = {
        activeTeamId: c.activeTeamId,
        activeManagerId: c.activeManagerId,
        activeTime: isWeekend ? 0 : c.activeTime,
      }
      await upsert(companyDailyActiveAssignments, { companyId: c.id, snapshotDate, ...snapshot }, snapshot)
    }
    const rowsAffected = companyCount

    return NextResponse.json({
      ok: true,
      date: snapshotDate,
      companies_in_source: companyCount,
      /** Driver rowCount for the upsert statement when available */
      rows_affected: rowsAffected,
    })
  } catch (e) {
    console.error('[cron/company-daily-active]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
