'use client'

import { ArrowLeftOutlined } from '@ant-design/icons'

import { SpaNavLink } from '@/components/common/SpaNavLink'

/** Same "← Settings" link at the top of every settings page (style: .settings-back in globals.css). */
export default function SettingsBackLink() {
  return (
    <SpaNavLink href="/settings" className="settings-back">
      <ArrowLeftOutlined /> Settings
    </SpaNavLink>
  )
}
