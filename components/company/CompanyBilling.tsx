'use client'

import { DeleteOutlined, DollarOutlined, FieldTimeOutlined, PlusOutlined, WalletOutlined, WarningOutlined } from '@ant-design/icons'
import { App, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Skeleton, Space, Table, Tooltip } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import Link from 'next/link'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import CompanyInvoices from '@/components/invoices/CompanyInvoices'
import { DEFAULT_RATE_CURRENCY, formatMoney, RATE_CURRENCIES } from '@/lib/billing-rate'
import type { CompanyBilling as Billing, Money } from '@/lib/company-billing'

function fmtHours(seconds: number): string {
  if (seconds > 0 && seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`
  const h = seconds / 3600
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}

function MoneyLines({ items, empty = '—' }: { items: Money[]; empty?: string }) {
  if (items.length === 0) return <>{empty}</>
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

/** Billing overview for a company (admin / manager): billed, paid, outstanding + payment history. */
export default function CompanyBilling({ companyId, companyName, defaultCurrency }: { companyId: string; companyName?: string; defaultCurrency?: string | null }) {
  const { message } = App.useApp()
  const [data, setData] = useState<Billing | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ amount: number; currency: string; paid_at: Dayjs; reference?: string; note?: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/billing`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Failed to load billing')
      setData(body.data)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load billing')
    } finally {
      setLoading(false)
    }
  }, [companyId, message])

  useEffect(() => {
    void load()
  }, [load])

  const openPayment = () => {
    const outstanding = data?.outstanding.find((m) => m.amount > 0)
    form.setFieldsValue({
      currency: outstanding?.currency ?? defaultCurrency ?? DEFAULT_RATE_CURRENCY,
      amount: outstanding ? Math.round(outstanding.amount * 100) / 100 : undefined,
      paid_at: dayjs(),
      reference: undefined,
      note: undefined,
    })
    setModalOpen(true)
  }

  const savePayment = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/payments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v, paid_at: v.paid_at?.toISOString() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'Failed to record payment')
      message.success('Payment recorded')
      setModalOpen(false)
      void load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  const deletePayment = async (id: string) => {
    const res = await fetch(`/api/companies/${companyId}/payments/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      message.error('Failed to delete payment')
      return
    }
    message.success('Payment deleted')
    void load()
  }

  if (loading && !data) return <Skeleton active paragraph={{ rows: 6 }} />
  if (!data) return <Empty description="Billing unavailable" />

  return (
    <div className="company-billing">
      <div className="billing-kpis">
        <Kpi icon={<WalletOutlined />} tone="green" label="Deposit balance" hint="Payments received − invoices paid">
          <MoneyLines items={data.depositBalance} empty={formatMoney(0, defaultCurrency)} />
        </Kpi>
        <Kpi
          icon={<WarningOutlined />}
          tone={data.unpaidInvoices.length ? 'amber' : 'slate'}
          label="Unpaid invoices"
          hint={data.unpaidInvoices.length ? 'Issued and waiting for payment' : 'Nothing owed'}
        >
          <MoneyLines items={data.unpaidInvoices} empty={formatMoney(0, defaultCurrency)} />
        </Kpi>
        <Kpi icon={<DollarOutlined />} tone="teal" label="Not invoiced yet" hint={<>Work billed all time: {data.billed.map((m) => formatMoney(m.amount, m.currency)).join(' · ') || formatMoney(0, defaultCurrency)}</>}>
          <MoneyLines items={data.notInvoiced} empty={formatMoney(0, defaultCurrency)} />
        </Kpi>
        <Kpi
          icon={<FieldTimeOutlined />}
          tone="slate"
          label="Internal time"
          hint={data.unpricedSeconds > 0 ? `${fmtHours(data.unpricedSeconds)} billable but unpriced` : 'Non-billable job types'}
        >
          {fmtHours(data.nonBillableSeconds)}
        </Kpi>
      </div>

      <CompanyInvoices companyId={companyId} companyName={companyName} onChanged={load} currencies={[...data.notInvoiced, ...data.billed].map((m) => m.currency)} />

      {data.unpricedSeconds > 0 ? (
        <div className="billing-note">
          <WarningOutlined /> {fmtHours(data.unpricedSeconds)} of billable time is on tickets without an hourly rate and is
          not included in the total. Set a rate on those tickets (or a default rate on the company for new ones).
        </div>
      ) : null}

      <div className="billing-grid">
        <section className="ticket-surface billing-section">
          <header className="billing-section__head">
            <span>Payments &amp; deposits</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openPayment}>
              Add deposit
            </Button>
          </header>
          {data.payments.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments recorded yet" />
          ) : (
            <Table
              className="ticket-table"
              size="small"
              rowKey="id"
              pagination={data.payments.length > 8 ? { pageSize: 8 } : false}
              dataSource={data.payments}
              columns={[
                { title: 'Date', dataIndex: 'paidAt', width: 120, render: (v: string) => dayjs(v).format('D MMM YYYY') },
                {
                  title: 'Amount',
                  key: 'amount',
                  align: 'right' as const,
                  render: (_: unknown, p: Billing['payments'][number]) => <strong>{formatMoney(p.amount, p.currency)}</strong>,
                },
                {
                  title: 'Reference',
                  key: 'ref',
                  render: (_: unknown, p: Billing['payments'][number]) => (
                    <div>
                      <div>{p.reference || <span className="people-muted">—</span>}</div>
                      {p.note ? <div className="people-muted">{p.note}</div> : null}
                    </div>
                  ),
                },
                {
                  title: '',
                  key: 'actions',
                  width: 48,
                  render: (_: unknown, p: Billing['payments'][number]) => (
                    <Popconfirm title="Delete this payment?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => void deletePayment(p.id)}>
                      <Tooltip title={p.createdByName ? `Recorded by ${p.createdByName}` : 'Delete'}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          )}
        </section>

        <section className="ticket-surface billing-section">
          <header className="billing-section__head">
            <span>By month</span>
          </header>
          {data.months.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No billable time yet" />
          ) : (
            <Table
              className="ticket-table"
              size="small"
              rowKey="month"
              pagination={false}
              dataSource={data.months}
              columns={[
                { title: 'Month', dataIndex: 'month', render: (m: string) => dayjs(`${m}-01`).format('MMM YYYY') },
                { title: 'Billable', dataIndex: 'billableSeconds', align: 'right' as const, render: (s: number) => fmtHours(s) },
                {
                  title: 'Billed',
                  key: 'billed',
                  align: 'right' as const,
                  render: (_: unknown, r: Billing['months'][number]) => <MoneyLines items={r.billed} />,
                },
              ]}
            />
          )}
        </section>
      </div>

      <section className="ticket-surface billing-section" style={{ marginTop: 16 }}>
        <header className="billing-section__head">
          <span>Top billable tickets</span>
        </header>
        {data.tickets.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No billable time yet" />
        ) : (
          <Table
            className="ticket-table"
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.tickets}
            columns={[
              {
                title: 'Ticket',
                key: 'ticket',
                render: (_: unknown, t: Billing['tickets'][number]) => (
                  <Link href={`/tickets/${t.id}`} className="ticket-table__title">
                    <span className="kanban-card__id" style={{ marginRight: 6 }}>#{t.id}</span>
                    {t.title}
                  </Link>
                ),
              },
              { title: 'Billable', dataIndex: 'billableSeconds', width: 100, align: 'right' as const, render: (s: number) => fmtHours(s) },
              {
                title: 'Rate',
                key: 'rate',
                width: 140,
                align: 'right' as const,
                render: (_: unknown, t: Billing['tickets'][number]) =>
                  t.rate == null ? <span className="people-muted">No rate</span> : `${formatMoney(t.rate, t.currency)}/h`,
              },
              {
                title: 'Billed',
                key: 'billed',
                width: 140,
                align: 'right' as const,
                render: (_: unknown, t: Billing['tickets'][number]) =>
                  t.billed == null ? <span className="people-muted">—</span> : <strong>{formatMoney(t.billed, t.currency)}</strong>,
              },
            ]}
          />
        )}
      </section>

      <Modal
        title="Record payment"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void savePayment()}
        confirmLoading={saving}
        okText="Save payment"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="Amount" required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="currency" noStyle rules={[{ required: true }]}>
                <Select style={{ width: 90 }} options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
              <Form.Item name="amount" noStyle rules={[{ required: true, message: 'Enter the amount' }]}>
                <InputNumber min={0.01} style={{ width: '100%' }} placeholder="Amount received" />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="paid_at" label="Paid on" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="D MMM YYYY" />
          </Form.Item>
          <Form.Item name="reference" label="Reference">
            <Input placeholder="Invoice / transfer number" maxLength={120} />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
