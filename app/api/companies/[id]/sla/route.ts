import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companies, find, get, type SlaTarget, ticketTypes, update } from '@/lib/fsdb'
import { cleanTarget, SLA_DEFAULT_KEY } from '@/lib/sla'

async function gate() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = denyUnless(session.user, isAdminOrManager)
  return denied ? { error: denied } : {}
}

/** GET /api/companies/[id]/sla — ticket types with this client's targets (and each type's own default). Admin / manager. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.error) return g.error
  const company = await get(companies, (await params).id)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const types = await find(ticketTypes, { orderBy: [['sortOrder', 'asc']] })
  return NextResponse.json({
    types: types.map((t) => ({
      id: t.id,
      title: t.title,
      color: t.color ?? '#000000',
      default_respond: t.slaRespondMinutes ?? null,
      default_resolve: t.slaResolveMinutes ?? null,
    })),
    mapping: company.slaByType ?? {},
  })
}

/**
 * PUT /api/companies/[id]/sla { mapping: { [ticketTypeId | "default"]: { respond, resolve } } } (minutes)
 * Replaces the client's targets; a row with neither target is dropped.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.error) return g.error
  const id = (await params).id
  const company = await get(companies, id)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { mapping?: Record<string, unknown> }
  if (!body.mapping || typeof body.mapping !== 'object' || Array.isArray(body.mapping)) {
    return NextResponse.json({ error: 'mapping is required' }, { status: 400 })
  }
  const valid = new Set([SLA_DEFAULT_KEY, ...(await find(ticketTypes, { select: ['id'] })).map((t) => String(t.id))])
  const mapping: Record<string, SlaTarget> = {}
  for (const [key, raw] of Object.entries(body.mapping)) {
    if (!valid.has(key)) continue
    const target = cleanTarget(raw)
    if (target) mapping[key] = target
  }
  const updated = await update(companies, id, { slaByType: Object.keys(mapping).length ? mapping : null, updatedAt: new Date() })
  return NextResponse.json({ mapping: updated?.slaByType ?? {} })
}
