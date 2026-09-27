'use client'

import { UserOutlined } from '@ant-design/icons'
import { Avatar, Dropdown, Typography } from 'antd'
import { useRouter } from 'next/navigation'

import { signOutAction } from '@/app/actions/auth'
import { useSession } from '@/lib/auth-client'

import { adminNavbarAccountMenuItems } from './adminNavbarAccountMenu'

const { Text } = Typography

export type NavbarAccountUser = {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  user_metadata?: { full_name?: string | null; avatar_url?: string | null }
}

type Props = { user: NavbarAccountUser }

/** Top-bar account control (ticket navbar): avatar + display name + same menu as sidebar footer used to serve. */
export default function NavbarAccount({ user }: Props) {
  const router = useRouter()
  const { data: session } = useSession()

  const handleLogout = async () => {
    await signOutAction()
    router.push('/login')
    router.refresh()
  }

  const displayName = session?.user?.name ?? user.name ?? user.user_metadata?.full_name ?? 'User'

  return (
    <Dropdown
      menu={{ items: adminNavbarAccountMenuItems(handleLogout) }}
      placement="bottomRight"
      trigger={['click']}
      getPopupContainer={() => document.body}
      styles={{ root: { zIndex: 500 } }}
    >
      <button
        type="button"
        aria-label="Account menu"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: 'min(280px, 46vw)',
          padding: '4px 10px',
          margin: 0,
          cursor: 'pointer',
          border: '1px solid var(--ticket-nav-icon-btn-border)',
          borderRadius: 8,
          background: 'var(--ticket-nav-icon-btn-bg)',
          color: 'var(--ticket-nav-text)',
          outline: 'none',
        }}
      >
        <Avatar
          size={32}
          icon={<UserOutlined />}
          src={session?.user?.image ?? user.image ?? user.user_metadata?.avatar_url ?? undefined}
        />
        <Text
          strong
          style={{
            fontSize: 13,
            color: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={[displayName, user.email].filter(Boolean).join(' · ')}
        >
          {displayName}
        </Text>
      </button>
    </Dropdown>
  )
}
