import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  companies,
  companyDailyActiveAssignments,
  get,
  teams,
  update,
  users,
} from '@/lib/fsdb'

function normalizeUuidBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return null
  return v
}

function parseActiveTime(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.floor(v))
}

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

/** PATCH Company Log row. Body: active_team_id?, active_manager_id?, active_time? — omit to leave unchanged. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, assignmentId } = await params
  const sessionRole = (session.user as { role?: string }).role

  const gate = await requireStaffAndCompany(id, sessionRole)
  if (gate) return gate

  const found = await get(companyDailyActiveAssignments, assignmentId)
  const row = found && found.companyId === id ? found : null
  if (!row) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: {
    activeTeamId?: string | null
    activeManagerId?: string | null
    activeTime?: number
  } = {}

  if (body.active_team_id !== undefined) {
    patch.activeTeamId = normalizeUuidBody(body.active_team_id)
  }
  if (body.active_manager_id !== undefined) {
    patch.activeManagerId = normalizeUuidBody(body.active_manager_id)
  }
  if (body.active_time !== undefined) {
    patch.activeTime = parseActiveTime(body.active_time)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const current = row

  const resolvedTeam = patch.activeTeamId !== undefined ? patch.activeTeamId : (current?.activeTeamId ?? null)
  const resolvedMgr =
    patch.activeManagerId !== undefined ? patch.activeManagerId : (current?.activeManagerId ?? null)

  const bad = await validateTeamManager(resolvedTeam, resolvedMgr)
  if (bad) return bad

  await update(companyDailyActiveAssignments, assignmentId, patch)

  return NextResponse.json({ ok: true })
}
