'use client'

import { ReloadOutlined } from '@ant-design/icons'
import { App, Button, DatePicker, Layout, Segmented, Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { offsetLabel, zoneOffsetMinutes } from '@/lib/app-time'

dayjs.extend(utc)
dayjs.extend(timezone)

const { Content } = Layout
const { Title, Text } = Typography

type Option = { value: string; label: string }
type Agent = {
  id: string
  name: string
  email: string
  role: string
  skills: string[]
  working: boolean
  tracked_seconds: number
  sessions: number
  first_start: string | null
  last_end: string | null
  active_timer: { ticket_id: number; title: string | null; since: string } | null
  by_day?: { day: string; seconds: number }[]
  by_hour?: { hour: string; seconds: number }[]
  tickets_worked?: { id: number; title: string; status: string; company: string | null; type: string | null; seconds: number; sessions: number }[]
  tickets_worked_count: number
  load: { open: number; active: number; waiting_on_client: number; overdue: number; due_in_period: number; matching_filters: number }
  calendar: { on_leave: boolean; leave: { title: string; start: string; end: string }[]; meetings: number; meeting_minutes: number }
}
type Report = {
  from: string
  to: string
  time_zone: string
  totals: { agents: number; working: number; tracked_seconds: number; unassigned_matching: number }
  holidays: { title: string; start: string; end: string }[]
  agents: Agent[]
}

type Preset = 'today' | 'yesterday' | 'week' | 'last7' | 'custom'

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** 7500 seconds -> "2h 05m"; under an hour "45m"; nothing "0m" */
const fmt = (s: number) => {
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** The wall clock of a moment in the app zone, as a local dayjs (what the pickers show), and back. */
const instant = (d: Dayjs, tz: string): string => dayjs.tz(d.format('YYYY-MM-DDTHH:mm:ss'), tz).toISOString()

function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, minWidth: 120 }}>
      {values.map((v, i) => (
        <Tooltip key={labels[i]} title={`${labels[i]}: ${fmt(v)}`}>
          <div style={{ flex: 1, minWidth: 4, height: `${Math.max(v ? 8 : 3, (v / max) * 100)}%`, background: v ? '#0F9D8A' : 'var(--kanban-card-border, #e5e7eb)', borderRadius: 2 }} />
        </Tooltip>
      ))}
    </div>
  )
}

/** Reports → Team activity: who worked in a period, for how long, on what, and what is on their plate. Admin and manager. */
export default function TeamActivityContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const tz = report?.time_zone ?? dayjs.tz.guess()

  const [preset, setPreset] = useState<Preset>('today')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [hours, setHours] = useState(false)
  const [userIds, setUserIds] = useState<string[]>([])
  const [agentSkills, setAgentSkills] = useState<string[]>([])
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [customerIds, setCustomerIds] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [typeIds, setTypeIds] = useState<string[]>([])
  const [onlyWorking, setOnlyWorking] = useState(false)
  const [breakdown, setBreakdown] = useState<'none' | 'day' | 'hour'>('none')

  const [choices, setChoices] = useState<{ staff: Option[]; customers: Option[]; companies: Option[]; types: Option[]; skills: Option[] }>({ staff: [], customers: [], companies: [], types: [], skills: [] })

  useEffect(() => {
    fetch('/api/tickets/lookup', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        const people = (d.users ?? []) as { id: string; full_name: string | null; email: string; role: string }[]
        const label = (u: { full_name: string | null; email: string }) => u.full_name || u.email
        setChoices((c) => ({
          ...c,
          staff: people.filter((u) => (u.role ?? '').toLowerCase() !== 'customer').map((u) => ({ value: u.id, label: label(u) })),
          customers: people.filter((u) => (u.role ?? '').toLowerCase() === 'customer').map((u) => ({ value: u.id, label: label(u) })),
          companies: (d.companies ?? []).map((x: { id: string; name: string }) => ({ value: x.id, label: x.name })),
          types: (d.ticketTypes ?? []).map((x: { id: number; title: string }) => ({ value: String(x.id), label: x.title })),
        }))
      })
      .catch(() => {})
    fetch('/api/users/skills', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { skill: string }[]) => setChoices((c) => ({ ...c, skills: (Array.isArray(d) ? d : []).map((s) => ({ value: s.skill, label: s.skill })) })))
      .catch(() => {})
  }, [])

  /** The days of a preset, in the app zone (today = no dates: the server knows what today is there) */
  const presetDays = useCallback(
    (p: Preset): [string, string] | null => {
      if (p === 'today' || p === 'custom') return null
      const today = dayjs(dayjs().tz(tz).format('YYYY-MM-DD'))
      const f = 'YYYY-MM-DD'
      if (p === 'yesterday') return [today.subtract(1, 'day').format(f), today.subtract(1, 'day').format(f)]
      if (p === 'week') return [today.subtract((today.day() + 6) % 7, 'day').format(f), today.format(f)]
      return [today.subtract(6, 'day').format(f), today.format(f)]
    },
    [tz]
  )

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (preset === 'custom' && range) {
      q.set('from', hours ? instant(range[0], tz) : range[0].format('YYYY-MM-DD'))
      q.set('to', hours ? instant(range[1], tz) : range[1].format('YYYY-MM-DD'))
    } else {
      const d = presetDays(preset)
      if (d) {
        q.set('from', d[0])
        q.set('to', d[1])
      }
    }
    const list = (name: string, v: string[]) => v.length && q.set(name, v.join(','))
    list('user_ids', userIds)
    list('agent_skills', agentSkills)
    list('company_ids', companyIds)
    list('customer_ids', customerIds)
    list('skills', skills)
    list('type_ids', typeIds)
    if (onlyWorking) q.set('only_working', '1')
    if (breakdown !== 'none') q.set('breakdown', breakdown)
    q.set('include_tickets', '1')
    return q.toString()
  }, [preset, range, hours, tz, presetDays, userIds, agentSkills, companyIds, customerIds, skills, typeIds, onlyWorking, breakdown])

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      try {
        const res = await fetch(`/api/users/activity?${query}`, { credentials: 'include', cache: 'no-store' })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Could not load')
        setReport(body)
      } catch (e) {
        message.error((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [query, message]
  )

  useEffect(() => {
    if (preset === 'custom' && !range) return
    void load()
  }, [load, preset, range])

  // Keep it fresh while it is open (running timers move)
  useEffect(() => {
    const id = window.setInterval(() => void load(true), 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const maxTracked = Math.max(1, ...(report?.agents ?? []).map((a) => a.tracked_seconds))
  const onLeave = (report?.agents ?? []).filter((a) => a.calendar.on_leave).length
  const spanDays = report ? (new Date(report.to).getTime() - new Date(report.from).getTime()) / 86_400_000 : 0
  const hourOk = spanDays <= 3

  const time = (iso: string | null) => (iso ? dayjs(iso).tz(tz).format('HH:mm') : '—')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Team activity
              </Title>
              <Text className="page-head__sub">
                Who worked, for how long, on what, and what is on their plate · times in {tz.replace(/_/g, ' ')} ({offsetLabel(zoneOffsetMinutes(tz, new Date()))})
              </Text>
            </div>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </div>

          <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 12, marginBottom: 16 }}>
            <Space wrap size={12}>
              <Segmented
                value={preset}
                onChange={(v) => setPreset(v as Preset)}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'week', label: 'This week' },
                  { value: 'last7', label: 'Last 7 days' },
                  { value: 'custom', label: 'Pick dates' },
                ]}
              />
              {preset === 'custom' ? (
                <>
                  {hours ? (
                    <DatePicker.RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} showTime={{ format: 'HH:mm', minuteStep: 15 }} format="D MMM HH:mm" allowClear />
                  ) : (
                    <DatePicker.RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} allowClear />
                  )}
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <Switch size="small" checked={hours} onChange={(v) => { setHours(v); setRange(null) }} /> Pick hours
                  </label>
                </>
              ) : null}
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <Switch size="small" checked={onlyWorking} onChange={setOnlyWorking} /> Only people who worked
              </label>
              <Segmented
                value={breakdown}
                onChange={(v) => setBreakdown(v as 'none' | 'day' | 'hour')}
                options={[
                  { value: 'none', label: 'No timeline' },
                  { value: 'day', label: 'Per day' },
                  { value: 'hour', label: 'Per hour', disabled: !hourOk },
                ]}
              />
            </Space>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="People" value={userIds} onChange={setUserIds} options={choices.staff} maxTagCount="responsive" />
              <Select mode="tags" allowClear placeholder="People with skill…" value={agentSkills} onChange={setAgentSkills} options={choices.skills} maxTagCount="responsive" />
              <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Client company" value={companyIds} onChange={setCompanyIds} options={choices.companies} maxTagCount="responsive" />
              <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Customer (person)" value={customerIds} onChange={setCustomerIds} options={choices.customers} maxTagCount="responsive" />
              <Select mode="tags" allowClear placeholder="Work that needs skill…" value={skills} onChange={setSkills} options={choices.skills} maxTagCount="responsive" />
              <Select mode="multiple" allowClear placeholder="Ticket type" value={typeIds} onChange={setTypeIds} options={choices.types} maxTagCount="responsive" />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Company, customer, skill and ticket type narrow the <b>work</b>: only time on matching tickets counts, and the open tickets are those that match.
            </Text>
          </section>

          {loading && !report ? (
            <Spin />
          ) : report ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Working', value: `${report.totals.working} of ${report.totals.agents}`, hint: 'worked in the period or timer running' },
                  { label: 'Time tracked', value: fmt(report.totals.tracked_seconds), hint: 'in the period, all shown people' },
                  { label: 'Waiting for someone', value: String(report.totals.unassigned_matching), hint: 'open tickets nobody has' },
                  { label: 'On leave', value: String(onLeave), hint: report.holidays.length ? `Holiday: ${report.holidays.map((h) => h.title).join(', ')}` : 'in the period' },
                ].map((c) => (
                  <div key={c.label} className="ticket-surface" style={{ padding: 14 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {c.label}
                    </Text>
                    <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {c.hint}
                    </Text>
                  </div>
                ))}
              </div>

              <section className="ticket-surface" style={{ padding: 0 }}>
                <Table<Agent>
                  size="middle"
                  rowKey="id"
                  loading={loading}
                  dataSource={report.agents}
                  pagination={false}
                  locale={{ emptyText: 'Nobody matches' }}
                  scroll={{ x: 'max-content' }}
                  expandable={{
                    rowExpandable: (a) => a.tickets_worked_count > 0 || !!a.by_day || !!a.by_hour || a.calendar.on_leave,
                    expandedRowRender: (a) => (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {a.by_hour ? <Bars values={a.by_hour.map((h) => h.seconds)} labels={a.by_hour.map((h) => dayjs(h.hour).format('D MMM HH:mm'))} /> : null}
                        {a.by_day ? <Bars values={a.by_day.map((d) => d.seconds)} labels={a.by_day.map((d) => dayjs(d.day).format('ddd D MMM'))} /> : null}
                        {a.calendar.leave.length ? (
                          <Text>
                            On leave: {a.calendar.leave.map((l) => `${l.title} (${l.start === l.end ? l.start : `${l.start} to ${l.end}`})`).join(', ')}
                          </Text>
                        ) : null}
                        {a.tickets_worked?.length ? (
                          <Table
                            size="small"
                            rowKey="id"
                            pagination={false}
                            dataSource={a.tickets_worked}
                            columns={[
                              { title: 'Ticket', render: (_: unknown, t: NonNullable<Agent['tickets_worked']>[number]) => <Link href={`/tickets/${t.id}`}>#{t.id} {t.title}</Link> },
                              { title: 'Company', dataIndex: 'company', render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                              { title: 'Type', dataIndex: 'type', render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                              { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                              { title: 'Time', width: 90, render: (_: unknown, t: NonNullable<Agent['tickets_worked']>[number]) => fmt(t.seconds) },
                            ]}
                          />
                        ) : null}
                      </div>
                    ),
                  }}
                  columns={[
                    {
                      title: 'Person',
                      render: (_: unknown, a) => (
                        <div>
                          <div className="cell-strong">{a.name}</div>
                          <Space size={4} wrap>
                            <Tag style={{ margin: 0 }}>{a.role}</Tag>
                            {a.skills.slice(0, 3).map((s) => (
                              <Tag key={s} color="blue" style={{ margin: 0 }}>
                                {s}
                              </Tag>
                            ))}
                          </Space>
                        </div>
                      ),
                    },
                    {
                      title: 'Now',
                      width: 220,
                      render: (_: unknown, a) =>
                        a.calendar.on_leave ? (
                          <Tag color="orange">On leave</Tag>
                        ) : a.active_timer ? (
                          <Tooltip title={`since ${time(a.active_timer.since)}`}>
                            <Link href={`/tickets/${a.active_timer.ticket_id}`}>
                              <Tag color="green" style={{ margin: 0 }}>● Working</Tag> #{a.active_timer.ticket_id}
                            </Link>
                          </Tooltip>
                        ) : a.working ? (
                          <Tag>Worked</Tag>
                        ) : (
                          <Text type="secondary">Idle</Text>
                        ),
                    },
                    {
                      title: 'Time tracked',
                      width: 200,
                      sorter: (a, b) => a.tracked_seconds - b.tracked_seconds,
                      render: (_: unknown, a) => (
                        <div>
                          <div className="cell-strong">{fmt(a.tracked_seconds)}</div>
                          <div style={{ height: 4, background: 'var(--kanban-card-border, #e5e7eb)', borderRadius: 2, marginTop: 4 }}>
                            <div style={{ width: `${(a.tracked_seconds / maxTracked) * 100}%`, height: '100%', background: '#0F9D8A', borderRadius: 2 }} />
                          </div>
                          {a.first_start ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {time(a.first_start)} to {time(a.last_end)} · {a.sessions} entr{a.sessions === 1 ? 'y' : 'ies'}
                            </Text>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      title: 'Open tickets',
                      width: 220,
                      sorter: (a, b) => a.load.open - b.load.open,
                      render: (_: unknown, a) => (
                        <Space size={4} wrap>
                          <Tooltip title="Open, assigned to them"><Tag style={{ margin: 0 }}>{a.load.open} open</Tag></Tooltip>
                          {a.load.waiting_on_client ? <Tooltip title="Waiting on the client"><Tag style={{ margin: 0 }}>{a.load.waiting_on_client} waiting</Tag></Tooltip> : null}
                          {a.load.overdue ? <Tooltip title="Past the due date"><Tag color="red" style={{ margin: 0 }}>{a.load.overdue} overdue</Tag></Tooltip> : null}
                          {a.load.due_in_period ? <Tooltip title="Due in this period"><Tag color="gold" style={{ margin: 0 }}>{a.load.due_in_period} due</Tag></Tooltip> : null}
                        </Space>
                      ),
                    },
                    {
                      title: 'Meetings',
                      width: 110,
                      render: (_: unknown, a) => (a.calendar.meetings ? <span>{a.calendar.meetings} · {fmt(a.calendar.meeting_minutes * 60)}</span> : <Text type="secondary">—</Text>),
                    },
                  ]}
                />
              </section>
            </>
          ) : null}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
