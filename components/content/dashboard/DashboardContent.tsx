'use client'

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  FolderOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { App, Button, Card, Col, Empty,Layout, List, Row, Space, Statistic, Typography } from 'antd'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import DashboardAnnouncementsSection from '@/components/dashboard/DashboardAnnouncementsSection'
import DashboardHourlyActivityCard from '@/components/dashboard/DashboardHourlyActivityCard'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { StoppedTimeSession } from '@/lib/dashboard-hourly-activity'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}
import dayjs from 'dayjs'

import StaffDashboardCharts from '@/components/dashboard/DashboardStaffChartsLazy'

const { Content } = Layout
const { Title, Text } = Typography

/** How many rows Recent Activities fetches (API max 100). */
const RECENT_TRACKERS_LIMIT = 15

interface DashboardContentProps {
  user: { id: string; email?: string | null; name?: string | null }
  stats: {
    totalUsers: number
    totalTeams: number
    completedTickets: number
    totalTickets: number
  }
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export default function DashboardContent({ user, stats }: DashboardContentProps) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  type ActiveTrackerRow = {
    id: string
    ticket_id: number
    user_id: string
    start_time: string
    tracker_type?: string
    ticket?: { id: number; title: string }
  }
  const [activeTrackers, setActiveTrackers] = useState<ActiveTrackerRow[]>([])
  const [elapsedBySessionId, setElapsedBySessionId] = useState<Record<string, number>>({})
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [lastTrackers, setLastTrackers] = useState<
    Array<{
      id: number | string
      ticket_id: number
      start_time: string
      stop_time: string | null
      duration_seconds: number | null
      ticket?: { id: number; title: string }
      user?: { id: string; full_name: string | null; email: string }
    }>
  >([])
  const [loadingTrackers, setLoadingTrackers] = useState(false)


  const [allSessionsForStats, setAllSessionsForStats] = useState<StoppedTimeSession[]>([])
  const router = useRouter()

  const fetchAllSessionsForStats = async () => {
    try {
      // From 2 calendar months ago so rolling "30d" stats + previous calendar month stay covered
      const fetchFrom = dayjs().subtract(2, 'month').startOf('month').toISOString()
      const data = await apiFetch<StoppedTimeSession[]>(
        `/api/users/time-tracker?user_id=${user.id}&filter=custom&start=${encodeURIComponent(fetchFrom)}&end=${encodeURIComponent(dayjs().toISOString())}&stopped_only=1&limit=500`
      )
      setAllSessionsForStats(Array.isArray(data) ? data : [])
    } catch {
      setAllSessionsForStats([])
    }
  }

  const trackerStats = useMemo(() => {
    const now = dayjs()
    const todayStart = now.startOf('day')
    const weekStart = now.subtract(7, 'day').startOf('day')
    const monthStart = now.subtract(30, 'day').startOf('day')

    let todaySeconds = 0
    let weekSeconds = 0
    let monthSeconds = 0
    const todayTickets = new Set<number>()
    const weekTickets = new Set<number>()
    const monthTickets = new Set<number>()
    const lastMonthTickets = new Set<number>()
    const lastMonthRef = now.subtract(1, 'month')

    allSessionsForStats.forEach((s) => {
      const start = dayjs(s.start_time)
      const dur = s.duration_seconds ?? 0
      if (start.isAfter(todayStart)) {
        todaySeconds += dur
        todayTickets.add(s.ticket_id)
      }
      if (start.isAfter(weekStart)) {
        weekSeconds += dur
        weekTickets.add(s.ticket_id)
      }
      if (start.isAfter(monthStart)) {
        monthSeconds += dur
        monthTickets.add(s.ticket_id)
      }
      if (start.isSame(lastMonthRef, 'month')) {
        lastMonthTickets.add(s.ticket_id)
      }
    })

    return {
      todaySeconds,
      weekSeconds,
      monthSeconds,
      todayTickets: todayTickets.size,
      weekTickets: weekTickets.size,
      monthTickets: monthTickets.size,
      lastMonthTickets: lastMonthTickets.size,
    }
  }, [allSessionsForStats])

  const chartData = useMemo(() => {
    const days: { day: string; short: string; duration: number; fullMark: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day')
      const dayStart = d.startOf('day')
      const dayEnd = d.endOf('day')
      const duration = allSessionsForStats
        .filter((s) => {
          const start = dayjs(s.start_time)
          return start.isAfter(dayStart) && start.isBefore(dayEnd)
        })
        .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)
      days.push({
        day: d.format('ddd D/M'),
        short: d.format('ddd'),
        duration: Math.round((duration / 3600) * 10) / 10,
        fullMark: 24,
      })
    }
    return days
  }, [allSessionsForStats])

  const loadTrackerDashboardData = useCallback(async () => {
    setLoadingTrackers(true)
    try {
      const [lastData, , activeData] = await Promise.all([
        apiFetch<Array<{ id: string; ticket_id: number; start_time: string; stop_time: string | null; duration_seconds: number | null; ticket?: { id: number; title: string } }>>(
          `/api/users/time-tracker?user_id=${user.id}&filter=all&limit=${RECENT_TRACKERS_LIMIT}`
        ),
        fetchAllSessionsForStats(),
        apiFetch<ActiveTrackerRow[]>(`/api/users/time-tracker?user_id=${user.id}&active_only=1`),
      ])
      setLastTrackers(Array.isArray(lastData) ? lastData : [])
      const list = Array.isArray(activeData) ? activeData : []
      setActiveTrackers(list)
    } catch {
      setLastTrackers([])
      setActiveTrackers([])
    } finally {
      setLoadingTrackers(false)
    }
  }, [user.id])

  useEffect(() => {
    void loadTrackerDashboardData()
  }, [loadTrackerDashboardData])

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
      void loadTrackerDashboardData()
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : 'Failed to stop tracker'
      message.error(errMsg)
      console.error('Stop tracker error:', error)
    } finally {
      setStoppingId(null)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn
        collapsed={collapsed}
        user={user}
        style={{
          overflow: 'hidden',
        }}
      >
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2}>Welcome!</Title>
          <Text type="secondary">
            This is your dashboard. Start managing your data and activities here.
          </Text>
        </div>

        <DashboardAnnouncementsSection />

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Time today"
                value={formatTime(trackerStats.todaySeconds)}
                prefix={<ClockCircleOutlined />}
                styles={{ content: { color: '#1890ff', fontSize: 18 } }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Tickets: {trackerStats.todayTickets}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Time this week"
                value={formatTime(trackerStats.weekSeconds)}
                prefix={<ClockCircleOutlined />}
                styles={{ content: { color: '#52c41a', fontSize: 18 } }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Tickets: {trackerStats.weekTickets}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Time this month"
                value={formatTime(trackerStats.monthSeconds)}
                prefix={<ClockCircleOutlined />}
                styles={{ content: { color: '#722ed1', fontSize: 18 } }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>Tickets: {trackerStats.monthTickets}</Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Teams"
                value={stats.totalTeams}
                prefix={<FolderOutlined />}
                styles={{ content: { color: '#fa8c16' } }}
              />
            </Card>
          </Col>
        </Row>

        <DashboardHourlyActivityCard
          stoppedSessions={allSessionsForStats}
          activeSessions={activeTrackers.map((t) => ({
            ticket_id: t.ticket_id,
            start_time: t.start_time,
          }))}
        />

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Active timers</span>
                  {activeTrackers.length > 0 ? (
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                      ({activeTrackers.length} running)
                    </Text>
                  ) : null}
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              {activeTrackers.length > 0 ? (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  {activeTrackers.map((row, idx) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        paddingBottom: idx < activeTrackers.length - 1 ? 12 : 0,
                        borderBottom:
                          idx < activeTrackers.length - 1 ? '1px solid #f0f0f0' : undefined,
                      }}
                    >
                      <div>
                        <Text type="secondary">Ticket:</Text>
                        <br />
                        <Text
                          strong
                          style={{ cursor: 'pointer', color: '#1890ff' }}
                          onClick={() => router.push(`/tickets/${row.ticket_id}`)}
                        >
                          {row.ticket ? `#${row.ticket_id} ${row.ticket.title}` : `#${row.ticket_id}`}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div style={{marginRight: '50px'}}>
                        <Text type="secondary">Elapsed:</Text>
                        <br />
                        <Text strong style={{ fontSize: 18 }}>
                          {formatTime(elapsedBySessionId[row.id] ?? 0)}
                        </Text>
                      </div>
                      <Button
                        type="primary"
                        danger
                        icon={<StopOutlined />}
                        onClick={() => handleStopTracker(row)}
                        loading={stoppingId === row.id}
                      >
                        Stop
                      </Button>
                      <Button
                        type="default"
                        onClick={() => router.push(`/tickets/${row.ticket_id}`)}
                      >
                        Open Ticket
                      </Button>
                      </div>
                    </div>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">No active time tracker. Start one from a ticket detail page.</Text>
              )}
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Recent Activities</span>
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                    (Last {RECENT_TRACKERS_LIMIT} trackers
                    {lastTrackers.length > 0 ? ` · ${lastTrackers.length} shown` : ''})
                  </Text>
                </Space>
              }
              style={{ height: '100%' }}
              loading={loadingTrackers}
            >
              {lastTrackers.length > 0 ? (
                <List
                  size="small"
                  dataSource={lastTrackers}
                  renderItem={(item) => (
                    <List.Item
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/tickets/${item.ticket_id}`)}
                    >
                      <List.Item.Meta
                        avatar={<UserOutlined style={{ color: '#8c8c8c' }} />}
                        title={
                          <Space>
                            <Link
                              href={`/tickets/${item.ticket_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#1890ff', fontWeight: 600 }}
                            >
                              {item.ticket ? `#${item.ticket_id} ${item.ticket.title}` : `#${item.ticket_id}`}
                            </Link>
                            {!item.stop_time && (
                              <Text type="secondary" style={{ fontSize: 11 }}>(running)</Text>
                            )}
                          </Space>
                        }
                        description={
                          <Space size="small" split={<Text type="secondary">•</Text>}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {new Date(item.start_time).toLocaleString()}
                            </Text>
                            <Text style={{ fontSize: 12 }}>
                              {item.stop_time != null && item.duration_seconds != null
                                ? formatTime(item.duration_seconds)
                                : item.stop_time == null
                                  ? formatTime(
                                      Math.floor(
                                        (Date.now() - new Date(item.start_time).getTime()) / 1000
                                      )
                                    )
                                  : '—'}
                            </Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No time tracker sessions yet. Start tracking from a ticket detail page."
                />
              )}
            </Card>
          </Col>
       
          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <ClockCircleOutlined />
                  <span>Time tracked - Last 7 days (hours)</span>
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              <StaffDashboardCharts chartData={chartData} />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            
            <Card title="Account Information" style={{ height: '100%' }}>
              <Space orientation="vertical" style={{ width: '100%' }}>
                <div>
                  <Text type="secondary">Email:</Text>
                  <br />
                  <Text strong>{user.email}</Text>
                </div>
                <div>
                  <Text type="secondary">User ID:</Text>
                  <br />
                  <Text code style={{ fontSize: 12 }}>
                    {user.id}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">Name:</Text>
                  <br />
                  <Text>{user.name || user.email || '—'}</Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

