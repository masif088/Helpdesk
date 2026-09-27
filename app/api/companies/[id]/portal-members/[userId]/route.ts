import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { afterUserRowChanged, setUserPassword } from '@/lib/app-users'
import { isCompanyPortalAdmin, userBelongsToCompany } from '@/lib/customer-company'
import { get, update, users } from '@/lib/fsdb'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

const COMPANY_ROLES = ['member', 'company_admin'] as const
type CompanyRole = (typeof COMPANY_ROLES)[number]

function isCompanyRole(v: unknown): v is CompanyRole {
  return typeof v === 'string' && (COMPANY_ROLES as readonly string[]).includes(v)
}

/** PATCH — set password (portal admin or global admin); set company_role (global admin only) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId, userId: targetUserId } = await params
  if (!companyId || !targetUserId) {
    return NextResponse.json({ error: 'Company and user ID required' }, { status: 400 })
  }

  const sessionRole = (session.user as { role?: string }).role?.toLowerCase()
  const isGlobalAdmin = sessionRole === 'admin'

  const target = await get(users, targetUserId)
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if ((target.role || '').toLowerCase() !== 'customer') {
    return NextResponse.json({ error: 'Only customer accounts can be managed here' }, { status: 400 })
  }
  if (!(await userBelongsToCompany(targetUserId, companyId))) {
    return NextResponse.json({ error: 'User is not in this company' }, { status: 400 })
  }

  const body = await request.json()
  let didSomething = false

  if (body && body.company_role !== undefined) {
    if (!isGlobalAdmin) {
      return NextResponse.json({ error: 'Only system admin can change portal admin role' }, { status: 403 })
    }
    if (!isCompanyRole(body.company_role)) {
      return NextResponse.json({ error: 'Invalid company_role' }, { status: 400 })
    }
    await upsertCompanyUserMembership({
      companyId,
      userId: targetUserId,
      companyRole: body.company_role,
    })
    didSomething = true
  }

  if (body && body.password !== undefined && body.password !== null && body.password !== '') {
    if (!isGlobalAdmin && !(await isCompanyPortalAdmin(session.user.id, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const password = String(body.password)
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    await setUserPassword(target, password)
    await update(users, targetUserId, { updatedAt: new Date() })
    didSomething = true
  }

  if (body && body.status !== undefined && body.status !== null) {
    const st = String(body.status).toLowerCase().trim()
    if (st !== 'active' && st !== 'inactive') {
      return NextResponse.json({ error: 'status must be active or inactive' }, { status: 400 })
    }
    if (!isGlobalAdmin && !(await isCompanyPortalAdmin(session.user.id, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (targetUserId === session.user.id) {
      return NextResponse.json({ error: 'You cannot change your own account status here' }, { status: 400 })
    }
    if (!isGlobalAdmin && (await isCompanyPortalAdmin(targetUserId, companyId))) {
      return NextResponse.json(
        { error: 'Cannot change status for another portal administrator' },
        { status: 403 },
      )
    }
    const after = await update(users, targetUserId, { status: st, updatedAt: new Date() })
    if (after) await afterUserRowChanged(target, after)
    didSomething = true
  }

  if (!didSomething) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
