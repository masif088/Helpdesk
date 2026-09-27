import { companyUsers, upsert } from '@/lib/fsdb'

/** Insert or update the company_users membership (doc key = company + user). */
export async function upsertCompanyUserMembership(args: {
  companyId: string
  userId: string
  companyRole: string
}) {
  const { companyId, userId, companyRole } = args
  const now = new Date()
  await upsert(
    companyUsers,
    { companyId, userId, companyRole, createdAt: now, updatedAt: now },
    { companyRole, updatedAt: now }
  )
}
