'use client'

import BackLink from '@/components/common/BackLink'

/** "← Settings" at the top of every settings page. */
export default function SettingsBackLink() {
  return (
    <BackLink href="/settings" style={{ marginBottom: 12 }}>
      Settings
    </BackLink>
  )
}
