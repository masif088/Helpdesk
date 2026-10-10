'use client'

import { BulbOutlined, UserAddOutlined } from '@ant-design/icons'
import { Button, Tooltip, Typography } from 'antd'
import { useEffect, useState } from 'react'

import type { SuggestedAgent, TicketSuggestions } from '@/lib/agent-suggestions'

const { Text } = Typography

function detail(a: SuggestedAgent): string {
  const pct = a.matchPercent != null ? `${a.matchPercent}% skill match` : 'lightest plate'
  return `${pct}${a.matched.length ? ` (${a.matched.join(', ')})` : ''} · ${a.active} active${a.overdue ? ` · ${a.overdue} overdue` : ''}`
}

/**
 * Banner at the top of a ticket nobody is assigned to: the agent whose skills fit best, with a one-click assign.
 * Hidden while the ticket has an assignee, or when it needs no skills (nothing to recommend by).
 */
export default function AssignRecommendation({
  ticketId,
  assigneeCount,
  onAssign,
  refreshKey,
}: {
  ticketId: number
  assigneeCount: number
  onAssign: (userId: string, name: string) => Promise<void>
  refreshKey?: string | number | null
}) {
  const [data, setData] = useState<TicketSuggestions | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (assigneeCount > 0) {
      setData(null)
      return
    }
    let alive = true
    fetch(`/api/tickets/${ticketId}/suggested-agents`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ticketId, assigneeCount, refreshKey])

  const agents = (data?.agents ?? []).filter((a) => !a.alreadyAssigned)
  if (assigneeCount > 0 || !data || data.requiredSkills.length === 0 || agents.length === 0) return null
  const [best, ...rest] = agents

  const assign = async (a: SuggestedAgent) => {
    setBusy(a.userId)
    try {
      await onAssign(a.userId, a.name)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        marginBottom: 16,
        borderRadius: 12,
        border: '1px solid var(--brand-primary)',
        background: 'var(--brand-primary-soft)',
      }}
    >
      <BulbOutlined style={{ color: 'var(--brand-primary)', fontSize: 18 }} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 13 }}>
          <Text type="secondary">
            Recommended assignee · needs {data.requiredSkills.join(', ')}
            {data.source === 'client' ? ' (client skills for this type)' : ''}
          </Text>
        </div>
        <div style={{ fontWeight: 600 }}>
          {best.name} <Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>— {detail(best)}</Text>
        </div>
      </div>
      <Button type="primary" icon={<UserAddOutlined />} loading={busy === best.userId} disabled={busy !== null} onClick={() => void assign(best)}>
        Assign {best.name.split(' ')[0]}
      </Button>
      {rest.slice(0, 2).map((a) => (
        <Tooltip key={a.userId} title={detail(a)}>
          <Button loading={busy === a.userId} disabled={busy !== null} onClick={() => void assign(a)}>
            {a.name.split(' ')[0]}
            {a.matchPercent != null ? ` · ${a.matchPercent}%` : ''}
          </Button>
        </Tooltip>
      ))}
    </div>
  )
}
