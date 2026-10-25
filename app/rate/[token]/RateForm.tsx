'use client'

import { Alert, Button, Input, Rate } from 'antd'
import { useState } from 'react'

const WORDS = ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent']

export default function RateForm({ token, initialRating, initialComment, alreadyRated }: { token: string; initialRating: number; initialComment: string; alreadyRated: boolean }) {
  const [rating, setRating] = useState(initialRating)
  const [comment, setComment] = useState(initialComment)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!rating) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/csat/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save your rating')
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) return <Alert type="success" showIcon message="Thank you for your feedback!" description="You can use this link again to change your answer." />

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {alreadyRated ? <Alert type="info" showIcon message="You already rated this ticket. You can change your answer." /> : null}
      <div>
        <Rate value={rating} onChange={setRating} style={{ fontSize: 34 }} />
        <div style={{ minHeight: 22, marginTop: 4, opacity: 0.7 }}>{rating ? WORDS[rating - 1] : 'Tap a star'}</div>
      </div>
      <Input.TextArea rows={3} maxLength={1000} placeholder="Anything we should know? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error ? <Alert type="error" showIcon message={error} /> : null}
      <div>
        <Button type="primary" size="large" disabled={!rating} loading={busy} onClick={() => void submit()}>
          Send rating
        </Button>
      </div>
    </div>
  )
}
