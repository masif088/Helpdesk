'use client'

import { Tag, Tooltip } from 'antd'

import { API_KEY_SCOPE_LABELS, API_KEY_SCOPE_SHORT, API_KEY_WRITE_SCOPES, type ApiKeyScope } from '@/lib/api-key-core'

/** A permission in plain words (“Read tickets”); orange when it changes data. Hover for the exact permission name and what it allows. */
export default function ScopeTag({ scope }: { scope: ApiKeyScope }) {
  return (
    <Tooltip title={`${scope}: ${API_KEY_SCOPE_LABELS[scope] ?? ''}`}>
      <Tag color={API_KEY_WRITE_SCOPES.includes(scope) ? 'orange' : undefined} style={{ marginInlineEnd: 4 }}>
        {API_KEY_SCOPE_SHORT[scope] ?? scope}
      </Tag>
    </Tooltip>
  )
}
