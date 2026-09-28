'use client'

import {
  ClockCircleOutlined,
  DollarOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { App, Button, DatePicker, Layout, Segmented, Table, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import CreateInvoiceModal from '@/components/invoices/CreateInvoiceModal'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { formatMoney } from '@/lib/billing-rate'
import type { BillingReport, BillingReportCompany } from '@/lib/billing-report'
import type { Money } from '@/lib/company-billing'

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

function fmtHours(seconds: number): string {
  if (!seconds) return '0h'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`
  const h = seconds / 3600
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}

function MoneyLines({ items, empty = '—', signed = false }: { items: Money[]; empty?: string; signed?: boolean }) {
  if (items.length === 0) return <span className="cell-muted">{empty}</span>
  return (
    <>
      {items.map((m) => (
        <div key={m.currency} style={signed ? { color: m.amount > 0 ? '#D97706' : m.amount < 0 ? '#16A34A' : undefined } : undefined}>
          {signed && m.amount < 0 ? `${formatMoney(-m.amount, m.currency)} credit` : formatMoney(m.amount, m.currency)}
        </div>
      ))}
    </>
  )
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

const moneyText = (items: Money[]) => items.map((m) => `${m.currency} ${m.amount}`).join(' | ')

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** Reports → Billing (admin / manager): work billed, payments, deposit balances and invoices per company. */
export default function BillingReportContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [preset, setPreset] = useState<Preset>('this_month')
  const [range, setRange] = useState<[Dayjs, Dayjs]>(presetRange('this_month'))
  const [data, setData] = useState<BillingReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [invoiceFor, setInvoiceFor] = useState<BillingReportCompany | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') })
      const res = await fetch(`/api/reports/billing?${qs}`, { credentials: 'include' })
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
    const header = ['Company', 'Billable hours', 'Internal hours', 'Unpriced billable hours', 'Billed', 'Paid in period', 'Not invoiced (all time)', 'Unpaid invoices', 'Deposit balance']
    const hours = (s: number) => (s / 3600).toFixed(2)
    const lines = data.companies.map((c) =>
      [c.name, hours(c.billableSeconds), hours(c.internalSeconds), hours(c.unpricedSeconds), moneyText(c.billed), moneyText(c.paid), moneyText(c.notInvoiced), moneyText(c.unpaidInvoices), moneyText(c.deposit)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `billing-${data.from}-to-${data.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const maxMonthSeconds = useMemo(() => Math.max(1, ...(data?.months ?? []).map((m) => m.billableSeconds)), [data])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Billing report
              </Title>
              <Text className="page-head__sub">
                Billable time × each ticket&apos;s hourly rate, payments received, and what each client still owes.
              </Text>
            </div>
            <div className="page-head__actions">
              <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data?.companies.length}>
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
            <Kpi icon={<DollarOutlined />} tone="teal" label="Billed in period" hint={`${fmtHours(data?.totals.billableSeconds ?? 0)} billable time`}>
              <MoneyLines items={data?.totals.billed ?? []} empty="0" />
            </Kpi>
            <Kpi icon={<WalletOutlined />} tone="green" label="Paid in period" hint="Payments recorded on companies">
              <MoneyLines items={data?.totals.paid ?? []} empty="0" />
            </Kpi>
            <Kpi icon={<ExclamationCircleOutlined />} tone="amber" label="Unpaid invoices" hint={data?.totals.notInvoiced.length ? <>Not invoiced yet: {moneyText(data.totals.notInvoiced)}</> : 'All work is invoiced'}>
              <MoneyLines items={data?.totals.unpaidInvoices ?? []} empty="0" />
            </Kpi>
            <Kpi icon={<ClockCircleOutlined />} tone="slate" label="Deposit balances" hint={`${fmtHours(data?.totals.internalSeconds ?? 0)} internal time in period`}>
              <MoneyLines items={data?.totals.deposit ?? []} empty="0" />
            </Kpi>
          </div>

          {data && data.totals.unpricedSeconds > 0 ? (
            <div className="billing-note">
              <WarningOutlined /> {fmtHours(data.totals.unpricedSeconds)} of billable time in this period is on tickets without an hourly rate
              and is not counted. Set a rate on those tickets or a default rate on their company.
            </div>
          ) : null}

          {data && data.months.length > 1 ? (
            <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
              <header className="billing-section__head">
                <span>Billable time per month</span>
              </header>
              <div className="report-months">
                {data.months.map((m) => (
                  <div key={m.month} className="report-months__col" title={`${fmtHours(m.billableSeconds)} · ${moneyText(m.billed) || 'no priced time'}`}>
                    <div className="report-months__bar" style={{ height: `${Math.max(4, (m.billableSeconds / maxMonthSeconds) * 100)}%` }} />
                    <span className="report-months__value">{fmtHours(m.billableSeconds)}</span>
                    <span className="report-months__label">{dayjs(`${m.month}-01`).format('MMM YY')}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="ticket-surface ticket-table">
            <Table<BillingReportCompany>
              rowKey={(r) => r.companyId ?? 'none'}
              loading={loading}
              dataSource={data?.companies ?? []}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: 'No billable time or payments in this period' }}
              columns={[
                {
                  title: 'Company',
                  key: 'name',
                  render: (_, r) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="color-dot" style={{ background: r.color || '#94A3B8' }} />
                      {r.companyId ? (
                        <SpaNavLink href={`/companies/${r.companyId}?tab=billing`} className="ticket-table__title">
                          {r.name}
                        </SpaNavLink>
                      ) : (
                        <span className="cell-muted">{r.name}</span>
                      )}
                    </span>
                  ),
                },
                {
                  title: 'Billable',
                  dataIndex: 'billableSeconds',
                  width: 110,
                  align: 'right',
                  sorter: (a, b) => a.billableSeconds - b.billableSeconds,
                  render: (s: number, r) => (
                    <span>
                      <span className="cell-strong">{fmtHours(s)}</span>
                      {r.unpricedSeconds ? (
                        <div className="cell-muted" style={{ fontSize: 11, color: '#D97706' }}>
                          {fmtHours(r.unpricedSeconds)} unpriced
                        </div>
                      ) : null}
                    </span>
                  ),
                },
                { title: 'Internal', dataIndex: 'internalSeconds', width: 100, align: 'right', render: (s: number) => <span className="cell-muted">{fmtHours(s)}</span> },
                { title: 'Billed', key: 'billed', width: 170, align: 'right', render: (_, r) => <MoneyLines items={r.billed} /> },
                { title: 'Paid', key: 'paid', width: 170, align: 'right', render: (_, r) => <MoneyLines items={r.paid} /> },
                { title: 'Not invoiced', key: 'notInvoiced', width: 160, align: 'right', render: (_, r) => <MoneyLines items={r.notInvoiced} /> },
                {
                  title: 'Unpaid invoices',
                  key: 'unpaid',
                  width: 160,
                  align: 'right',
                  render: (_, r) => (r.unpaidInvoices.length ? <span style={{ color: '#D97706' }}><MoneyLines items={r.unpaidInvoices} /></span> : <span className="cell-muted">—</span>),
                },
                { title: 'Deposit', key: 'deposit', width: 150, align: 'right', render: (_, r) => <MoneyLines items={r.deposit} /> },
                {
                  title: '',
                  key: 'invoice',
                  width: 130,
                  align: 'right',
                  render: (_, r) =>
                    r.companyId ? (
                      <Button size="small" icon={<FileTextOutlined />} onClick={() => setInvoiceFor(r)}>
                        Invoice
                      </Button>
                    ) : null,
                },
              ]}
            />
          </div>
          <CreateInvoiceModal
            open={!!invoiceFor}
            onClose={() => setInvoiceFor(null)}
            company={invoiceFor?.companyId ? { id: invoiceFor.companyId, name: invoiceFor.name } : null}
            from={range[0].format('YYYY-MM-DD')}
            to={range[1].format('YYYY-MM-DD')}
            currencies={(invoiceFor?.billed.length ? invoiceFor.billed : invoiceFor?.notInvoiced ?? []).map((m) => m.currency)}
          />
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
