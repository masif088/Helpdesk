'use client'

import { AlertOutlined, ClockCircleOutlined, MessageOutlined, SmileOutlined } from '@ant-design/icons'
import { App, DatePicker, Layout, Progress, Rate, Segmented, Table, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { formatSlaDuration } from '@/lib/sla-format'
import type { Compliance, CsatRow, SlaAtRisk, SlaGroupRow, SlaReport } from '@/lib/sla-report'

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

/** Share of finished clocks that were on time (running ones are not counted yet); null when none finished. */
function percent(c: Compliance): number | null {
  const done = c.met + c.missed + c.breached
  return done ? Math.round((c.met / done) * 100) : null
}

function tone(p: number | null): string {
  return p == null ? 'slate' : p >= 90 ? 'green' : p >= 70 ? 'amber' : 'red'
}

function Cell({ c }: { c: Compliance }) {
  const p = percent(c)
  if (p == null && !c.running) return <span className="cell-muted">—</span>
  return (
    <span title={`${c.met} on time · ${c.missed} late · ${c.breached} overdue now · ${c.running} still running`}>
      <span className="cell-strong">{p == null ? '—' : `${p}%`}</span>
      <span className="cell-muted" style={{ fontSize: 11 }}>
        {' '}
        · {c.met}/{c.met + c.missed + c.breached}
        {c.running ? ` · ${c.running} running` : ''}
      </span>
    </span>
  )
}

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** Reports → SLA & satisfaction (admin / manager). */
export default function SlaReportContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [preset, setPreset] = useState<Preset>('this_month')
  const [range, setRange] = useState<[Dayjs, Dayjs]>(presetRange('this_month'))
  const [data, setData] = useState<SlaReport | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') })
      const res = await fetch(`/api/reports/sla?${qs}`, { credentials: 'include' })
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

  const t = data?.totals
  const respondP = t ? percent(t.respond) : null
  const resolveP = t ? percent(t.resolve) : null
  const csat = data?.csat
  const maxRating = Math.max(1, ...(csat?.distribution ?? [1]))

  const groupColumns = (title: string) => [
    { title, dataIndex: 'name', render: (n: string) => <span className="cell-strong">{n}</span> },
    { title: 'Tickets', dataIndex: 'tickets', width: 90, align: 'right' as const },
    { title: 'Response in time', key: 'respond', width: 220, align: 'right' as const, render: (_: unknown, r: SlaGroupRow) => <Cell c={r.respond} /> },
    { title: 'Resolved in time', key: 'resolve', width: 220, align: 'right' as const, render: (_: unknown, r: SlaGroupRow) => <Cell c={r.resolve} /> },
  ]

  const csatColumns = (title: string, link?: (r: CsatRow) => string | null) => [
    {
      title,
      dataIndex: 'name',
      render: (n: string, r: CsatRow) => {
        const href = link?.(r)
        return href ? (
          <SpaNavLink href={href} className="ticket-table__title">
            {n}
          </SpaNavLink>
        ) : (
          <span className="cell-strong">{n}</span>
        )
      },
    },
    { title: 'Ratings', dataIndex: 'responses', width: 90, align: 'right' as const },
    {
      title: 'Average',
      dataIndex: 'average',
      width: 190,
      align: 'right' as const,
      render: (v: number) => (
        <span>
          <Rate disabled allowHalf value={v} style={{ fontSize: 13 }} /> <span className="cell-strong">{v.toFixed(2)}</span>
        </span>
      ),
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
                SLA &amp; satisfaction
              </Title>
              <Text className="page-head__sub">Were clients answered and helped in time, and how happy were they with it.</Text>
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
            <Kpi
              icon={<MessageOutlined />}
              tone={tone(respondP)}
              label="Answered in time"
              hint={t ? `${t.respond.met} of ${t.respond.met + t.respond.missed + t.respond.breached} first replies on time${t.respond.running ? ` · ${t.respond.running} running` : ''}` : undefined}
            >
              {respondP == null ? '—' : `${respondP}%`}
            </Kpi>
            <Kpi
              icon={<ClockCircleOutlined />}
              tone={tone(resolveP)}
              label="Resolved in time"
              hint={t ? `${t.resolve.met} of ${t.resolve.met + t.resolve.missed + t.resolve.breached} tickets on time${t.resolve.running ? ` · ${t.resolve.running} running` : ''}` : undefined}
            >
              {resolveP == null ? '—' : `${resolveP}%`}
            </Kpi>
            <Kpi icon={<AlertOutlined />} tone={data?.atRisk.length ? 'red' : 'slate'} label="At risk right now" hint="Open tickets about to breach or already late">
              {data?.atRisk.length ?? 0}
            </Kpi>
            <Kpi icon={<SmileOutlined />} tone={csat?.average == null ? 'slate' : csat.average >= 4 ? 'green' : csat.average >= 3 ? 'amber' : 'red'} label="Client rating" hint={`${csat?.responses ?? 0} rating${csat?.responses === 1 ? '' : 's'} in the period`}>
              {csat?.average == null ? '—' : `${csat.average.toFixed(2)} / 5`}
            </Kpi>
          </div>

          <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
            <header className="billing-section__head">
              <span>At risk right now</span>
            </header>
            <Table<SlaAtRisk>
              className="ticket-table"
              rowKey={(r) => `${r.ticketId}-${r.clock}`}
              size="small"
              loading={loading}
              dataSource={data?.atRisk ?? []}
              pagination={false}
              scroll={{ x: 640 }}
              locale={{ emptyText: 'Nothing is about to breach' }}
              columns={[
                {
                  title: 'Ticket',
                  key: 'ticket',
                  render: (_, r) => (
                    <SpaNavLink href={`/tickets/${r.ticketId}`} className="ticket-table__title">
                      #{r.ticketId} {r.title}
                    </SpaNavLink>
                  ),
                },
                { title: 'Client', dataIndex: 'company', width: 180, render: (c: string | null) => c ?? <span className="cell-muted">—</span> },
                { title: 'Clock', dataIndex: 'clock', width: 100, render: (c: string) => (c === 'respond' ? 'Response' : 'Resolution') },
                { title: 'Target', dataIndex: 'targetMinutes', width: 90, align: 'right', render: (m: number) => formatSlaDuration(m * 60) },
                {
                  title: 'Status',
                  key: 'status',
                  width: 160,
                  align: 'right',
                  render: (_, r) =>
                    r.remainingSeconds < 0 ? (
                      <span style={{ color: '#DC2626', fontWeight: 600 }}>{formatSlaDuration(r.remainingSeconds)} overdue</span>
                    ) : (
                      <span style={{ color: '#D97706', fontWeight: 600 }}>{formatSlaDuration(r.remainingSeconds)} left</span>
                    ),
                },
              ]}
            />
          </section>

          <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
            <header className="billing-section__head">
              <span>By client</span>
            </header>
            <Table<SlaGroupRow>
              className="ticket-table"
              rowKey="key"
              size="small"
              loading={loading}
              dataSource={data?.byCompany ?? []}
              pagination={false}
              scroll={{ x: 640 }}
              locale={{ emptyText: 'No tickets with a service level in this period' }}
              columns={groupColumns('Client')}
            />
          </section>

          <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
            <header className="billing-section__head">
              <span>By ticket type</span>
            </header>
            <Table<SlaGroupRow>
              className="ticket-table"
              rowKey="key"
              size="small"
              loading={loading}
              dataSource={data?.byType ?? []}
              pagination={false}
              scroll={{ x: 640 }}
              locale={{ emptyText: 'No tickets with a service level in this period' }}
              columns={groupColumns('Ticket type')}
            />
          </section>

          <div className="billing-grid">
            <section className="ticket-surface billing-section">
              <header className="billing-section__head">
                <span>Ratings</span>
              </header>
              <div style={{ padding: '4px 16px 16px' }}>
                {csat?.responses ? (
                  [5, 4, 3, 2, 1].map((n) => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 28 }}>{n} ★</span>
                      <Progress percent={Math.round((csat.distribution[n - 1] / maxRating) * 100)} showInfo={false} strokeColor={n >= 4 ? '#16A34A' : n === 3 ? '#D97706' : '#DC2626'} style={{ flex: 1, margin: 0 }} />
                      <span style={{ width: 32, textAlign: 'right' }}>{csat.distribution[n - 1]}</span>
                    </div>
                  ))
                ) : (
                  <Text type="secondary">No ratings in this period. Clients rate a ticket on its page once it is resolved.</Text>
                )}
              </div>
            </section>
            <section className="ticket-surface billing-section">
              <header className="billing-section__head">
                <span>Low ratings with a comment</span>
              </header>
              <div style={{ padding: '4px 16px 16px' }}>
                {csat?.lowComments.length ? (
                  csat.lowComments.map((c) => (
                    <div key={c.ticketId} style={{ marginBottom: 12 }}>
                      <div>
                        <Rate disabled value={c.rating} style={{ fontSize: 12 }} />{' '}
                        <SpaNavLink href={`/tickets/${c.ticketId}`} className="ticket-table__title">
                          #{c.ticketId} {c.title}
                        </SpaNavLink>
                        {c.company ? <span className="cell-muted"> · {c.company}</span> : null}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                    </div>
                  ))
                ) : (
                  <Text type="secondary">Nothing to follow up on.</Text>
                )}
              </div>
            </section>
          </div>

          <section className="ticket-surface billing-section" style={{ marginTop: 16, marginBottom: 16 }}>
            <header className="billing-section__head">
              <span>Rating by agent</span>
            </header>
            <Table<CsatRow>
              className="ticket-table"
              rowKey="key"
              size="small"
              loading={loading}
              dataSource={data?.csat.byAgent ?? []}
              pagination={false}
              locale={{ emptyText: 'No ratings in this period' }}
              columns={csatColumns('Agent', (r) => (r.key === '__none__' ? '' : `/settings/users/${r.key}`))}
            />
          </section>

          <section className="ticket-surface billing-section">
            <header className="billing-section__head">
              <span>Rating by client</span>
            </header>
            <Table<CsatRow>
              className="ticket-table"
              rowKey="key"
              size="small"
              loading={loading}
              dataSource={data?.csat.byCompany ?? []}
              pagination={false}
              locale={{ emptyText: 'No ratings in this period' }}
              columns={csatColumns('Client', (r) => (r.key === '__none__' ? null : `/companies/${r.key}`))}
            />
          </section>

          <Text className="page-head__sub" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
            SLA counts support tickets created in the period that have a target (Settings → Ticket types, or Company → SLA). &ldquo;In time&rdquo; is out of the
            tickets already answered or resolved; ones still running are listed separately. Ratings are those given in the period, whenever the ticket was created.
            A ticket counts for every agent assigned to it.
          </Text>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
