'use client'

import { SmileOutlined } from '@ant-design/icons'
import { App, Button, Input, Rate, Typography } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'

const { Text } = Typography

export type Csat = { rating: number; comment: string | null; at: string | null }

const WORDS = ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent']

/**
 * Customer satisfaction for a finished ticket.
 *  - the client (portal): asked "How did we do?" once the ticket is resolved / closed; can change the answer
 *  - the team: sees the rating and comment, if there is one
 */
export default function CsatPanel({
  ticketId,
  finished,
  csat,
  audience,
}: {
  ticketId: number
  finished: boolean
  csat: Csat | null | undefined
  audience: 'customer' | 'staff'
}) {
  const { message } = App.useApp()
  const [saved, setSaved] = useState<Csat | null>(csat ?? null)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState<number>(csat?.rating ?? 0)
  const [comment, setComment] = useState(csat?.comment ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!rating) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/csat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save your rating')
      setSaved(body.csat)
      setEditing(false)
      message.success('Thank you for your feedback')
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const box = {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    marginBottom: 16,
    borderRadius: 12,
    border: '1px solid var(--ant-color-border, rgba(255,255,255,0.12))',
  }

  if (audience === 'staff') {
    if (!saved) return null
    return (
      <div style={box}>
        <SmileOutlined style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13 }}>
            <Text type="secondary">Client rating{saved.at ? ` · ${dayjs(saved.at).format('D MMM YYYY')}` : ''}</Text>
          </div>
          <div>
            <Rate disabled value={saved.rating} style={{ fontSize: 16 }} /> <Text strong>{saved.rating}/5</Text> <Text type="secondary">{WORDS[saved.rating - 1]}</Text>
          </div>
          {saved.comment ? <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{saved.comment}</div> : null}
        </div>
      </div>
    )
  }

  if (!finished) return null

  if (saved && !editing) {
    return (
      <div style={box}>
        <SmileOutlined style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13 }}>
            <Text type="secondary">Thanks for rating this ticket</Text>
          </div>
          <Rate disabled value={saved.rating} style={{ fontSize: 16 }} />
          {saved.comment ? <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{saved.comment}</div> : null}
        </div>
        <Button size="small" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div style={{ ...box, borderColor: 'var(--brand-primary)', background: 'var(--brand-primary-soft)' }}>
      <SmileOutlined style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>How did we do?</div>
        <Rate value={rating} onChange={setRating} tooltips={WORDS} />
        <Input.TextArea
          style={{ marginTop: 8 }}
          rows={2}
          maxLength={1000}
          placeholder="Anything we could do better? (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {saved ? <Button onClick={() => setEditing(false)}>Cancel</Button> : null}
        <Button type="primary" disabled={!rating} loading={busy} onClick={() => void submit()}>
          Send rating
        </Button>
      </div>
    </div>
  )
}
