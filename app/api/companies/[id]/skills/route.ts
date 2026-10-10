import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { denyUnless } from '@/lib/api-guard'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companies, find, get, ticketTypes, update } from '@/lib/fsdb'
import { normalizeSkills } from '@/lib/user-skills'
import { knownSkills } from '@/lib/user-skills-server'

async function gate() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = denyUnless(session.user, isAdminOrManager)
  return denied ? { error: denied } : {}
}

/** GET /api/companies/[id]/skills — ticket types with this client's skills for each (and the type's own default). Admin / manager. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate()
  if (g.error) return g.error
  const company = await get(companies, (await params).id)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  const types = await find(ticketTypes, { orderBy: [['sortOrder', 'asc']] })
  return NextResponse.json({
    types: types.map((t) => ({ id: t.id, title: t.title, color: t.color ?? '#000000', default_skills: t.requiredSkills ?? [] })),
    mapping: company.skillsByType ?? {},
  })
}

/**
 * PUT /api/companies/[id]/skills { mapping: { [ticketTypeId]: string[] } }
 * Tickets of this client with that type get these skills (when they have none of their own).
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
  const validTypeIds = new Set((await find(ticketTypes, { select: ['id'] })).map((t) => String(t.id)))
  const known = await knownSkills()
  const mapping: Record<string, string[]> = {}
  for (const [typeId, skills] of Object.entries(body.mapping)) {
    if (!validTypeIds.has(typeId)) continue
    const list = normalizeSkills(skills, known)
    if (list.length) mapping[typeId] = list
  }
  const updated = await update(companies, id, { skillsByType: Object.keys(mapping).length ? mapping : null, updatedAt: new Date() })
  return NextResponse.json({ mapping: updated?.skillsByType ?? {} })
}
