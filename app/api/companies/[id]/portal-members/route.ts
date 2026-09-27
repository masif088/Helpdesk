import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { createAppUser, findUserByEmail } from '@/lib/app-users'
import { isCompanyPortalAdmin, userBelongsToCompany } from '@/lib/customer-company'
import { companies, companyUsers, findBy, get, getMany, users } from '@/lib/fsdb'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

async function mergedCustomerRows(companyId: string) {
  const [byCompanyId, cuRows] = await Promise.all([findBy(users, { companyId }), findBy(companyUsers, { companyId })])
  const byId = new Map(byCompanyId.map((u) => [u.id, u]))
  const cuOnlyIds = cuRows.map((r) => r.userId).filter((uid) => !byId.has(uid))
  const extra = await getMany(users, cuOnlyIds)
  const cuMap = new Map(cuRows.map((r) => [r.userId, r]))
  const merged = [...byCompanyId, ...extra]
  return merged
    .filter((u) => (u.role || '').toLowerCase() === 'customer')
    .map((u) => {
      const cu = cuMap.get(u.id)
      return {
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        status: u.status,
        company_role: cu?.companyRole ?? 'member',
      }
    })
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email))
}

/** GET — customers in this company (portal accounts); any member of the company may view */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId } = await params
  if (!companyId) {
    return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
  }

  const sessionRole = (session.user as { role?: string }).role?.toLowerCase()
  const isGlobalAdmin = sessionRole === 'admin'

  if (!isGlobalAdmin && !(await userBelongsToCompany(session.user.id, companyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const companyRow = await get(companies, companyId)
  if (!companyRow) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const members = await mergedCustomerRows(companyId)
  const currentUserIsCompanyAdmin =
    isGlobalAdmin || (await isCompanyPortalAdmin(session.user.id, companyId))

  return NextResponse.json({ members, currentUserIsCompanyAdmin })
}

/** POST — create customer account for this company (portal admin or global admin) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId } = await params
  if (!companyId) {
    return NextResponse.json({ error: 'Company ID required' }, { status: 400 })
  }

  const sessionRole = (session.user as { role?: string }).role?.toLowerCase()
  const isGlobalAdmin = sessionRole === 'admin'
  if (!isGlobalAdmin && !(await isCompanyPortalAdmin(session.user.id, companyId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const password = String(body.password || '')
  const full_name = body.full_name != null ? String(body.full_name).trim() : ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
  }

  const row = await createAppUser({
    email,
    password,
    fullName: full_name || null,
    role: 'customer',
    status: 'active',
    companyId,
  })

  if (!row) {
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  await upsertCompanyUserMembership({
    companyId,
    userId: row.id,
    companyRole: 'member',
  })

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      email: row.email,
      full_name: row.fullName,
      company_role: 'member',
    },
  })
}
