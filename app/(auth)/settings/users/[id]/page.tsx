import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import UserDetailContent from '@/components/content/user/UserDetailContent'
import { canAccessUsers, isAdminOrManager } from '@/lib/auth-utils'
import { companies, get, users } from '@/lib/fsdb'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const session = await auth()
  const { id } = await params
  const own = session?.user?.id != null && String(session.user.id) === String(id)
  return { title: own ? 'My Profile' : 'User details' }
}

export default async function SettingsUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const role = (session.user as { role?: string }).role
  const r = (role ?? '').toLowerCase()
  const ownProfile = String(session.user.id) === String(id)

  if (!ownProfile && r === 'customer') {
    redirect('/dashboard')
  }
  if (!ownProfile && !canAccessUsers(role) && !isAdminOrManager(role) && r !== 'staff') {
    redirect('/dashboard')
  }

  const userDoc = await get(users, id)
  if (!userDoc) {
    redirect('/settings/users')
  }
  const row = { user: userDoc, company: await get(companies, userDoc.companyId) }

  const u = row.user
  const userData = {
    id: u.id,
    email: u.email,
    first_name: u.firstName,
    last_name: u.lastName,
    full_name: u.fullName,
    role: u.role,
    status: u.status,
    company_id: u.companyId,
    company: row.company ? { id: row.company.id, name: row.company.name } : null,
    avatar_url: u.avatarUrl,
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    updated_at: u.updatedAt ? new Date(u.updatedAt).toISOString() : '',
    last_login_at: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    last_active_at: u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : null,
    phone: u.phone,
    department: u.department,
    position: u.position,
    skills: u.skills ?? [],
    bio: u.bio,
    timezone: u.timezone,
    locale: u.locale,
    is_email_verified: u.isEmailVerified,
  }

  return <UserDetailContent user={session.user} userData={userData} />
}
