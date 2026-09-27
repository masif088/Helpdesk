'use client'

import { Typography } from 'antd'
import type { ReactNode } from 'react'

import SettingsBackLink from '@/components/settings/SettingsBackLink'

const { Title, Text } = Typography

/** Header of a settings page: "← Settings", title, one-line description, optional count and actions. */
export default function SettingsPageHeader({
  title,
  description,
  count,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  /** e.g. "12 statuses" */
  count?: ReactNode
  actions?: ReactNode
}) {
  return (
    <>
      <SettingsBackLink />
      <div className="page-head">
        <div>
          <Title level={2} className="page-head__title">
            {title}
          </Title>
          {description ? <Text className="page-head__sub">{description}</Text> : null}
        </div>
        {count || actions ? (
          <div className="page-head__actions">
            {count ? <span className="page-head__count">{count}</span> : null}
            {actions}
          </div>
        ) : null}
      </div>
    </>
  )
}
