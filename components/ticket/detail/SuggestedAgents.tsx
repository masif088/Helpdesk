'use client'

import { PlusOutlined } from '@ant-design/icons'
import { Button, Tooltip, Typography } from 'antd'
import { useEffect, useState } from 'react'

import type { TicketSuggestions } from '@/lib/agent-suggestions'

const { Text } = Typography

/**
 * Under a ticket's assignees: agents whose skills match what the ticket's type / tags ask for, lightest plate first.
 * "Add" puts them in the draft assignees (saved with the other attributes). Renders nothing while there is nothing to suggest.
 */
export default function SuggestedAgents({
  ticketId,
  assigneeIds,
  onAdd,
  refreshKey,
  skills,
}: {
  ticketId: number
  assigneeIds: string[]
  onAdd: (userId: string) => void
  /** Changes when the ticket was saved (type / tags / team may have changed) */
  refreshKey?: string | number | null
  /** Skills currently chosen in the form (even before saving) */
  skills?: string[]
}) {
  const [data, setData] = useState<TicketSuggestions | null>(null)
  const skillsKey = skills ? skills.join('|') : null

  useEffect(() => {
    let alive = true
    const qs = skills ? `?skills=${encodeURIComponent(skills.join(','))}` : ''
    fetch(`/api/tickets/${ticketId}/suggested-agents${qs}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ticketId, refreshKey, skillsKey])

  const open = (data?.agents ?? []).filter((a) => !assigneeIds.includes(a.userId))
  if (!data || open.length === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {data.requiredSkills.length ? `Suggested · ${data.requiredSkills.join(', ')}` : 'Lightest plate'}
      </Text>
      <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
        {open.slice(0, 3).map((a) => (
          <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {a.matchPercent != null ? `${a.matchPercent}% · ` : ''}
                {a.matched.length ? `${a.matched.join(', ')} · ` : ''}
                {a.active} active{a.overdue ? ` · ${a.overdue} overdue` : ''}
              </div>
            </div>
            <Tooltip title={`Add ${a.name} (saved with Save changes)`}>
              <Button size="small" type="text" icon={<PlusOutlined />} style={{ color: '#fff' }} onClick={() => onAdd(a.userId)} aria-label={`Add ${a.name}`} />
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  )
}
