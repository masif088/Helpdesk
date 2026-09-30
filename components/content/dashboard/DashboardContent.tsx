'use client'

import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  HourglassOutlined,
  InboxOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { App, Button, Card, Col, Empty, Layout, Row, Space, Tag, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import DashboardAnnouncementsSection from '@/components/dashboard/DashboardAnnouncementsSection'
import { greeting, KpiCard, SectionTitle } from '@/components/dashboard/DashboardBits'
import DashboardHourlyActivityCard from '@/components/dashboard/DashboardHourlyActivityCard'
import StaffDashboardCharts from '@/components/dashboard/DashboardStaffChartsLazy'
import DashboardTrendChart from '@/components/dashboard/DashboardTrendChartLazy'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { AdminDashboardData, DashboardActivityItem } from '@/lib/admin-dashboard'
import { formatMoney } from '@/lib/billing-rate'
import type { StoppedTimeSession } from '@/lib/dashboard-hourly-activity'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

interface DashboardContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
  data: AdminDashboardData | null
}

type ActiveTrackerRow = {
  id: string
  ticket_id: number
  user_id: string
  start_time: string
  ticket?: { id: number; title: string }
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatClock(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

const ACTION_LABELS: Record<string, string> = {
  ticket_created: 'created',
  ticket_updated: 'updated',
  ticket_deleted: 'moved to trash',
  ticket_attribute_added: 'added an attribute to',
  ticket_attribute_updated: 'updated an attribute on',
  ticket_attribute_deleted: 'removed an attribute from',
  comment_added: 'commented on',
  comment_updated: 'edited a comment on',
  comment_deleted: 'deleted a comment on',
  comment_attachment_deleted: 'removed an attachment from',
}

function ActivityRow({ item }: { item: DashboardActivityItem }) {
  const who = item.actorName ?? (item.actorRole === 'automation' ? 'Automation' : item.actorRole === 'system' ? 'System' : 'Someone')
  const initial = who.trim().charAt(0).toUpperCase() || '?'
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--customer-dash-subtle-border)' }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          fontWeight: 700,
          background: 'var(--brand-primary-soft)',
          color: 'var(--brand-primary)',
        }}
      >
        {initial}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>
          <Text strong>{who}</Text> <Text type="secondary">{ACTION_LABELS[item.action] ?? item.action.replace(/_/g, ' ')}</Text>{' '}
          {item.ticketId != null ? (
            <Link href={`/tickets/${item.ticketId}`}>
              #{item.ticketId}
              {item.ticketTitle ? ` ${item.ticketTitle}` : ''}
            </Link>
          ) : null}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(item.createdAt).fromNow()}
        </Text>
      </div>
    </div>
  )
}

export default function DashboardContent({ user, data }: DashboardContentProps) {
  const { message } = App.useApp()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [activeTrackers, setActiveTrackers] = useState<ActiveTrackerRow[]>([])
  const [elapsedBySessionId, setElapsedBySessionId] = useState<Record<string, number>>({})
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<StoppedTimeSession[]>([])

  const loadMyTime = useCallback(async () => {
    try {
      const from = dayjs().subtract(2, 'month').startOf('month').toISOString()
      const [stopped, active] = await Promise.all([
        apiFetch<StoppedTimeSession[]>(
          `/api/users/time-tracker?user_id=${user.id}&filter=custom&start=${encodeURIComponent(from)}&end=${encodeURIComponent(dayjs().toISOString())}&stopped_only=1&limit=500`
        ),
        apiFetch<ActiveTrackerRow[]>(`/api/users/time-tracker?user_id=${user.id}&active_only=1`),
      ])
      setSessions(Array.isArray(stopped) ? stopped : [])
      setActiveTrackers(Array.isArray(active) ? active : [])
    } catch {
      setSessions([])
      setActiveTrackers([])
    }
  }, [user.id])

  useEffect(() => {
    void loadMyTime()
  }, [loadMyTime])

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
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeTrackers])

  const myTime = useMemo(() => {
    const todayStart = dayjs().startOf('day')
    const weekStart = todayStart.subtract((todayStart.day() + 6) % 7, 'day')
    let today = 0
    let week = 0
    for (const s of sessions) {
      const start = dayjs(s.start_time)
      const dur = s.duration_seconds ?? 0
      if (!start.isBefore(todayStart)) today += dur
      if (!start.isBefore(weekStart)) week += dur
    }
    return { today, week }
  }, [sessions])

  const last7Days = useMemo(() => {
    const rows: { day: string; short: string; duration: number; fullMark: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day')
      const secs = sessions
        .filter((s) => dayjs(s.start_time).isSame(d, 'day'))
        .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)
      rows.push({ day: d.format('ddd D MMM'), short: d.format('dd'), duration: Math.round((secs / 3600) * 10) / 10, fullMark: 24 })
    }
    return rows
  }, [sessions])

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
      void loadMyTime()
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to stop tracker')
    } finally {
      setStoppingId(null)
    }
  }

  const firstName = (user.name || user.email || '').split(/[\s@]/)[0]
  const billing = data?.billing ?? null
  const billedLabel = billing?.amounts.length
    ? billing.amounts.map((a) => formatMoney(a.amount, a.currency)).join(' + ')
    : formatMoney(0, 'IDR')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user as { id: string; role?: string }} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={user} style={{ overflow: 'hidden' }}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {dayjs().format('dddd, D MMMM YYYY')}
              </Text>
              <Title level={2} style={{ margin: 0, letterSpacing: '-0.02em' }}>
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </Title>
            </div>
            <Space wrap>
              <Button type="primary" icon={<ArrowRightOutlined />} iconPosition="end" onClick={() => router.push('/tickets')}>
                Go to tickets
              </Button>
            </Space>
          </div>

          <DashboardAnnouncementsSection />

          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} xl={6}>
              <KpiCard
                icon={<InboxOutlined />}
                tone="teal"
                label="Open work"
                value={data?.openCount ?? '—'}
                hint={data ? `${data.newThisWeek} new this week` : undefined}
                href="/tickets"
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <KpiCard
                icon={<HourglassOutlined />}
                tone="amber"
                label="Waiting on client"
                value={data?.waitingCount ?? '—'}
                hint="Question · Client review"
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <KpiCard
                icon={<FieldTimeOutlined />}
                tone="slate"
                label="My time this week"
                value={formatDuration(myTime.week)}
                hint={`Today ${formatDuration(myTime.today)}`}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              {billing ? (
                <KpiCard
                  icon={<DollarOutlined />}
                  tone="green"
                  label="Billable this week"
                  value={<span style={{ fontSize: billedLabel.length > 14 ? 20 : 26 }}>{billedLabel}</span>}
                  hint={
                    <Tooltip
                      title={
                        billing.unpricedSeconds > 0
                          ? `${formatDuration(billing.unpricedSeconds)} billable time is on tickets without an hourly rate`
                          : undefined
                      }
                    >
                      {formatDuration(billing.billableSeconds)} billable · {formatDuration(billing.nonBillableSeconds)} internal
                      {billing.unpricedSeconds > 0 ? ' · some unpriced' : ''}
                    </Tooltip>
                  }
                />
              ) : (
                <KpiCard
                  icon={<CheckCircleOutlined />}
                  tone="green"
                  label="Closed this week"
                  value={data?.closedThisWeek ?? '—'}
                  hint="Resolved or closed support tickets"
                />
              )}
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={16}>
              <Card
                title={
                  <SectionTitle extra={<Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>Last 14 days</Text>}>
                    Ticket flow
                  </SectionTitle>
                }
                style={{ height: '100%' }}
              >
                {data ? <DashboardTrendChart data={data.trend} /> : <Empty description="No data" />}
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card
                title={
                  <SectionTitle extra={<Link href="/tickets" style={{ fontSize: 12, fontWeight: 400 }}>View queue</Link>}>
                    Priority queue
                  </SectionTitle>
                }
                style={{ height: '100%' }}
                styles={{ body: { paddingTop: 8 } }}
              >
                {data?.queue.length ? (
                  data.queue.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets/${t.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid var(--customer-dash-subtle-border)',
                        color: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          minWidth: 30,
                          height: 24,
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          background: t.priority === 1 ? 'rgba(220, 38, 38, 0.12)' : 'var(--brand-primary-soft)',
                          color: t.priority === 1 ? '#DC2626' : 'var(--brand-primary)',
                        }}
                      >
                        P{t.priority ?? '–'}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          #{t.id} {t.title}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t.companyName ?? 'No company'}
                          {t.dueDate ? ` · due ${dayjs(t.dueDate).format('D MMM')}` : ''}
                        </Text>
                      </div>
                      <Tag color={t.statusColor ?? undefined} style={{ marginInlineEnd: 0 }}>
                        {t.statusTitle}
                      </Tag>
                    </Link>
                  ))
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Queue is clear" />
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={12}>
              <Card title={<SectionTitle>Recent activity</SectionTitle>} style={{ height: '100%' }} styles={{ body: { paddingTop: 4 } }}>
                {data?.recent.length ? (
                  data.recent.map((item) => <ActivityRow key={item.id} item={item} />)
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity yet" />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card
                title={
                  <SectionTitle
                    extra={
                      activeTrackers.length > 0 ? (
                        <Tag color="green" style={{ marginInlineEnd: 0 }}>
                          {activeTrackers.length} running
                        </Tag>
                      ) : null
                    }
                  >
                    My timers
                  </SectionTitle>
                }
                style={{ height: '100%' }}
              >
                {activeTrackers.length > 0 ? (
                  <Space orientation="vertical" size={10} style={{ width: '100%', marginBottom: 16 }}>
                    {activeTrackers.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: 'var(--brand-primary-soft)',
                        }}
                      >
                        <ClockCircleOutlined style={{ color: 'var(--brand-primary)', fontSize: 18 }} />
                        <Link href={`/tickets/${row.ticket_id}`} style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'inherit' }}>
                          #{row.ticket_id} {row.ticket?.title ?? ''}
                        </Link>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                          {formatClock(elapsedBySessionId[row.id] ?? 0)}
                        </span>
                        <Button
                          size="small"
                          danger
                          icon={<StopOutlined />}
                          onClick={() => handleStopTracker(row)}
                          loading={stoppingId === row.id}
                        >
                          Stop
                        </Button>
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    No timer running. Start one from a ticket.
                  </Text>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Hours tracked · last 7 days
                </Text>
                <StaffDashboardCharts chartData={last7Days} />
              </Card>
            </Col>
          </Row>

          <DashboardHourlyActivityCard
            stoppedSessions={sessions}
            activeSessions={activeTrackers.map((t) => ({ ticket_id: t.ticket_id, start_time: t.start_time }))}
          />
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
