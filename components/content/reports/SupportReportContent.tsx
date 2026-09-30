'use client'

import { CheckCircleOutlined, DownloadOutlined, FieldTimeOutlined, InboxOutlined, MessageOutlined } from '@ant-design/icons'
import { App, Button, DatePicker, Layout, Segmented, Table, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { DurationStats, SupportReport, SupportReportAgent, SupportReportTeam } from '@/lib/support-report'

const { Content } = Layout
const { Title, Text } = Typography

type Preset = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom'

function presetRange(p: Preset): [Dayjs, Dayjs] {
  const now = dayjs()
  if (p === 'last_month') {
    const m = now.subtract(1, 'month')
    return [m.startOf('month'), m.endOf('month')]
  }
  if (p === 'this_quarter') {
    const qStart = now.month(Math.floor(now.month() / 3) * 3).startOf('month')
    return [qStart, qStart.add(2, 'month').endOf('month')]
  }
  if (p === 'this_year') return [now.startOf('year'), now.endOf('year')]
  return [now.startOf('month'), now.endOf('month')]
}

/** 45m · 3.5h · 2.1d */
function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 60) return '<1m'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round((seconds / 3600) * 10) / 10}h`
  return `${Math.round((seconds / 86400) * 10) / 10}d`
}

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

function Duration({ s }: { s: DurationStats }) {
  if (!s.count) return <span className="cell-muted">—</span>
  return (
    <span title={`Median ${fmtDuration(s.medianSeconds)} · ${s.count} ticket${s.count > 1 ? 's' : ''}`}>
      <span className="cell-strong">{fmtDuration(s.avgSeconds)}</span>
      <span className="cell-muted" style={{ fontSize: 11 }}> · {s.count}</span>
    </span>
  )
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** Reports → Support (admin / manager): response and resolution times, and the work per agent and team. */
export default function SupportReportContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [preset, setPreset] = useState<Preset>('this_month')
  const [range, setRange] = useState<[Dayjs, Dayjs]>(presetRange('this_month'))
  const [data, setData] = useState<SupportReport | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') })
      const res = await fetch(`/api/reports/support?${qs}`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the report')
      setData(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [range, message])

  useEffect(() => {
    void load()
  }, [load])

  const exportCsv = () => {
    if (!data) return
    const hours = (s: number | null) => (s == null ? '' : (s / 3600).toFixed(2))
    const header = ['Agent', 'Assigned', 'Resolved', 'Replies', 'First responses', 'Avg first response (h)', 'Median first response (h)', 'Time tracked (h)']
    const lines = data.agents.map((a) =>
      [a.name, a.assigned, a.resolved, a.replies, a.firstResponse.count, hours(a.firstResponse.avgSeconds), hours(a.firstResponse.medianSeconds), hours(a.trackedSeconds)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `support-${data.from}-to-${data.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const maxDay = useMemo(() => Math.max(1, ...(data?.days ?? []).map((d) => Math.max(d.created, d.resolved))), [data])
  const t = data?.totals

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Support report
              </Title>
              <Text className="page-head__sub">How fast clients get a first reply, how long tickets take, and the work per agent and team.</Text>
            </div>
            <div className="page-head__actions">
              <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data?.agents.length}>
                Export CSV
              </Button>
            </div>
          </div>

          <div className="page-toolbar">
            <Segmented<Preset>
              value={preset}
              onChange={(v) => {
                setPreset(v)
                if (v !== 'custom') setRange(presetRange(v))
              }}
              options={[
                { value: 'this_month', label: 'This month' },
                { value: 'last_month', label: 'Last month' },
                { value: 'this_quarter', label: 'This quarter' },
                { value: 'this_year', label: 'This year' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            <DatePicker.RangePicker
              value={range}
              allowClear={false}
              onChange={(v) => {
                if (v?.[0] && v?.[1]) {
                  setPreset('custom')
                  setRange([v[0], v[1]])
                }
              }}
            />
          </div>

          <div className="billing-kpis">
            <Kpi icon={<InboxOutlined />} tone="teal" label="New tickets" hint={`${t?.openNow ?? 0} open right now`}>
              {t?.created ?? 0}
            </Kpi>
            <Kpi icon={<CheckCircleOutlined />} tone="green" label="Resolved" hint="Moved to resolved or closed in the period">
              {t?.resolved ?? 0}
            </Kpi>
            <Kpi
              icon={<MessageOutlined />}
              tone={t?.awaitingFirstResponse ? 'amber' : 'slate'}
              label="First response"
              hint={
                <>
                  Median {fmtDuration(t?.firstResponse.medianSeconds)} · {t?.firstResponse.count ?? 0} replied
                  {t?.awaitingFirstResponse ? ` · ${t.awaitingFirstResponse} still waiting` : ''}
                </>
              }
            >
              {fmtDuration(t?.firstResponse.avgSeconds)}
            </Kpi>
            <Kpi icon={<FieldTimeOutlined />} tone="slate" label="Resolution time" hint={<>Median {fmtDuration(t?.resolution.medianSeconds)} · created → resolved</>}>
              {fmtDuration(t?.resolution.avgSeconds)}
            </Kpi>
          </div>

          {data && data.days.length > 1 && (t?.created || t?.resolved) ? (
            <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
              <header className="billing-section__head">
                <span>New and resolved per day</span>
                <span className="cell-muted" style={{ fontSize: 12, fontWeight: 400 }}>
                  <span className="color-dot" style={{ background: 'var(--brand-primary)' }} /> New &nbsp; <span className="color-dot" style={{ background: '#16A34A' }} /> Resolved
                </span>
              </header>
              <div className="report-days">
                {data.days.map((d) => (
                  <div key={d.day} className="report-days__col" title={`${dayjs(d.day).format('D MMM')}: ${d.created} new · ${d.resolved} resolved`}>
                    <div className="report-days__bars">
                      <div className="report-days__bar" style={{ height: `${(d.created / maxDay) * 100}%`, background: 'var(--brand-primary)' }} />
                      <div className="report-days__bar" style={{ height: `${(d.resolved / maxDay) * 100}%`, background: '#16A34A' }} />
                    </div>
                    {data.days.length <= 31 ? <span className="report-months__label">{dayjs(d.day).format('D')}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
            <header className="billing-section__head">
              <span>Agents</span>
            </header>
            <Table<SupportReportAgent>
              className="ticket-table"
              rowKey="userId"
              size="small"
              loading={loading}
              dataSource={data?.agents ?? []}
              pagination={false}
              scroll={{ x: 760 }}
              locale={{ emptyText: 'No agent activity in this period' }}
              columns={[
                {
                  title: 'Agent',
                  dataIndex: 'name',
                  render: (n: string, r) => (
                    <SpaNavLink href={`/settings/users/${r.userId}`} className="ticket-table__title">
                      {n}
                    </SpaNavLink>
                  ),
                },
                { title: 'Assigned', dataIndex: 'assigned', width: 100, align: 'right', sorter: (a, b) => a.assigned - b.assigned },
                { title: 'Resolved', dataIndex: 'resolved', width: 100, align: 'right', sorter: (a, b) => a.resolved - b.resolved, render: (v: number) => <span className="cell-strong">{v}</span> },
                { title: 'Replies', dataIndex: 'replies', width: 100, align: 'right', sorter: (a, b) => a.replies - b.replies },
                {
                  title: 'First response',
                  key: 'frt',
                  width: 150,
                  align: 'right',
                  sorter: (a, b) => (a.firstResponse.avgSeconds ?? Infinity) - (b.firstResponse.avgSeconds ?? Infinity),
                  render: (_, r) => <Duration s={r.firstResponse} />,
                },
                { title: 'Time tracked', dataIndex: 'trackedSeconds', width: 130, align: 'right', sorter: (a, b) => a.trackedSeconds - b.trackedSeconds, render: (s: number) => <span className="cell-muted">{fmtHours(s)}</span> },
              ]}
            />
          </section>

          <section className="ticket-surface billing-section">
            <header className="billing-section__head">
              <span>Teams</span>
            </header>
            <Table<SupportReportTeam>
              className="ticket-table"
              rowKey={(r) => r.teamId ?? 'none'}
              size="small"
              loading={loading}
              dataSource={data?.teams ?? []}
              pagination={false}
              scroll={{ x: 640 }}
              locale={{ emptyText: 'No tickets in this period' }}
              columns={[
                { title: 'Team', dataIndex: 'name', render: (n: string, r) => (r.teamId ? <span className="cell-strong">{n}</span> : <span className="cell-muted">{n}</span>) },
                { title: 'New', dataIndex: 'created', width: 100, align: 'right' },
                { title: 'Resolved', dataIndex: 'resolved', width: 100, align: 'right' },
                { title: 'First response', key: 'frt', width: 150, align: 'right', render: (_, r) => <Duration s={r.firstResponse} /> },
                { title: 'Resolution time', key: 'res', width: 150, align: 'right', render: (_, r) => <Duration s={r.resolution} /> },
              ]}
            />
          </section>

          <Text className="page-head__sub" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
            First response counts tickets opened by a client (portal or email) and the first public reply from the team; internal notes do not count.
            Times show the average, with the number of tickets behind it.
          </Text>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
