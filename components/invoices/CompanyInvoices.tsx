'use client'

import { FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Table } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import CreateInvoiceModal from '@/components/invoices/CreateInvoiceModal'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { formatMoney } from '@/lib/billing-rate'

type InvoiceRow = {
  id: string
  number: string
  period_from: string
  period_to: string
  issue_date: string
  due_date: string | null
  total: number
  currency: string
  status: string
  paid_via: string | null
}

const STATUS: Record<string, { label: string; color: string }> = {
  issued: { label: 'Unpaid', color: '#D97706' },
  paid: { label: 'Paid', color: '#16A34A' },
  void: { label: 'Void', color: '#94A3B8' },
}

/** Company → Billing: invoices list and "Create invoice". */
export default function CompanyInvoices({
  companyId,
  companyName,
  currencies,
  onChanged,
}: {
  companyId: string
  companyName?: string
  currencies: string[]
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices?company_id=${encodeURIComponent(companyId)}`, { credentials: 'include' })
      if (res.ok) setRows(await res.json())
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const uniqueCurrencies = [...new Set(currencies)]

  return (
    <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
      <header className="billing-section__head">
        <span>
          <FileTextOutlined /> Invoices
        </span>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Create invoice
        </Button>
      </header>
      {!loading && rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invoices yet" />
      ) : (
        <Table<InvoiceRow>
          className="ticket-table"
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={rows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
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
              render: (_, r) => <span className="cell-muted">{dayjs(r.period_from).format('D MMM')} – {dayjs(r.period_to).format('D MMM YYYY')}</span>,
            },
            { title: 'Issued', dataIndex: 'issue_date', width: 110, render: (d: string) => <span className="cell-muted">{dayjs(d).format('D MMM YYYY')}</span> },
            { title: 'Total', key: 'total', align: 'right', width: 150, render: (_, r) => <span className="cell-strong">{formatMoney(r.total, r.currency)}</span> },
            {
              title: 'Status',
              key: 'status',
              width: 150,
              render: (_, r) => {
                const s = STATUS[r.status] ?? STATUS.issued
                return (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <StatusPill color={s.color} title={s.label} />
                    {r.status === 'paid' ? (
                      <SpaNavLink href={`/invoices/${r.id}?doc=receipt`} className="cell-muted" style={{ fontSize: 12 }}>
                        receipt
                      </SpaNavLink>
                    ) : null}
                  </span>
                )
              },
            },
          ]}
        />
      )}
      <CreateInvoiceModal
        open={open}
        onClose={() => {
          setOpen(false)
          void load()
          onChanged?.()
        }}
        company={{ id: companyId, name: companyName ?? 'Company' }}
        from={dayjs().startOf('month').format('YYYY-MM-DD')}
        to={dayjs().endOf('month').format('YYYY-MM-DD')}
        currencies={uniqueCurrencies.length ? uniqueCurrencies : ['IDR']}
      />
    </section>
  )
}
