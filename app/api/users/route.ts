import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { companies, companyUsers, find, findBy, getMany, getManyMap, sortRows, users, type UsersRow } from '@/lib/fsdb'

/** GET /api/users - List users with company. When customer: only users in same company */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id!
    const role = (session.user as { role?: string }).role?.toLowerCase()

    let companyId: string | null = null
    if (role === 'customer') {
      companyId = await getCustomerCompanyId(userId)
    }

    if (role === 'customer' && !companyId) {
      return NextResponse.json([])
    }

    let userRows: UsersRow[]
    if (role === 'customer' && companyId) {
      const [directRows, cuRows] = await Promise.all([
        findBy(users, { companyId }),
        findBy(companyUsers, { companyId }),
      ])
      const idSet = new Set<string>()
      for (const r of directRows) idSet.add(r.id)
      for (const r of cuRows) idSet.add(r.userId)
      const ids = [...idSet]
      if (ids.length === 0) {
        return NextResponse.json([])
      }
      userRows = sortRows(await getMany(users, ids), [['createdAt', 'desc']])
    } else {
      userRows = await find(users, { orderBy: [['createdAt', 'desc']] })
    }

    const companyById = await getManyMap(companies, userRows.map((u) => u.companyId))
    const rows = userRows.map((user) => ({
      user,
      company: user.companyId ? companyById.get(user.companyId) ?? null : null,
    }))

    const result = rows.map((r) => {
    const u = r.user
    return {
      id: u.id,
      email: u.email,
      first_name: u.firstName,
      last_name: u.lastName,
      full_name: u.fullName,
      role: u.role,
      status: u.status,
      company_id: u.companyId,
      company: r.company ? { id: r.company.id, name: r.company.name } : null,
      avatar_url: u.avatarUrl,
      created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
      last_login_at: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
      last_active_at: u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : null,
      phone: u.phone,
      department: u.department,
      position: u.position,
      bio: u.bio,
      timezone: u.timezone,
      locale: u.locale,
      is_email_verified: u.isEmailVerified,
      contact_kind: u.contactKind ?? null,
    }
  })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[API /api/users]', err)
    const msg = err?.message || String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
