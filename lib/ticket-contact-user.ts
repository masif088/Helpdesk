import { companyUsers, find, get, users } from '@/lib/fsdb'

/**
 * Primary company for a user: `users.company_id`, else earliest `company_users` row.
 */
export async function getEffectiveCompanyIdForUser(userId: string): Promise<string | null> {
  const u = await get(users, userId)
  if (u?.companyId) return u.companyId
  const [cu] = await find(companyUsers, {
    where: [['userId', '==', userId]],
    orderBy: [['createdAt', 'asc']],
    limit: 1,
  })
  return cu?.companyId ?? null
}

/**
 * Validates ticket.contact_user_id: user must exist and have an email (any company allowed).
 */
export async function assertTicketContactUserAllowed(
  contactUserId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!contactUserId) return { ok: true }

  const u = await get(users, contactUserId)

  if (!u) {
    return { ok: false, error: 'Contact user not found' }
  }
  if (!String(u.email || '').trim()) {
    return { ok: false, error: 'Contact user must have an email address' }
  }

  return { ok: true }
}
