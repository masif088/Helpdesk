import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { customerOwnsCompany } from '@/lib/customer-company'
import {
  companies,
  companyDailyActiveAssignments,
  find,
  get,
  getManyMap,
  teams,
  upsert,
  users,
} from '@/lib/fsdb'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseYmd(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  if (!DATE_RE.test(raw)) return null
  const [y, m, d] = raw.split('-').map((x) => parseInt(x, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return raw
}

function normalizeUuidBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return null
  return v
}

function parseActiveTime(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.floor(v))
}

/** Staff (non-customer session) may mutate Company Log rows for any company. */
async function requireStaffAndCompany(
  companyId: string,
  sessionUserRole: string | undefined
): Promise<NextResponse | null> {
  const role = sessionUserRole?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const c = await get(companies, companyId)
  if (!c) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  return null
}

async function validateTeamManager(
  activeTeamId: string | null,
  activeManagerId: string | null
): Promise<NextResponse | null> {
  if (activeTeamId) {
    const teamRow = await get(teams, activeTeamId)
    if (!teamRow) return NextResponse.json({ error: 'Active team not found' }, { status: 400 })
  }
  if (activeManagerId) {
    const mgr = await get(users, activeManagerId)
    if (!mgr) return NextResponse.json({ error: 'Active manager not found' }, { status: 404 })
    if ((mgr.role || '').toLowerCase() === 'customer') {
      return NextResponse.json({ error: 'Active manager must be a non-customer user' }, { status: 400 })
    }
  }
  return null
}

/** GET Company Log (`company_daily_active_assignments`): ?from=&to= YYYY-MM-DD */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    const ok = await customerOwnsCompany(session.user.id!, id)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const companyRow = await get(companies, id)
  if (!companyRow) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const can_manage = role !== 'customer'

  const sp = request.nextUrl.searchParams
  const fromParam = parseYmd(sp.get('from'))
  const toParam = parseYmd(sp.get('to'))

  const defaultTo = new Date().toISOString().slice(0, 10)
  const defaultFromDate = new Date()
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 89)
  const defaultFrom = defaultFromDate.toISOString().slice(0, 10)

  let from = fromParam ?? defaultFrom
  let to = toParam ?? defaultTo
  if (from > to) {
    const t = from
    from = to
    to = t
  }

  const maxSpanDays = 366
  const fromMs = Date.parse(`${from}T00:00:00.000Z`)
  const toMs = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  if (toMs - fromMs > maxSpanDays * 86400000) {
    return NextResponse.json(
      { error: `Date range must be at most ${maxSpanDays} days` },
      { status: 400 }
    )
  }

  const logRows = await find(companyDailyActiveAssignments, {
    where: [
      ['companyId', '==', id],
      ['snapshotDate', '>=', from],
      ['snapshotDate', '<=', to],
    ],
    orderBy: [['snapshotDate', 'desc']],
    limit: 500,
  })
  const [teamById, managerById] = await Promise.all([
    getManyMap(teams, logRows.map((r) => r.activeTeamId)),
    getManyMap(users, logRows.map((r) => r.activeManagerId)),
  ])
  const rows = logRows.map((r) => {
    const mgr = r.activeManagerId ? managerById.get(r.activeManagerId) : undefined
    return {
      ...r,
      teamName: r.activeTeamId ? teamById.get(r.activeTeamId)?.name ?? null : null,
      managerFullName: mgr?.fullName ?? null,
      managerEmail: mgr?.email ?? null,
    }
  })

  const data = rows.map((r) => {
    let active_manager_display: string | null = null
    if (r.managerEmail) {
      active_manager_display = `${r.managerFullName || r.managerEmail} (${r.managerEmail})`
    }
    const snap =
      typeof r.snapshotDate === 'string'
        ? r.snapshotDate
        : r.snapshotDate != null
          ? String(r.snapshotDate)
          : ''
    return {
      id: r.id,
      snapshot_date: snap,
      active_team_id: r.activeTeamId ?? null,
      active_manager_id: r.activeManagerId ?? null,
      active_team_name: r.teamName ?? null,
      active_manager_display,
      active_time: r.activeTime ?? 0,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    }
  })

  return NextResponse.json({ data, from, to, can_manage })
}

/**
 * POST Company Log — upsert one row (staff only). Body: snapshot_date, active_team_id?, active_manager_id?, active_time?
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const sessionRole = (session.user as { role?: string }).role

  const gate = await requireStaffAndCompany(id, sessionRole)
  if (gate) return gate

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const snapshotDate = parseYmd(typeof body.snapshot_date === 'string' ? body.snapshot_date : null)
  if (!snapshotDate) {
    return NextResponse.json({ error: 'snapshot_date is required (YYYY-MM-DD, UTC calendar day).' }, { status: 400 })
  }

  const activeTeamId = normalizeUuidBody(body.active_team_id)
  const activeManagerId = normalizeUuidBody(body.active_manager_id)
  const activeTime = body.active_time !== undefined ? parseActiveTime(body.active_time) : 0

  const bad = await validateTeamManager(activeTeamId, activeManagerId)
  if (bad) return bad

  await upsert(
    companyDailyActiveAssignments,
    { companyId: id, snapshotDate, activeTeamId, activeManagerId, activeTime },
    { activeTeamId, activeManagerId, activeTime }
  )

  return NextResponse.json({ ok: true })
}
