import { companyUsers, findBy, findOne, get, getByKey, users } from '@/lib/fsdb'

/** Company UUID for a portal customer (`users.company_id` or `company_users`). */
export async function getCustomerCompanyId(userId: string): Promise<string | null> {
  const userRow = await get(users, userId)
  let companyId = userRow?.companyId ?? null
  if (!companyId) {
    const [cu] = await findBy(companyUsers, { userId }, { limit: 1 })
    companyId = cu?.companyId ?? null
  }
  return companyId
}

export async function customerOwnsCompany(userId: string, companyId: string): Promise<boolean> {
  const cid = await getCustomerCompanyId(userId)
  return cid !== null && cid === companyId
}

/** User is linked to this company via `users.company_id` or `company_users`. */
export async function userBelongsToCompany(userId: string, companyId: string): Promise<boolean> {
  const u = await get(users, userId)
  if (u?.companyId === companyId) return true
  return !!(await getByKey(companyUsers, { companyId, userId }))
}

/**
 * Can manage portal accounts and company contact/branding for this company.
 * - Explicit: `company_users.company_role === 'company_admin'` for this company.
 * - Legacy fallback: if the company has no explicit portal admin yet, the customer whose
 *   `users.company_id` is this company may manage (typical first account).
 */
export async function isCompanyPortalAdmin(userId: string, companyId: string): Promise<boolean> {
  const cu = await getByKey(companyUsers, { companyId, userId })

  if (cu?.companyRole === 'company_admin') return true

  const anyAdmin = await findOne(companyUsers, {
    where: [
      ['companyId', '==', companyId],
      ['companyRole', '==', 'company_admin'],
    ],
  })

  if (anyAdmin) return false

  const u = await get(users, userId)
  return u?.companyId === companyId
}
