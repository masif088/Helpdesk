import { auth } from '@/auth'
import ProfileContent from '@/components/content/settings/ProfileContent'
import { get, users } from '@/lib/fsdb'

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const userRow = await get(users, session.user.id)
  const userData = userRow
    ? {
        first_name: userRow.firstName,
        last_name: userRow.lastName,
        full_name: userRow.fullName,
        avatar_url: userRow.avatarUrl,
        phone: userRow.phone,
        bio: userRow.bio,
        department: userRow.department,
        position: userRow.position,
        timezone: userRow.timezone ?? 'UTC',
        locale: userRow.locale ?? 'en',
      }
    : undefined

  const displayName =
    (userRow?.fullName && String(userRow.fullName).trim()) ||
    session.user.name ||
    session.user.email ||
    'User'
  const displayAvatar = userRow?.avatarUrl ?? session.user.image ?? null

  return (
    <ProfileContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        name: displayName,
        image: displayAvatar,
        user_metadata: { full_name: displayName, avatar_url: displayAvatar },
      }}
      userData={userData}
    />
  )
}

