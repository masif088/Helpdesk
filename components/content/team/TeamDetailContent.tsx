'use client'

import { BarChartOutlined, ClockCircleOutlined, EditOutlined, InfoCircleOutlined, PlusOutlined, TeamOutlined, UserDeleteOutlined, UserOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Col, DatePicker, Empty, Flex, Form, Input, Layout, List, message, Modal, Row, Segmented, Select, Space, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import BackLink from '@/components/common/BackLink'
import DateDisplay from '@/components/common/DateDisplay'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { canAdminTeams } from '@/lib/auth-utils'
import { formatTeamVisibilityLabel, parseTeamVisibility, TEAM_VISIBILITY_OPTIONS } from '@/lib/team-type'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker

type ReportPeriod = 'week' | 'month' | 'custom'

/** How the report table aggregates rows */
type ReportGroupBy = 'session' | 'day' | 'person'

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: string
  joined_at: string
  user_name?: string
  user_email?: string
  user_avatar_url?: string | null
}

interface TeamData {
  id: string
  name: string
  type: string | null
  created_by: string
  created_at: string
  creator_name?: string
  members: TeamMember[]
}

interface ReportRow {
  id: string
  user_id: string
  user_name: string
  user_email?: string
  ticket_id: number
  ticket_title?: string
  start_time: string
  stop_time: string | null
  duration_seconds: number | null
  duration_adjustment?: number | null
  reported_duration_seconds?: number | null
}

function reportedSessionSeconds(s: ReportRow): number {
  if (s.reported_duration_seconds != null && Number.isFinite(s.reported_duration_seconds)) {
    return s.reported_duration_seconds
  }
  return s.duration_seconds ?? 0
}

interface TeamDetailContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  team: TeamData
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface UserOption {
  id: string
  full_name: string | null
  email: string | null
  avatar_url?: string | null
}

export default function TeamDetailContent({ user: currentUser, team }: TeamDetailContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>(team.members)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [reportSessions, setReportSessions] = useState<ReportRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addUserId, setAddUserId] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<string>('member')
  const [addLoading, setAddLoading] = useState(false)
  const [usersList, setUsersList] = useState<UserOption[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState(team.name)
  const [teamType, setTeamType] = useState<string | null>(team.type)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editForm] = Form.useForm()
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [newCreatorUserId, setNewCreatorUserId] = useState<string | null>(null)
  const [transferLoading, setTransferLoading] = useState(false)
  const [reportMemberUserId, setReportMemberUserId] = useState<string | null>(null)
  const [reportGroupBy, setReportGroupBy] = useState<ReportGroupBy>('session')

  const memberUserIds = useMemo(() => members.map((m) => m.user_id), [members])
  const isCreator = currentUser.id === team.created_by
  const isAdmin = canAdminTeams(currentUser.role)
  const canManageMembers = isAdmin || isCreator

  // Sync display when team prop changes
  useEffect(() => {
    setTeamName(team.name)
    setTeamType(team.type)
  }, [team.id, team.name, team.type])

  // Sync members when team prop changes (e.g. navigation)
  useEffect(() => {
    setMembers(team.members)
  }, [team.id, team.members.length])

  useEffect(() => {
    if (reportMemberUserId && !memberUserIds.includes(reportMemberUserId)) {
      setReportMemberUserId(null)
    }
  }, [memberUserIds, reportMemberUserId])

  const fetchUsers = async () => {
    setUsersLoading(true)
    try {
      const data = await apiFetch<Array<{ id: string; full_name: string | null; email: string; avatar_url?: string | null; role?: string }>>('/api/users')
      const teamEligible = data.filter((u) => {
        const r = (u.role ?? '').toLowerCase()
        return r !== 'customer' && r !== 'guest'
      })
      setUsersList(teamEligible.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, avatar_url: u.avatar_url })))
    } catch {
      message.error('Failed to load users')
      setUsersList([])
    } finally {
      setUsersLoading(false)
    }
  }

  const openAddModal = () => {
    setAddUserId(null)
    setAddRole('member')
    setAddModalOpen(true)
    fetchUsers()
  }

  const handleAddMember = async () => {
    if (!addUserId) {
      message.warning('Please select a user')
      return
    }
    setAddLoading(true)
    try {
      const { members: newMembers } = await apiFetch<{ members: TeamMember[]; added: number }>(
        `/api/teams/${team.id}/members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: [addUserId], role: addRole }),
        }
      )
      const added = newMembers.find((m) => m.user_id === addUserId)
      if (added) {
        setMembers((prev) => [...prev, added])
      }
      message.success('Member added')
      setAddModalOpen(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message || 'Failed to add member')
    } finally {
      setAddLoading(false)
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    if (member.user_id === team.created_by) {
      message.warning('Cannot remove the team creator')
      return
    }
    if (!confirm(`Remove ${member.user_name} from this team?`)) return
    setRemoveLoadingId(member.id)
    try {
      await apiFetch(`/api/teams/${team.id}/members/${member.id}`, { method: 'DELETE' })
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      message.success('Member removed')
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message || 'Failed to remove member')
    } finally {
      setRemoveLoadingId(null)
    }
  }

  const openEditModal = () => {
    editForm.setFieldsValue({
      name: teamName,
      type: parseTeamVisibility(teamType) ?? undefined,
    })
    setEditModalOpen(true)
  }

  const handleSaveTeam = async () => {
    try {
      const values = await editForm.validateFields()
      const name = (values.name ?? '').trim()
      if (!name) {
        message.warning('Name is required')
        return
      }
      setEditLoading(true)
      await apiFetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: values.type }),
      })
      setTeamName(name)
      setTeamType(values.type)
      message.success('Team updated')
      setEditModalOpen(false)
      router.refresh()
    } catch (e: unknown) {
      const err = e as Error & { message?: string }
      if (err?.message && !err.message.includes('validateFields')) {
        message.error(err.message || 'Failed to update team')
      }
    } finally {
      setEditLoading(false)
    }
  }

  const handleTransferCreator = async () => {
    if (!newCreatorUserId) {
      message.warning('Select a team member to be the new creator')
      return
    }
    setTransferLoading(true)
    try {
      await apiFetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ created_by: newCreatorUserId }),
      })
      message.success('Creator updated')
      setTransferModalOpen(false)
      router.refresh()
    } catch (e: unknown) {
      const err = e as { message?: string }
      message.error(err?.message || 'Failed to transfer creator')
    } finally {
      setTransferLoading(false)
    }
  }

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = dayjs()
    if (reportPeriod === 'week') {
      return {
        rangeStart: now.subtract(7, 'day').startOf('day'),
        rangeEnd: now.endOf('day'),
      }
    }
    if (reportPeriod === 'month') {
      return {
        rangeStart: now.subtract(30, 'day').startOf('day'),
        rangeEnd: now.endOf('day'),
      }
    }
    if (reportPeriod === 'custom' && customRange?.[0] && customRange?.[1]) {
      return {
        rangeStart: customRange[0].startOf('day'),
        rangeEnd: customRange[1].endOf('day'),
      }
    }
    return { rangeStart: null, rangeEnd: null }
  }, [reportPeriod, customRange])

  const fetchReport = async () => {
    if (memberUserIds.length === 0 || !rangeStart || !rangeEnd) {
      setReportSessions([])
      return
    }
    setReportLoading(true)
    try {
      const startIso = rangeStart.toISOString()
      const endIso = rangeEnd.toISOString()
      let url = `/api/teams/${team.id}/time-report?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
      if (reportMemberUserId) {
        url += `&userId=${encodeURIComponent(reportMemberUserId)}`
      }
      const rows = await apiFetch<ReportRow[]>(url)
      setReportSessions(rows)
    } catch {
      setReportSessions([])
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    if (rangeStart && rangeEnd) fetchReport()
    else if (!rangeStart && !rangeEnd && memberUserIds.length > 0) setReportSessions([])
  }, [
    reportPeriod,
    customRange,
    memberUserIds.length,
    rangeStart?.toISOString(),
    rangeEnd?.toISOString(),
    reportMemberUserId,
    team.id,
  ])

  const reportSessionColumns: ColumnsType<ReportRow> = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <div>
            <div>{r.user_name}</div>
            {r.user_email && <Text type="secondary" style={{ fontSize: 12 }}>{r.user_email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Ticket',
      key: 'ticket',
      render: (_, r) => (
        <Link href={`/tickets/${r.ticket_id}`} target="_blank">
          <Space>
            <Text strong>#{r.ticket_id}</Text>
            {r.ticket_title ? r.ticket_title : '-'}
          </Space>
        </Link>
      ),
    },
    {
      title: 'Duration (reported)',
      key: 'duration',
      render: (_, r) => {
        const rep = reportedSessionSeconds(r)
        const tr = r.duration_seconds ?? 0
        const diff = tr !== rep
        return (
          <Space orientation="vertical" size={0}>
            <Text>{formatDuration(rep)}</Text>
            {diff ? (
              <Text type="secondary" style={{ fontSize: 11 }}>
                Tracked {formatDuration(tr)}
              </Text>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: 'Start',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (d: string) => <DateDisplay date={d} format="detailed" />,
    },
    {
      title: 'Stop',
      dataIndex: 'stop_time',
      key: 'stop_time',
      render: (d: string | null) => (d ? <DateDisplay date={d} format="detailed" /> : '-'),
    },
  ]

  interface ReportDayGroupRow {
    dateKey: string
    totalSeconds: number
    sessionCount: number
    ticketCount: number
    peopleLabel: string
  }

  interface ReportPersonGroupRow {
    user_id: string
    user_name: string
    user_email?: string
    totalSeconds: number
    sessionCount: number
    ticketCount: number
  }

  const reportByDay = useMemo((): ReportDayGroupRow[] => {
    const map = new Map<
      string,
      { totalSeconds: number; sessionCount: number; tickets: Set<number>; names: Set<string> }
    >()
    for (const s of reportSessions) {
      const dateKey = dayjs(s.start_time).format('YYYY-MM-DD')
      const sec = reportedSessionSeconds(s)
      let g = map.get(dateKey)
      if (!g) {
        g = { totalSeconds: 0, sessionCount: 0, tickets: new Set(), names: new Set() }
        map.set(dateKey, g)
      }
      g.totalSeconds += sec
      g.sessionCount += 1
      g.tickets.add(s.ticket_id)
      g.names.add(s.user_name || s.user_id)
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a > b ? -1 : 1))
      .map(([dateKey, g]) => ({
        dateKey,
        totalSeconds: g.totalSeconds,
        sessionCount: g.sessionCount,
        ticketCount: g.tickets.size,
        peopleLabel: [...g.names].sort().join(', '),
      }))
  }, [reportSessions])

  const reportByPerson = useMemo((): ReportPersonGroupRow[] => {
    const map = new Map<
      string,
      { user_name: string; user_email?: string; totalSeconds: number; sessionCount: number; tickets: Set<number> }
    >()
    for (const s of reportSessions) {
      const uid = s.user_id
      let g = map.get(uid)
      if (!g) {
        g = {
          user_name: s.user_name,
          user_email: s.user_email,
          totalSeconds: 0,
          sessionCount: 0,
          tickets: new Set(),
        }
        map.set(uid, g)
      }
      g.totalSeconds += reportedSessionSeconds(s)
      g.sessionCount += 1
      g.tickets.add(s.ticket_id)
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b.totalSeconds - a.totalSeconds)
      .map(([user_id, g]) => ({
        user_id,
        user_name: g.user_name,
        user_email: g.user_email,
        totalSeconds: g.totalSeconds,
        sessionCount: g.sessionCount,
        ticketCount: g.tickets.size,
      }))
  }, [reportSessions])

  const reportDayColumns: ColumnsType<ReportDayGroupRow> = [
    {
      title: 'Date',
      dataIndex: 'dateKey',
      key: 'date',
      render: (_, r) => dayjs(r.dateKey).format('MMM D, YYYY'),
    },
    {
      title: 'Total time',
      key: 'total',
      render: (_, r) => formatDuration(r.totalSeconds),
    },
    {
      title: 'Sessions',
      dataIndex: 'sessionCount',
      key: 'sessions',
    },
    {
      title: 'Tickets',
      dataIndex: 'ticketCount',
      key: 'tickets',
    },
    {
      title: 'People',
      dataIndex: 'peopleLabel',
      key: 'people',
      ellipsis: true,
    },
  ]

  const reportPersonColumns: ColumnsType<ReportPersonGroupRow> = [
    {
      title: 'User',
      key: 'user',
      render: (_, r) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <div>
            <div>{r.user_name}</div>
            {r.user_email && <Text type="secondary" style={{ fontSize: 12 }}>{r.user_email}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: 'Total time',
      key: 'total',
      render: (_, r) => formatDuration(r.totalSeconds),
    },
    {
      title: 'Sessions',
      dataIndex: 'sessionCount',
      key: 'sessions',
    },
    {
      title: 'Tickets',
      dataIndex: 'ticketCount',
      key: 'tickets',
    },
  ]

  const summaryByUser = useMemo(() => {
    const map: Record<string, { name: string; seconds: number; tickets: Set<number> }> = {}
    reportSessions.forEach((s) => {
      if (!map[s.user_id]) {
        map[s.user_id] = { name: s.user_name, seconds: 0, tickets: new Set() }
      }
      map[s.user_id].seconds += reportedSessionSeconds(s)
      map[s.user_id].tickets.add(s.ticket_id)
    })
    return Object.entries(map).map(([userId, v]) => ({
      user_id: userId,
      name: v.name,
      totalSeconds: v.seconds,
      ticketCount: v.tickets.size,
    }))
  }, [reportSessions])

  const totalSeconds = reportSessions.reduce((sum, s) => sum + reportedSessionSeconds(s), 0)

  const tabItems = [
  {
    key: 'info',
    label: (
      <span>
        <InfoCircleOutlined /> Info
      </span>
    ),
    children: (
      <Card>
        <Title level={5} style={{ marginTop: 0 }}>Team Information</Title>
        <Row gutter={[16, 12]}>
          <Col span={24}>
            <Text type="secondary">Name</Text>
            <div><Text strong>{teamName}</Text></div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Type</Text>
            <div>
              {(() => {
                const label = formatTeamVisibilityLabel(teamType)
                if (label === '—') return <span>-</span>
                const slug = parseTeamVisibility(teamType)
                return slug ? (
                  <Tag color={slug === 'private' ? 'purple' : 'blue'}>{label}</Tag>
                ) : (
                  <Tag>{label}</Tag>
                )
              })()}
            </div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Created by</Text>
            <div>{team.creator_name}</div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Created at</Text>
            <div><DateDisplay date={team.created_at} format="detailed" /></div>
          </Col>
          <Col span={24}>
            <Text type="secondary">Member count</Text>
            <div>{members.length} members</div>
          </Col>
        </Row>
      </Card>
    ),
  },
  {
    key: 'members',
    label: (
      <span>
        <TeamOutlined /> Team Members ({members.length})
      </span>
    ),
    children: (
      <Card
        title="Members"
        extra={
          canManageMembers ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
              Add member
            </Button>
          ) : null
        }
      >
        {members.length === 0 ? (
          <Empty description="No members yet">
            {canManageMembers && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
                Add member
              </Button>
            )}
          </Empty>
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={members}
            renderItem={(m) => (
              <List.Item
                actions={
                  canManageMembers && m.user_id !== team.created_by
                    ? [
                        <Button
                          key="remove"
                          type="text"
                          danger
                          size="small"
                          icon={<UserDeleteOutlined />}
                          loading={removeLoadingId === m.id}
                          onClick={() => handleRemoveMember(m)}
                        >
                          Remove
                        </Button>,
                      ]
                    : undefined
                }
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} src={m.user_avatar_url} />}
                  title={
                    <Space>
                      {m.user_name}
                      {m.user_id === team.created_by && (
                        <Tag color="blue">Creator</Tag>
                      )}
                      {m.user_id !== team.created_by && <Tag>{m.role}</Tag>}
                    </Space>
                  }
                  description={m.user_email}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    ),
  },
  {
    key: 'report',
    label: (
      <span>
        <BarChartOutlined /> Report
      </span>
    ),
    children: (
      <Card>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Row gutter={16} align="middle">
            <Col>
              <Segmented
                value={reportPeriod}
                onChange={(v) => setReportPeriod(v as ReportPeriod)}
                options={[
                  { label: 'This week', value: 'week' },
                  { label: 'This month', value: 'month' },
                  { label: 'Custom', value: 'custom' },
                ]}
              />
            </Col>
            <Col>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                Member
              </Text>
              <Select
                allowClear
                placeholder="All members"
                style={{ minWidth: 220 }}
                value={reportMemberUserId ?? undefined}
                onChange={(v) => setReportMemberUserId(v ?? null)}
                options={members.map((m) => ({
                  value: m.user_id,
                  label: m.user_name || m.user_email || m.user_id,
                }))}
              />
            </Col>
            <Col>
              <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                Group by
              </Text>
              <Segmented
                value={reportGroupBy}
                onChange={(v) => setReportGroupBy(v as ReportGroupBy)}
                options={[
                  { label: 'Sessions', value: 'session' },
                  { label: 'Per day', value: 'day' },
                  { label: 'Per person', value: 'person' },
                ]}
              />
            </Col>
            {reportPeriod === 'custom' && (
              <Col>
                <RangePicker
                  value={customRange}
                  onChange={(dates) => setCustomRange(dates as [Dayjs, Dayjs] | null)}
                />
                {!customRange && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    Select date range to view report
                  </Text>
                )}
              </Col>
            )}
          </Row>

          {rangeStart && rangeEnd && (
            <Row gutter={24}>
              <Col>
                <Statistic
                  title="Total time"
                  value={Math.round(totalSeconds / 60)}
                  suffix="min"
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col>
                <Statistic title="Sessions" value={reportSessions.length} />
              </Col>
            </Row>
          )}

          {summaryByUser.length > 0 && reportGroupBy !== 'person' && (
            <div>
              <Text strong>Summary by user</Text>
              <Row gutter={16} style={{ marginTop: 8 }}>
                {summaryByUser.map((u) => (
                  <Col key={u.user_id} span={8}>
                    <Card size="small">
                      <Statistic
                        title={u.name}
                        value={Math.round(u.totalSeconds / 60)}
                        suffix="min"
                      />
                      <Text type="secondary">{u.ticketCount} ticket</Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          )}

          <Spin spinning={reportLoading}>
            {reportGroupBy === 'session' && (
              <Table
                size="small"
                columns={reportSessionColumns}
                dataSource={reportSessions}
                rowKey="id"
                pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('sessions') }}
                locale={{ emptyText: 'No time tracker data for this period' }}
              />
            )}
            {reportGroupBy === 'day' && (
              <Table
                size="small"
                columns={reportDayColumns}
                dataSource={reportByDay}
                rowKey="dateKey"
                pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('days') }}
                locale={{ emptyText: 'No time tracker data for this period' }}
              />
            )}
            {reportGroupBy === 'person' && (
              <Table
                size="small"
                columns={reportPersonColumns}
                dataSource={reportByPerson}
                rowKey="user_id"
                pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('people') }}
                locale={{ emptyText: 'No time tracker data for this period' }}
              />
            )}
          </Spin>
        </Space>
      </Card>
    ),
  },
]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
              <BackLink href="/settings/teams">Teams</BackLink>
              {isAdmin && (
                <Space>
                  <Button type="default" icon={<EditOutlined />} onClick={openEditModal}>
                    Edit team
                  </Button>
                  <Button
                    type="default"
                    icon={<UserSwitchOutlined />}
                    onClick={() => {
                      setNewCreatorUserId(null)
                      setTransferModalOpen(true)
                    }}
                  >
                    Transfer creator
                  </Button>
                </Space>
              )}
            </Flex>
            <Title level={3} style={{ marginTop: 0 }}>
              {teamName}
            </Title>
            {(() => {
              const label = formatTeamVisibilityLabel(teamType)
              if (label === '—') return null
              const slug = parseTeamVisibility(teamType)
              return slug ? (
                <Tag color={slug === 'private' ? 'purple' : 'blue'}>{label}</Tag>
              ) : (
                <Tag>{label}</Tag>
              )
            })()}
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              <Text type="secondary">
                Created by {team.creator_name} · <DateDisplay date={team.created_at} />
              </Text>
            </div>
            <Tabs defaultActiveKey="info" items={tabItems} />
            <Modal
              title="Edit team"
              open={editModalOpen}
              onOk={handleSaveTeam}
              onCancel={() => setEditModalOpen(false)}
              confirmLoading={editLoading}
              okText="Save"
            >
              <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item name="name" label="Team name" rules={[{ required: true, message: 'Name is required' }]}>
                  <Input placeholder="Team name" />
                </Form.Item>
                <Form.Item
                  name="type"
                  label="Type"
                  rules={[{ required: true, message: 'Choose Public or Private' }]}
                >
                  <Select
                    placeholder="Select visibility"
                    options={[...TEAM_VISIBILITY_OPTIONS]}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Form>
            </Modal>
            <Modal
              title="Transfer team creator"
              open={transferModalOpen}
              onOk={handleTransferCreator}
              onCancel={() => setTransferModalOpen(false)}
              confirmLoading={transferLoading}
              okText="Transfer"
            >
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                Choose an existing member. Only admins can change the team creator.
              </Text>
              <Select
                style={{ width: '100%' }}
                placeholder="Select member"
                value={newCreatorUserId ?? undefined}
                onChange={(v) => setNewCreatorUserId(v)}
                options={members
                  .filter((m) => m.user_id !== team.created_by)
                  .map((m) => ({
                    value: m.user_id,
                    label: m.user_name || m.user_email || m.user_id,
                  }))}
              />
            </Modal>
            <Modal
              title="Add team member"
              open={addModalOpen}
              onOk={handleAddMember}
              onCancel={() => setAddModalOpen(false)}
              confirmLoading={addLoading}
              okText="Add"
            >
              <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>User</Text>
                  <Select
                    placeholder="Select user"
                    style={{ width: '100%' }}
                    value={addUserId}
                    onChange={setAddUserId}
                    loading={usersLoading}
                    showSearch
                    optionFilterProp="label"
                    options={usersList
                      .filter((u) => !memberUserIds.includes(u.id))
                      .map((u) => ({
                        value: u.id,
                        label: `${u.full_name || u.email || 'Unknown'}${u.email ? ` (${u.email})` : ''}`,
                      }))}
                    notFoundContent={usersLoading ? 'Loading...' : 'No users to add or all users are already members'}
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Role</Text>
                  <Select
                    style={{ width: '100%' }}
                    value={addRole}
                    onChange={setAddRole}
                    options={[
                      { value: 'member', label: 'Member' },
                      { value: 'manager', label: 'Manager' },
                    ]}
                  />
                </div>
              </Space>
            </Modal>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
