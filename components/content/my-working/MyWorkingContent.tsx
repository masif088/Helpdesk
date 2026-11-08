'use client'

import { ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Button, DatePicker, Layout, Segmented, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd'
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

const MAX_DAYS = 30

type WorkedTicket = { id: number; title: string; status: string; company: string | null; type: string | null; seconds: number; sessions: number }
type Entry = { ticket_id: number; title: string | null; status: string | null; company: string | null; start: string; end: string; seconds: number; running: boolean }
type Me = {
  name: string
  working: boolean
  tracked_seconds: number
  sessions: number
  first_start: string | null
  last_end: string | null
  active_timer: { ticket_id: number; title: string | null; since: string } | null
  by_day?: { day: string; seconds: number }[]
  by_hour?: { hour: string; seconds: number }[]
  tickets_worked?: WorkedTicket[]
  tickets_worked_count: number
  sessions_list?: Entry[]
  load: { open: number; active: number; waiting_on_client: number; overdue: number; due_in_period: number }
  calendar: { on_leave: boolean; leave: { title: string; start: string; end: string }[]; meetings: number; meeting_minutes: number }
}
type Report = { from: string; to: string; time_zone: string; breakdown: 'day' | 'hour'; holidays: { title: string; start: string; end: string }[]; me: Me | null }

type Preset = 'today' | 'yesterday' | 'week' | 'last7' | 'last30' | 'custom'

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** 7500 seconds -> "2h 05m"; under an hour "45m"; under a minute "30s" */
const fmt = (s: number) => {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.round(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** The wall clock of a moment in the app zone, as a local dayjs (what the pickers show), and back to the exact moment. */
const instant = (d: Dayjs, tz: string): string => dayjs.tz(d.format('YYYY-MM-DDTHH:mm:ss'), tz).toISOString()

function Timeline({ points }: { points: { label: string; tick: string; seconds: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.seconds))
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'stretch' }} aria-label="Time worked over the period">
      {points.map((p, i) => (
        <div key={`${p.label}-${i}`} style={{ flex: 1, minWidth: 6, display: 'grid', gap: 2 }}>
          <Tooltip title={`${p.label}: ${p.seconds ? fmt(p.seconds) : 'nothing'}`}>
            <div style={{ height: 64, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: `${Math.max(p.seconds ? 8 : 3, (p.seconds / max) * 100)}%`, background: p.seconds ? '#0F9D8A' : 'var(--kanban-card-border, #e5e7eb)', borderRadius: 2 }} />
            </div>
          </Tooltip>
          <div style={{ fontSize: 10, textAlign: 'center', height: 12, whiteSpace: 'nowrap', overflow: 'visible', color: 'var(--ant-color-text-tertiary, #888)' }}>{p.tick}</div>
        </div>
      ))}
    </div>
  )
}

/** My working: what I worked on today, this week or in any period of up to 30 days (to the minute), from my time entries. */
export default function MyWorkingContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const tz = report?.time_zone ?? dayjs.tz.guess()

  const [preset, setPreset] = useState<Preset>('today')
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)

  /** The days of a preset in the app zone (today = no dates: the server knows what today is there) */
  const presetDays = useCallback(
    (p: Preset): [string, string] | null => {
      if (p === 'today' || p === 'custom') return null
      const today = dayjs(dayjs().tz(tz).format('YYYY-MM-DD'))
      const f = 'YYYY-MM-DD'
      if (p === 'yesterday') return [today.subtract(1, 'day').format(f), today.subtract(1, 'day').format(f)]
      if (p === 'week') return [today.subtract((today.day() + 6) % 7, 'day').format(f), today.format(f)]
      if (p === 'last7') return [today.subtract(6, 'day').format(f), today.format(f)]
      return [today.subtract(MAX_DAYS - 1, 'day').format(f), today.format(f)]
    },
    [tz]
  )

  const tooLong = preset === 'custom' && !!range && range[1].diff(range[0], 'day', true) > MAX_DAYS

  const query = useMemo(() => {
    const q = new URLSearchParams()
    if (preset === 'custom' && range) {
      q.set('from', instant(range[0], tz))
      q.set('to', instant(range[1], tz))
    } else {
      const d = presetDays(preset)
      if (d) {
        q.set('from', d[0])
        q.set('to', d[1])
      }
    }
    return q.toString()
  }, [preset, range, tz, presetDays])

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      try {
        const res = await fetch(`/api/me/working?${query}`, { credentials: 'include', cache: 'no-store' })
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
    if (preset === 'custom' && (!range || tooLong)) return
    void load()
  }, [load, preset, range, tooLong])

  // Keep it fresh while it is open (a running timer moves)
  useEffect(() => {
    const id = window.setInterval(() => void load(true), 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const me = report?.me ?? null
  const clock = (iso: string | null, withDate = false) => (iso ? dayjs(iso).tz(tz).format(withDate ? 'D MMM HH:mm' : 'HH:mm') : '—')
  const sameDay = report ? dayjs(report.from).tz(tz).format('YYYY-MM-DD') === dayjs(report.to).tz(tz).format('YYYY-MM-DD') : true

  const points = useMemo(() => {
    if (!me || !report) return []
    if (me.by_hour) return me.by_hour.map((h, i) => ({ label: dayjs(h.hour).tz(tz).format('D MMM HH:mm'), tick: i % 3 === 0 ? dayjs(h.hour).tz(tz).format('HH') : '', seconds: h.seconds }))
    const days = me.by_day ?? []
    const step = Math.max(1, Math.ceil(days.length / 10))
    return days.map((d, i) => ({ label: dayjs(d.day).format('ddd D MMM'), tick: i % step === 0 ? dayjs(d.day).format('D MMM') : '', seconds: d.seconds }))
  }, [me, report, tz])

  const share = (s: number) => (me && me.tracked_seconds ? Math.round((s / me.tracked_seconds) * 100) : 0)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                My working
              </Title>
              <Text className="page-head__sub">
                What you worked on, from your time entries · times in {tz.replace(/_/g, ' ')} ({offsetLabel(zoneOffsetMinutes(tz, new Date()))})
              </Text>
            </div>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </div>

          <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 10, marginBottom: 16 }}>
            <Space wrap size={12}>
              <Segmented
                value={preset}
                onChange={(v) => setPreset(v as Preset)}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'week', label: 'This week' },
                  { value: 'last7', label: 'Last 7 days' },
                  { value: 'last30', label: 'Last 30 days' },
                  { value: 'custom', label: 'Pick time range' },
                ]}
              />
              {preset === 'custom' ? (
                <DatePicker.RangePicker
                  value={range}
                  onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
                  showTime={{ format: 'HH:mm', minuteStep: 5 }}
                  format="D MMM YYYY HH:mm"
                  allowClear
                />
              ) : null}
            </Space>
            {preset === 'custom' && !range ? <Text type="secondary">Pick a start and an end, up to {MAX_DAYS} days apart.</Text> : null}
            {tooLong ? <Alert type="warning" showIcon message={`That is more than ${MAX_DAYS} days. Pick a shorter range.`} /> : null}
          </section>

          {loading && !report ? (
            <Spin />
          ) : report && !me ? (
            <Alert type="info" showIcon message="No working time for you" description="Your account is not an active team member, so there is nothing to show." />
          ) : report && me ? (
            <div style={{ display: 'grid', gap: 16 }}>
              {me.active_timer ? (
                <Alert
                  type="success"
                  showIcon
                  message={
                    <span>
                      Timer running on <Link href={`/tickets/${me.active_timer.ticket_id}`}>#{me.active_timer.ticket_id} {me.active_timer.title ?? ''}</Link> since {clock(me.active_timer.since)}
                    </span>
                  }
                />
              ) : null}
              {me.calendar.on_leave ? <Alert type="warning" showIcon message={`On leave: ${me.calendar.leave.map((l) => `${l.title} (${l.start === l.end ? l.start : `${l.start} to ${l.end}`})`).join(', ')}`} /> : null}
              {report.holidays.length ? <Alert type="info" showIcon message={`Holiday: ${report.holidays.map((h) => h.title).join(', ')}`} /> : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Time tracked', value: fmt(me.tracked_seconds), hint: `${me.sessions} time entr${me.sessions === 1 ? 'y' : 'ies'}` },
                  { label: 'Tickets worked on', value: String(me.tickets_worked_count), hint: 'with time tracked in the period' },
                  { label: 'First to last entry', value: me.first_start ? `${clock(me.first_start, !sameDay)} – ${clock(me.last_end, !sameDay)}` : '—', hint: 'from the first start to the last stop' },
                  { label: 'Meetings', value: me.calendar.meetings ? `${me.calendar.meetings} · ${fmt(me.calendar.meeting_minutes * 60)}` : '—', hint: 'on your calendar, not in tracked time' },
                  { label: 'Open tickets now', value: String(me.load.open), hint: me.load.overdue ? `${me.load.overdue} overdue` : 'none overdue' },
                ].map((c) => (
                  <div key={c.label} className="ticket-surface" style={{ padding: 14 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {c.label}
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {c.hint}
                    </Text>
                  </div>
                ))}
              </div>

              <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
                <div className="cell-strong">{report.breakdown === 'hour' ? 'Per hour' : 'Per day'}</div>
                {points.length ? <Timeline points={points} /> : <Text type="secondary">Nothing to show</Text>}
              </section>

              <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
                <div className="cell-strong">Tickets worked on</div>
                <Table<WorkedTicket>
                  size="small"
                  rowKey="id"
                  loading={loading}
                  dataSource={me.tickets_worked ?? []}
                  pagination={{ pageSize: 10, hideOnSinglePage: true, size: 'small' }}
                  locale={{ emptyText: 'No time tracked in this period' }}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Ticket', render: (_: unknown, t) => <Link href={`/tickets/${t.id}`}>#{t.id} {t.title}</Link> },
                    { title: 'Company', dataIndex: 'company', render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                    { title: 'Type', dataIndex: 'type', render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                    { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                    { title: 'Entries', dataIndex: 'sessions', width: 80 },
                    {
                      title: 'Time',
                      width: 160,
                      sorter: (a, b) => a.seconds - b.seconds,
                      defaultSortOrder: 'descend',
                      render: (_: unknown, t) => (
                        <div>
                          <span className="cell-strong">{fmt(t.seconds)}</span> <Text type="secondary">{share(t.seconds)}%</Text>
                        </div>
                      ),
                    },
                  ]}
                />
              </section>

              <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
                <div className="cell-strong">Time entries, newest first</div>
                <Table<Entry>
                  size="small"
                  rowKey={(e) => `${e.start}-${e.ticket_id}`}
                  loading={loading}
                  dataSource={me.sessions_list ?? []}
                  pagination={{ pageSize: 15, hideOnSinglePage: true, size: 'small' }}
                  locale={{ emptyText: 'No time entries in this period' }}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Day', width: 110, render: (_: unknown, e) => dayjs(e.start).tz(tz).format('ddd D MMM') },
                    {
                      title: `From – to (${tz.replace(/_/g, ' ')})`,
                      width: 190,
                      render: (_: unknown, e) => (
                        <span>
                          {dayjs(e.start).tz(tz).format('HH:mm:ss')} – {e.running ? <Tag color="green" style={{ margin: 0 }}>running</Tag> : dayjs(e.end).tz(tz).format('HH:mm:ss')}
                        </span>
                      ),
                    },
                    { title: 'Duration', width: 90, render: (_: unknown, e) => <span className="cell-strong">{fmt(e.seconds)}</span> },
                    { title: 'Ticket', render: (_: unknown, e) => <Link href={`/tickets/${e.ticket_id}`}>#{e.ticket_id} {e.title ?? ''}</Link> },
                    { title: 'Company', dataIndex: 'company', render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
                    { title: 'Status', dataIndex: 'status', render: (v: string | null) => (v ? <Tag>{v}</Tag> : null) },
                  ]}
                />
                {(me.sessions_list?.length ?? 0) >= 500 ? <Text type="secondary" style={{ fontSize: 12 }}>Showing the latest 500 entries.</Text> : null}
              </section>
            </div>
          ) : null}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
