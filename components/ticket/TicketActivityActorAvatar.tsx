'use client'

import { CloudOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar } from 'antd'
import type { CSSProperties } from 'react'

type Props = {
  size?: number
  className?: string
  style?: CSSProperties
  actorRole: string
  avatarUrl?: string | null
  name?: string | null
  email?: string | null
}

/**
 * Avatar for ticket activity rows: photo when available, else initials, else role icon (system/automation).
 */
export default function TicketActivityActorAvatar({
  size = 32,
  actorRole,
  avatarUrl,
  name,
  email,
  className,
  style,
}: Props) {
  const label = (name?.trim() || email?.trim() || '').trim()
  const role = actorRole?.toLowerCase() || ''

  if (role === 'system' && !label) {
    return (
      <Avatar
        size={size}
        className={className}
        style={{ backgroundColor: '#8c8c8c', flexShrink: 0, ...style }}
        icon={<CloudOutlined />}
      />
    )
  }
  if (role === 'automation' && !label) {
    return (
      <Avatar
        size={size}
        className={className}
        style={{ backgroundColor: '#0E7490', flexShrink: 0, ...style }}
        icon={<RobotOutlined />}
      />
    )
  }

  const initial = label ? label.charAt(0).toUpperCase() : ''

  return (
    <Avatar
      size={size}
      className={className}
      src={avatarUrl?.trim() || undefined}
      style={{ flexShrink: 0, ...style }}
    >
      {initial || <UserOutlined />}
    </Avatar>
  )
}
