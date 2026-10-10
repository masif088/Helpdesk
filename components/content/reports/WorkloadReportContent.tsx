'use client'

import { AlertOutlined, FieldTimeOutlined, InboxOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Avatar, Layout, Segmented, Table, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { AgentWorkload, WorkloadSnapshot } from '@/lib/agent-workload'

const { Content } = Layout
const { Title, Text } = Typography

type Agent = Omit<AgentWorkload, 'teamIds'> & { teams: string[] }
type Data = Omit<WorkloadSnapshot, 'agents'> & { agents: Agent[] }
type GroupBy = 'agent' | 'skill' | 'team'

type Group = { key: string; label: string; agents: Agent[]; open: number; active: number; overdue: number; waitingOnClient: number; trackedWeekSeconds: number }

const NO_SKILL = 'No skills set'
const NO_TEAM = 'No team'

function fmtHours(seconds: number): string {
  if (!seconds) return '0h'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`
  const h = seconds / 3600
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}

function Kpi({ icon, tone, label, children, hint }: { icon: ReactNode; tone: string; label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className={`billing-kpi billing-kpi--${tone}`}>
      <span className="billing-kpi__icon">{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div className="billing-kpi__label">{label}</div>
        <div className="billing-kpi__value">{children}</div>
        {hint ? <div className="billing-kpi__hint">{hint}</div> : null}
      </div>
    </div>
  )
}

/** A bar for "active" next to the number, scaled to the busiest agent */
function LoadBar({ value, max }: { value: number; max: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
      <span style={{ width: 70, height: 6, borderRadius: 999, background: 'var(--kanban-card-border)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${max ? Math.max(4, (value / max) * 100) : 0}%`, borderRadius: 999, background: 'var(--brand-primary)' }} />
      </span>
      <span className="cell-strong" style={{ minWidth: 20, textAlign: 'right' }}>{value}</span>
    </span>
  )
}

function group(agents: Agent[], by: Exclude<GroupBy, 'agent'>): Group[] {
  const map = new Map<string, Agent[]>()
  for (const a of agents) {
    const keys = by === 'skill' ? (a.skills.length ? a.skills : [NO_SKILL]) : a.teams.length ? a.teams : [NO_TEAM]
    // One person can sit in several groups (several skills / teams)
    for (const k of keys) map.set(k, [...(map.get(k) ?? []), a])
  }
  return [...map.entries()]
    .map(([label, list]) => ({
      key: label,
      label,
      agents: list,
      open: list.reduce((n, a) => n + a.open, 0),
      active: list.reduce((n, a) => n + a.active, 0),
      overdue: list.reduce((n, a) => n + a.overdue, 0),
      waitingOnClient: list.reduce((n, a) => n + a.waitingOnClient, 0),
      trackedWeekSeconds: list.reduce((n, a) => n + a.trackedWeekSeconds, 0),
    }))
    .sort((a, b) => (a.label === NO_SKILL || a.label === NO_TEAM ? 1 : b.label === NO_SKILL || b.label === NO_TEAM ? -1 : b.active - a.active || a.label.localeCompare(b.label)))
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** Reports → Workload (admin / manager): who has what on their plate, by agent, skill or team. */
export default function WorkloadReportContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [by, setBy] = useState<GroupBy>('agent')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/workload', { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the workload')
      setData(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => (data && by !== 'agent' ? group(data.agents, by) : []), [data, by])
  const maxActive = Math.max(1, ...(data?.agents ?? []).map((a) => a.active))
  const maxGroupActive = Math.max(1, ...groups.map((g) => g.active))
  const busiest = data?.agents.find((a) => a.active > 0)
  const withoutSkills = data?.agents.filter((a) => a.skills.length === 0).length ?? 0

  const skillTags = (skills: string[]) =>
    skills.length ? (
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
        {skills.map((s) => (
          <Tag key={s} style={{ marginInlineEnd: 0 }}>
            {s}
          </Tag>
        ))}
      </span>
    ) : (
      <span className="cell-muted">—</span>
    )

  const agentColumns = (showSkills: boolean) => [
    {
      title: 'Agent',
      key: 'name',
      render: (_: unknown, a: Agent) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={26} src={a.avatarUrl ?? undefined}>
            {a.name.charAt(0).toUpperCase()}
          </Avatar>
          <SpaNavLink href={`/settings/users/${a.userId}`} className="ticket-table__title">
            {a.name}
          </SpaNavLink>
        </span>
      ),
    },
    ...(showSkills ? [{ title: 'Skills', key: 'skills', render: (_: unknown, a: Agent) => skillTags(a.skills) }] : []),
    {
      title: 'Active',
      dataIndex: 'active',
      key: 'active',
      width: 170,
      align: 'right' as const,
      sorter: (a: Agent, b: Agent) => a.active - b.active,
      render: (v: number) => <LoadBar value={v} max={maxActive} />,
    },
    { title: 'Waiting on client', dataIndex: 'waitingOnClient', key: 'waiting', width: 150, align: 'right' as const, render: (v: number) => (v ? v : <span className="cell-muted">0</span>) },
    {
      title: 'Overdue',
      dataIndex: 'overdue',
      key: 'overdue',
      width: 100,
      align: 'right' as const,
      sorter: (a: Agent, b: Agent) => a.overdue - b.overdue,
      render: (v: number) => (v ? <span style={{ color: '#DC2626', fontWeight: 600 }}>{v}</span> : <span className="cell-muted">0</span>),
    },
    { title: 'Today', dataIndex: 'trackedTodaySeconds', key: 'today', width: 90, align: 'right' as const, render: (s: number) => <span className="cell-muted">{fmtHours(s)}</span> },
    {
      title: 'This week',
      dataIndex: 'trackedWeekSeconds',
      key: 'week',
      width: 110,
      align: 'right' as const,
      sorter: (a: Agent, b: Agent) => a.trackedWeekSeconds - b.trackedWeekSeconds,
      render: (s: number) => <span className="cell-strong">{fmtHours(s)}</span>,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Workload
              </Title>
              <Text className="page-head__sub">Who has what on their plate right now, and the time tracked this week. Group by skill or team to see where the load sits.</Text>
            </div>
            <div className="page-head__actions">
              <Segmented<GroupBy>
                value={by}
                onChange={setBy}
                options={[
                  { value: 'agent', label: 'By agent' },
                  { value: 'skill', label: 'By skill' },
                  { value: 'team', label: 'By team' },
                ]}
              />
            </div>
          </div>

          <div className="billing-kpis">
            <Kpi icon={<InboxOutlined />} tone="teal" label="Open tickets" hint={`${data?.unassigned ?? 0} not assigned to anyone`}>
              {data?.openTotal ?? 0}
            </Kpi>
            <Kpi icon={<AlertOutlined />} tone={data?.overdueTotal ? 'amber' : 'slate'} label="Overdue" hint="Open and past their due date">
              {data?.overdueTotal ?? 0}
            </Kpi>
            <Kpi icon={<TeamOutlined />} tone="slate" label="Busiest agent" hint={busiest ? `${busiest.active} active · ${busiest.overdue} overdue` : 'Nobody has active tickets'}>
              <span style={{ fontSize: 20 }}>{busiest?.name ?? '—'}</span>
            </Kpi>
            <Kpi icon={<FieldTimeOutlined />} tone="green" label="Tracked this week" hint="All agents, since Monday">
              {fmtHours((data?.agents ?? []).reduce((n, a) => n + a.trackedWeekSeconds, 0))}
            </Kpi>
          </div>

          {data && withoutSkills > 0 && by === 'skill' ? (
            <div className="billing-note">
              <TeamOutlined /> {withoutSkills} agent{withoutSkills > 1 ? 's have' : ' has'} no skills yet. Set them on the user page (Settings → Users) so they are grouped and suggested for matching tickets.
            </div>
          ) : null}

          <div className="ticket-surface ticket-table">
            {by === 'agent' ? (
              <Table<Agent>
                rowKey="userId"
                loading={loading}
                dataSource={data?.agents ?? []}
                pagination={false}
                scroll={{ x: 860 }}
                locale={{ emptyText: 'No agents' }}
                columns={agentColumns(true)}
              />
            ) : (
              <Table<Group>
                rowKey="key"
                loading={loading}
                dataSource={groups}
                pagination={false}
                scroll={{ x: 760 }}
                locale={{ emptyText: by === 'skill' ? 'No skills set on any agent yet' : 'No teams' }}
                expandable={{
                  defaultExpandAllRows: true,
                  expandedRowRender: (g) => (
                    <Table<Agent> rowKey="userId" size="small" dataSource={g.agents} pagination={false} columns={agentColumns(by === 'team')} showHeader={false} />
                  ),
                }}
                columns={[
                  {
                    title: by === 'skill' ? 'Skill' : 'Team',
                    key: 'label',
                    render: (_, g) => (g.label === NO_SKILL || g.label === NO_TEAM ? <span className="cell-muted">{g.label}</span> : <Tag style={{ marginInlineEnd: 0, fontWeight: 600 }}>{g.label}</Tag>),
                  },
                  { title: 'Agents', key: 'agents', width: 90, align: 'right', render: (_, g) => g.agents.length },
                  { title: 'Active', dataIndex: 'active', key: 'active', width: 170, align: 'right', render: (v: number) => <LoadBar value={v} max={maxGroupActive} /> },
                  { title: 'Waiting on client', dataIndex: 'waitingOnClient', key: 'waiting', width: 150, align: 'right', render: (v: number) => (v ? v : <span className="cell-muted">0</span>) },
                  { title: 'Overdue', dataIndex: 'overdue', key: 'overdue', width: 100, align: 'right', render: (v: number) => (v ? <span style={{ color: '#DC2626', fontWeight: 600 }}>{v}</span> : <span className="cell-muted">0</span>) },
                  { title: 'This week', dataIndex: 'trackedWeekSeconds', key: 'week', width: 110, align: 'right', render: (s: number) => <span className="cell-strong">{fmtHours(s)}</span> },
                ]}
              />
            )}
          </div>

          <Text className="page-head__sub" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
            Active = open tickets assigned to the agent that are not waiting on the client. A person with several skills (or teams) shows under each, so group totals can add up to more than the whole.
          </Text>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
