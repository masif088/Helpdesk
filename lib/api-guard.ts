/**
 * Role checks for API routes. The edge middleware only knows that a session cookie exists, so every
 * route decides who may call it: `denyUnless` for a role rule, `denyTicketRead` / `denyCompanyRead` for
 * data a customer may read only when it is their own.
 */
import { NextResponse } from 'next/server'

import { isInternalUser } from '@/lib/auth-utils'
import { customerOwnsCompany } from '@/lib/customer-company'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'

type SessionUser = { id?: string | null; role?: string | null } | undefined

const roleOf = (user: SessionUser) => (user as { role?: string } | undefined)?.role

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

/** 403 response unless the signed-in user's role passes `allowed`; null when the call may go on. */
export function denyUnless(user: SessionUser, allowed: (role: string | undefined) => boolean): NextResponse | null {
  return allowed(roleOf(user)) ? null : forbidden()
}

/** Staff may read any ticket; a customer only a ticket of their own company (or their own personal ticket). */
export async function denyTicketRead(user: SessionUser, ticketId: number): Promise<NextResponse | null> {
  if (isInternalUser(roleOf(user))) return null
  if (!user?.id || !Number.isFinite(ticketId)) return forbidden()
  const access = await assertCustomerMayAccessTicket(user.id, ticketId)
  return access.ok ? null : NextResponse.json({ error: access.status === 404 ? 'Not found' : 'Forbidden' }, { status: access.status })
}

/** Staff may read any company; a customer only their own. */
export async function denyCompanyRead(user: SessionUser, companyId: string): Promise<NextResponse | null> {
  if (isInternalUser(roleOf(user))) return null
  if (!user?.id || !(await customerOwnsCompany(user.id, companyId))) return forbidden()
  return null
}
