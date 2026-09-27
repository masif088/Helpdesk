import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, companyUsers, find, get, insert, teams, tickets, update, users } from '@/lib/fsdb'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

function normalizeUuidBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return null
  return v
}

/** GET /api/companies - List companies */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const isActiveParam = url.searchParams.get('is_active')

  const rows = await find(companies, { orderBy: [['createdAt', 'desc']] })
  // Latest ticket update per company: one ordered lookup per company (index: tickets companyId ASC, updatedAt DESC)
  const ticketActivity = await Promise.all(
    rows.map(async (c) => {
      const [latest] = await find(tickets, {
        where: [['companyId', '==', c.id]],
        orderBy: [['updatedAt', 'desc']],
        limit: 1,
      })
      return { companyId: c.id, lastTicketUpdate: latest?.updatedAt ?? null }
    })
  )
  const leaderByCompany = new Map<string, string>()
  if (rows.length > 0) {
    const leaders = await find(companyUsers, { where: [['companyRole', '==', 'company_admin']] })
    for (const row of leaders) {
      if (!leaderByCompany.has(row.companyId)) {
        leaderByCompany.set(row.companyId, row.userId)
      }
    }
  }

  const lastTicketByCompany = new Map<string, string | null>()
  for (const row of ticketActivity) {
    const cid = row.companyId
    if (!cid) continue
    const v = row.lastTicketUpdate
    lastTicketByCompany.set(
      cid,
      v instanceof Date ? v.toISOString() : v ? String(v) : null
    )
  }

  let filtered = rows
  if (isActiveParam !== null && isActiveParam !== undefined) {
    const active = isActiveParam === 'true'
    filtered = rows.filter((r) => r.isActive === active)
  }

  const data = filtered.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    created_by: leaderByCompany.get(r.id) ?? null,
    color: r.color,
    is_active: r.isActive ?? true,
    active_team_id: r.activeTeamId ?? null,
    active_manager_id: r.activeManagerId ?? null,
    is_customer: r.isCustomer ?? false,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    last_ticket_updated_at: lastTicketByCompany.get(r.id) ?? null,
  }))

  return NextResponse.json({ data })
}

/** POST /api/companies - Create company */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, email, is_active, color, leader_user_id } = body
  const activeTeamId = normalizeUuidBody(body.active_team_id)
  const activeManagerId = normalizeUuidBody(body.active_manager_id)
  const isCustomerCompany = body.is_customer === true

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (leader_user_id) {
    if (typeof leader_user_id !== 'string') {
      return NextResponse.json({ error: 'Invalid leader_user_id' }, { status: 400 })
    }
    const leader = await get(users, leader_user_id)
    if (!leader) {
      return NextResponse.json({ error: 'Company leader not found' }, { status: 404 })
    }
    if ((leader.role || '').toLowerCase() !== 'customer') {
      return NextResponse.json({ error: 'Company leader must be a customer user' }, { status: 400 })
    }
  }

  if (activeTeamId) {
    const teamRow = await get(teams, activeTeamId)
    if (!teamRow) {
      return NextResponse.json({ error: 'Active team not found' }, { status: 400 })
    }
  }

  if (activeManagerId) {
    const mgr = await get(users, activeManagerId)
    if (!mgr) {
      return NextResponse.json({ error: 'Active manager not found' }, { status: 404 })
    }
    if ((mgr.role || '').toLowerCase() === 'customer') {
      return NextResponse.json({ error: 'Active manager must be a non-customer user' }, { status: 400 })
    }
  }

  const row = await insert(companies, {
    name,
    email: email?.trim() || null,
    color: color || '#000000',
    isActive: is_active !== undefined ? is_active : true,
    activeTeamId,
    activeManagerId,
    isCustomer: isCustomerCompany,
  })

  if (!row) {
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
  }

  if (leader_user_id) {
    await update(users, leader_user_id, { companyId: row.id, updatedAt: new Date() })
    await upsertCompanyUserMembership({
      companyId: row.id,
      userId: leader_user_id,
      companyRole: 'company_admin',
    })
  }

  revalidateTicketsLookupCatalog()
  return NextResponse.json(
    {
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        created_by: leader_user_id ?? null,
        color: row.color,
        is_active: row.isActive ?? true,
        active_team_id: row.activeTeamId ?? null,
        active_manager_id: row.activeManagerId ?? null,
        is_customer: row.isCustomer ?? false,
        created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
        last_ticket_updated_at: null,
      },
      success: true,
    },
    { status: 201 }
  )
}
