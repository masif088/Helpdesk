'use client'

import { Tooltip, Typography } from 'antd'

import type { KeyUsage } from '@/lib/api-key-usage-core'

const { Text } = Typography

/** What a key did in the last 30 days: calls per day as small bars, calls per permission, calls refused for the limit. */
export default function KeyUsageChart({ usage }: { usage: KeyUsage }) {
  const max = Math.max(1, ...usage.byDay.map((d) => d.calls))
  const scopes = Object.entries(usage.byScope).sort(([, a], [, b]) => b - a)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56 }} aria-label="Calls per day, last 30 days">
        {usage.byDay.map((d) => (
          <Tooltip key={d.date} title={`${d.date}: ${d.calls} call${d.calls === 1 ? '' : 's'}`}>
            <div style={{ flex: 1, minWidth: 3, height: `${Math.max(d.calls ? 6 : 2, (d.calls / max) * 100)}%`, background: d.calls ? '#0F9D8A' : 'var(--kanban-card-border, #e5e7eb)', borderRadius: 2 }} />
          </Tooltip>
        ))}
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {usage.calls30d} calls in 30 days ({usage.calls7d} in the last 7)
        {usage.limited30d ? ` · ${usage.limited30d} refused for the hourly limit` : ''}
        {scopes.length ? ' · ' + scopes.map(([s, n]) => `${s} ${n}`).join(', ') : ''}
      </Text>
    </div>
  )
}
