'use client'

import { FileTextOutlined, WalletOutlined, WarningOutlined } from '@ant-design/icons'
import { Empty, Skeleton, Table } from 'antd'
import dayjs from 'dayjs'
import { type ReactNode, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { formatMoney } from '@/lib/billing-rate'
import type { Money } from '@/lib/company-billing'
import type { CustomerBilling as Billing } from '@/lib/customer-billing'

type InvoiceRow = Billing['invoices'][number]
type PaymentRow = Billing['payments'][number]

function MoneyLines({ items }: { items: Money[] }) {
  if (items.length === 0) return <>{formatMoney(0, 'IDR')}</>
  return (
    <>
      {items.map((m) => (
        <div key={m.currency}>{formatMoney(m.amount, m.currency)}</div>
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

/** Customer → My company → Billing (portal admin): deposit balance, invoices and receipts, payments. Read-only. */
export default function CustomerBilling() {
  const [data, setData] = useState<Billing | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/customer/billing', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (!data) return <Empty description="Billing unavailable" />

  const overdue = (r: InvoiceRow) => r.status === 'issued' && !!r.due_date && dayjs(r.due_date).isBefore(dayjs().startOf('day'))

  return (
    <div className="company-billing">
      <div className="billing-kpis">
        <Kpi icon={<WalletOutlined />} tone="green" label="Deposit balance" hint="What you paid in, minus invoices settled">
          <MoneyLines items={data.depositBalance} />
        </Kpi>
        <Kpi
          icon={<WarningOutlined />}
          tone={data.unpaidInvoices.length ? 'amber' : 'slate'}
          label="Unpaid invoices"
          hint={data.unpaidInvoices.length ? 'Waiting for payment' : 'Nothing to pay'}
        >
          <MoneyLines items={data.unpaidInvoices} />
        </Kpi>
      </div>

      <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
        <header className="billing-section__head">
          <span>
            <FileTextOutlined /> Invoices
          </span>
        </header>
        {data.invoices.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invoices yet" />
        ) : (
          <Table<InvoiceRow>
            className="ticket-table"
            size="small"
            rowKey="id"
            dataSource={data.invoices}
            pagination={data.invoices.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
            scroll={{ x: 'max-content' }}
            columns={[
              {
                title: 'Invoice',
                dataIndex: 'number',
                render: (n: string, r) => (
                  <SpaNavLink href={`/invoices/${r.id}`} className="ticket-table__title">
                    {n}
                  </SpaNavLink>
                ),
              },
              {
                title: 'Period',
                key: 'period',
                render: (_, r) => (
                  <span className="cell-muted">
                    {dayjs(r.period_from).format('D MMM')} – {dayjs(r.period_to).format('D MMM YYYY')}
                  </span>
                ),
              },
              { title: 'Issued', dataIndex: 'issue_date', render: (d: string) => <span className="cell-muted">{dayjs(d).format('D MMM YYYY')}</span> },
              {
                title: 'Due',
                dataIndex: 'due_date',
                render: (d: string | null, r) =>
                  d ? <span className={overdue(r) ? undefined : 'cell-muted'} style={overdue(r) ? { color: '#DC2626', fontWeight: 600 } : undefined}>{dayjs(d).format('D MMM YYYY')}</span> : <span className="cell-muted">—</span>,
              },
              { title: 'Total', key: 'total', align: 'right', render: (_, r) => <span className="cell-strong">{formatMoney(r.total, r.currency)}</span> },
              {
                title: 'Status',
                key: 'status',
                render: (_, r) =>
                  r.status === 'paid' ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <StatusPill color="#16A34A" title="Paid" />
                      <SpaNavLink href={`/invoices/${r.id}?doc=receipt`} className="cell-muted" style={{ fontSize: 12 }}>
                        receipt
                      </SpaNavLink>
                    </span>
                  ) : (
                    <StatusPill color={overdue(r) ? '#DC2626' : '#D97706'} title={overdue(r) ? 'Overdue' : 'Unpaid'} />
                  ),
              },
            ]}
          />
        )}
      </section>

      <section className="ticket-surface billing-section">
        <header className="billing-section__head">
          <span>
            <WalletOutlined /> Payments &amp; deposits
          </span>
        </header>
        {data.payments.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments recorded yet" />
        ) : (
          <Table<PaymentRow>
            className="ticket-table"
            size="small"
            rowKey="id"
            dataSource={data.payments}
            pagination={data.payments.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
            columns={[
              { title: 'Date', dataIndex: 'paid_at', render: (d: string) => <span className="cell-muted">{dayjs(d).format('D MMM YYYY')}</span> },
              { title: 'Reference', dataIndex: 'reference', render: (v: string | null) => v || <span className="cell-muted">—</span> },
              { title: 'Amount', key: 'amount', align: 'right', render: (_, r) => <span className="cell-strong">{formatMoney(r.amount, r.currency)}</span> },
            ]}
          />
        )}
      </section>
    </div>
  )
}
