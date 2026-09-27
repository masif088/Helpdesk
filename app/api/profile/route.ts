import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { afterUserRowChanged } from '@/lib/app-users'
import { get, update, users } from '@/lib/fsdb'

/** PATCH /api/profile - Update current user profile */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    full_name,
    first_name,
    last_name,
    avatar_url,
    phone,
    department,
    position,
    bio,
    timezone,
    locale,
  } = body

  const set: {
    fullName?: string
    firstName?: string | null
    lastName?: string | null
    avatarUrl?: string
    phone?: string | null
    department?: string | null
    position?: string | null
    bio?: string | null
    timezone?: string
    locale?: string
    updatedAt: Date
  } = {
    updatedAt: new Date(),
  }
  if (full_name !== undefined) set.fullName = full_name
  if (first_name !== undefined) set.firstName = first_name || null
  if (last_name !== undefined) set.lastName = last_name || null
  if (avatar_url !== undefined) set.avatarUrl = avatar_url
  if (phone !== undefined) set.phone = phone
  if (department !== undefined) set.department = department
  if (position !== undefined) set.position = position
  if (bio !== undefined) set.bio = bio
  if (timezone !== undefined) set.timezone = timezone
  if (locale !== undefined) set.locale = locale

  const before = await get(users, session.user.id)
  const updated = before ? await update(users, session.user.id, set) : null

  if (!before || !updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  await afterUserRowChanged(before, updated)

  return NextResponse.json({
    success: true,
    user: {
      first_name: updated.firstName,
      last_name: updated.lastName,
      full_name: updated.fullName,
      avatar_url: updated.avatarUrl,
      phone: updated.phone,
      department: updated.department,
      position: updated.position,
      bio: updated.bio,
      timezone: updated.timezone,
      locale: updated.locale,
    },
  })
}
