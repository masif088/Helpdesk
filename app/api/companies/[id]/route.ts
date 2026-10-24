import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canEditCompanies, isAdminOrManager } from '@/lib/auth-utils'
import { parseHourlyRateBody } from '@/lib/billing-rate'
import { getCompanyDetail } from '@/lib/company-detail'
import { customerOwnsCompany, isCompanyPortalAdmin, userBelongsToCompany } from '@/lib/customer-company'
import {
  companies,
  companyUsers,
  deleteCompanyCascade,
  findOne,
  get,
  type Patch,
  teams,
  update,
  updateWhere,
  users,
} from '@/lib/fsdb'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

function normalizeUuidBody(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return null
  return v
}

/** GET /api/companies/[id] - Get company with related data */
export async function GET(
  _request: Request,
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

  const companyData = await getCompanyDetail(id, { includeBilling: isAdminOrManager(role) })
  if (!companyData) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  return NextResponse.json({ data: companyData })
}

/** PUT /api/companies/[id] - Update company */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, email, is_active, color, leader_user_id } = body
  const activeTeamId =
    body.active_team_id !== undefined ? normalizeUuidBody(body.active_team_id) : undefined
  const activeManagerId =
    body.active_manager_id !== undefined ? normalizeUuidBody(body.active_manager_id) : undefined
  const isCustomerCompany = body.is_customer !== undefined ? body.is_customer === true : undefined
  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'

  if (!isCustomer && !canEditCompanies(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (isCustomer) {
    const belongs = await userBelongsToCompany(session.user.id!, id)
    if (!belongs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const canEdit = await isCompanyPortalAdmin(session.user.id!, id)
    if (!canEdit) {
      return NextResponse.json({ error: 'Only a portal admin can update company details' }, { status: 403 })
    }
  }

  const updateData: Patch<typeof companies.$inferSelect> = {}
  if (name !== undefined) updateData.name = name
  if (email !== undefined) updateData.email = email?.trim() || null
  if (!isCustomer && is_active !== undefined) updateData.isActive = is_active
  if (color !== undefined) updateData.color = color

  if (!isCustomer) {
    if (activeTeamId !== undefined) {
      if (activeTeamId) {
        const teamRow = await get(teams, activeTeamId)
        if (!teamRow) {
          return NextResponse.json({ error: 'Active team not found' }, { status: 400 })
        }
      }
      updateData.activeTeamId = activeTeamId
    }
    if (activeManagerId !== undefined) {
      if (activeManagerId) {
        const mgr = await get(users, activeManagerId)
        if (!mgr) {
          return NextResponse.json({ error: 'Active manager not found' }, { status: 404 })
        }
        if ((mgr.role || '').toLowerCase() === 'customer') {
          return NextResponse.json({ error: 'Active manager must be a non-customer user' }, { status: 400 })
        }
      }
      updateData.activeManagerId = activeManagerId
    }
    if (isCustomerCompany !== undefined) updateData.isCustomer = isCustomerCompany
    if (body.email_auto_reply !== undefined) updateData.emailAutoReply = body.email_auto_reply !== false
  }

  const defaultRate = parseHourlyRateBody(body, { rate: 'default_hourly_rate', currency: 'default_rate_currency' })
  if (defaultRate !== undefined) {
    if (!isAdminOrManager(role)) {
      return NextResponse.json({ error: 'Only admins and managers can set the default hourly rate' }, { status: 403 })
    }
    if ('error' in defaultRate) {
      return NextResponse.json({ error: defaultRate.error }, { status: 400 })
    }
    updateData.defaultHourlyRate = defaultRate.hourlyRate
    updateData.defaultRateCurrency = defaultRate.rateCurrency
  }

  if (leader_user_id !== undefined) {
    if (isCustomer) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
  }

  const row = await update(companies, id, { ...updateData, updatedAt: new Date() })

  if (!row) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  if (leader_user_id && !isCustomer) {
    await updateWhere(
      companyUsers,
      [
        ['companyId', '==', id],
        ['userId', '!=', leader_user_id],
      ],
      { companyRole: 'member', updatedAt: new Date() }
    )
    await update(users, leader_user_id, { companyId: id, updatedAt: new Date() })
    await upsertCompanyUserMembership({
      companyId: id,
      userId: leader_user_id,
      companyRole: 'company_admin',
    })
  }

  const leaderRow = await findOne(companyUsers, {
    where: [
      ['companyId', '==', id],
      ['companyRole', '==', 'company_admin'],
    ],
  })

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    data: {
      id: row.id,
      name: row.name,
      email: row.email,
      created_by: leaderRow?.userId ?? null,
      color: row.color,
      is_active: row.isActive ?? true,
      active_team_id: row.activeTeamId ?? null,
      active_manager_id: row.activeManagerId ?? null,
      is_customer: row.isCustomer ?? false,
      email_auto_reply: row.emailAutoReply !== false,
      ...(isAdminOrManager(role)
        ? { default_hourly_rate: row.defaultHourlyRate ?? null, default_rate_currency: row.defaultRateCurrency ?? null }
        : {}),
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
    },
    success: true,
  })
}

/** DELETE /api/companies/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await deleteCompanyCascade(id)

  revalidateTicketsLookupCatalog()
  return NextResponse.json({ success: true, message: 'Company deleted successfully' })
}
