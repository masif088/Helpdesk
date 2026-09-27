'use client'

import { ClockCircleOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { App, Badge, Button, Empty, Popover, Space, Spin, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { useSession } from '@/lib/auth-client'

const { Text } = Typography

const POLL_MS = 20_000

type ActiveTrackerRow = {
  id: string
  ticket_id: number
  start_time: string
  ticket?: { id: number; title: string }
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function ActiveTimeTrackerNavButton() {
  const { message } = App.useApp()
  const { status, data: session } = useSession()
  const router = useRouter()
  const userId = session?.user?.id

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeTrackers, setActiveTrackers] = useState<ActiveTrackerRow[]>([])
  const [elapsedBySessionId, setElapsedBySessionId] = useState<Record<string, number>>({})
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [pausingId, setPausingId] = useState<string | null>(null)
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [pausedTrackers, setPausedTrackers] = useState<{ row: ActiveTrackerRow; elapsed: number }[]>([])

  const loadActive = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await apiFetch<ActiveTrackerRow[]>(
        `/api/users/time-tracker?user_id=${encodeURIComponent(userId)}&active_only=1`
      )
      setActiveTrackers(Array.isArray(data) ? data : [])
    } catch {
      setActiveTrackers([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (status !== 'authenticated' || !userId) return
    void loadActive()
    const id = window.setInterval(() => void loadActive(), POLL_MS)
    return () => window.clearInterval(id)
  }, [status, userId, loadActive])

  useEffect(() => {
    if (!open || !userId) return
    void loadActive()
  }, [open, userId, loadActive])

  useEffect(() => {
    if (activeTrackers.length === 0) {
      setElapsedBySessionId({})
      return
    }
    const tick = () => {
      const next: Record<string, number> = {}
      for (const t of activeTrackers) {
        next[t.id] = Math.floor((Date.now() - new Date(t.start_time).getTime()) / 1000)
      }
      setElapsedBySessionId(next)
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [activeTrackers])

  const handlePauseTracker = async (row: ActiveTrackerRow) => {
    setPausingId(row.id)
    try {
      await apiFetch(`/api/tickets/${row.ticket_id}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', session_id: row.id }),
      })
      const elapsed = elapsedBySessionId[row.id] ?? 0
      setActiveTrackers((prev) => prev.filter((t) => t.id !== row.id))
      setPausedTrackers((prev) => [...prev.filter((p) => p.row.id !== row.id), { row, elapsed }])
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to pause tracker')
    } finally {
      setPausingId(null)
    }
  }

  const handleResumeTracker = async (paused: { row: ActiveTrackerRow; elapsed: number }) => {
    setResumingId(paused.row.id)
    try {
      const data = await apiFetch<ActiveTrackerRow>(`/api/tickets/${paused.row.ticket_id}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      setPausedTrackers((prev) => prev.filter((p) => p.row.id !== paused.row.id))
      setActiveTrackers((prev) => [...prev, data])
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to resume tracker')
    } finally {
      setResumingId(null)
    }
  }

  const handleStopTracker = async (row: ActiveTrackerRow) => {
    setStoppingId(row.id)
    try {
      await apiFetch(`/api/tickets/${row.ticket_id}/time-tracker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', session_id: row.id }),
      })
      setActiveTrackers((prev) => prev.filter((t) => t.id !== row.id))
      message.success('Time tracker stopped')
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to stop tracker')
    } finally {
      setStoppingId(null)
    }
  }

  const running = activeTrackers.length > 0

  useEffect(() => {
    if (!running) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [running])

  const role = (session?.user as { role?: string } | undefined)?.role?.toLowerCase()
  if (status !== 'authenticated' || !userId || role === 'customer') return null
  const primaryElapsed =
    running && activeTrackers[0] ? formatTime(elapsedBySessionId[activeTrackers[0].id] ?? 0) : null

  const hoverSurface = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = running
      ? 'var(--ant-color-success-bg-hover, #d9f7be)'
      : 'var(--ticket-nav-icon-hover-bg)'
  }
  const hoverSurfaceLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = running
      ? 'var(--ant-color-success-bg, #f6ffed)'
      : 'var(--ticket-nav-icon-btn-bg)'
  }

  const popoverContent = (
    <div style={{ width: 340, maxWidth: 'calc(100vw - 32px)' }}>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text strong>Active time tracker</Text>
        {running ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {activeTrackers.length} running
          </Text>
        ) : null}
      </div>
      {loading && activeTrackers.length === 0 && pausedTrackers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin size="small" />
        </div>
      ) : running || pausedTrackers.length > 0 ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {activeTrackers.map((row) => (
            <div
              key={row.id}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text strong style={{ cursor: 'pointer', color: 'var(--ant-color-primary)' }} ellipsis
                  onClick={() => { setOpen(false); router.push(`/tickets/${row.ticket_id}`) }}>
                  #{row.ticket_id} {row.ticket?.title}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Elapsed: <Text strong>{formatTime(elapsedBySessionId[row.id] ?? 0)}</Text>
                </Text>
              </div>
              <Space size="small" wrap>
                <Button size="small" onClick={() => { setOpen(false); router.push(`/tickets/${row.ticket_id}`) }}>Open</Button>
                <Button size="small" icon={<PauseCircleOutlined />} loading={pausingId === row.id} onClick={() => void handlePauseTracker(row)}>Pause</Button>
                <Button size="small" type="primary" danger icon={<StopOutlined />} loading={stoppingId === row.id} onClick={() => void handleStopTracker(row)}>Stop</Button>
              </Space>
            </div>
          ))}
          {pausedTrackers.map((p) => (
            <div
              key={p.row.id}
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: 0.8 }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text strong style={{ cursor: 'pointer', color: 'var(--ant-color-primary)' }} ellipsis
                  onClick={() => { setOpen(false); router.push(`/tickets/${p.row.ticket_id}`) }}>
                  #{p.row.ticket_id} {p.row.ticket?.title}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Paused at: <Text strong>{formatTime(p.elapsed)}</Text>
                </Text>
              </div>
              <Space size="small" wrap>
                <Button size="small" onClick={() => { setOpen(false); router.push(`/tickets/${p.row.ticket_id}`) }}>Open</Button>
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={resumingId === p.row.id} onClick={() => void handleResumeTracker(p)}>Resume</Button>
                <Button size="small" danger icon={<StopOutlined />} onClick={() => setPausedTrackers((prev) => prev.filter((x) => x.row.id !== p.row.id))}>Stop</Button>
              </Space>
            </div>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No active tracker. Start one from a ticket."
        />
      )}
    </div>
  )

  return (
    <Popover
      content={popoverContent}
      trigger={['hover', 'click']}
      mouseEnterDelay={0.12}
      mouseLeaveDelay={0.28}
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      destroyOnHidden={false}
    >
      <button
        type="button"
        aria-label={running ? `Active time tracker, ${primaryElapsed}` : 'Time tracker'}
        title={running ? `Tracking: ${primaryElapsed}` : 'Time tracker'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: running && primaryElapsed ? 6 : 0,
          minWidth: 40,
          height: 40,
          padding: running && primaryElapsed ? '0 10px' : 0,
          border: running
            ? '1px solid var(--ant-color-success-border, #b7eb8f)'
            : '1px solid var(--ticket-nav-icon-btn-border)',
          borderRadius: 8,
          background: running ? 'var(--ant-color-success-bg, #f6ffed)' : 'var(--ticket-nav-icon-btn-bg)',
          color: running ? 'var(--ant-color-success)' : 'var(--ticket-nav-icon-btn-color)',
          cursor: 'pointer',
        }}
        onMouseEnter={hoverSurface}
        onMouseLeave={hoverSurfaceLeave}
      >
        <Badge dot={running} color="var(--ant-color-success)" offset={running ? [-2, 2] : undefined}>
          <ClockCircleOutlined style={{ fontSize: 18 }} />
        </Badge>
        {running && primaryElapsed ? (
          <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{primaryElapsed}</span>
        ) : null}
      </button>
    </Popover>
  )
}
