'use client'

import { App, Checkbox, DatePicker, Input, Modal, Select, Spin } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { formatMoney, RATE_CURRENCIES } from '@/lib/billing-rate'

type Preview = { lines: { ticketId: number; adjustment?: boolean }[]; total: number; balance: number }

interface Props {
  open: boolean
  onClose: () => void
  company: { id: string; name: string } | null
  /** Period of the report (inclusive) */
  from: string
  to: string
  /** Currencies that have billed work for this company in the period (first = default) */
  currencies: string[]
}

/** Create an invoice for a company's billable work in a period; optionally settle it from the deposit balance. */
export default function CreateInvoiceModal({ open, onClose, company, from, to, currencies }: Props) {
  const { message } = App.useApp()
  const router = useRouter()
  const [currency, setCurrency] = useState(currencies[0] ?? 'IDR')
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs(from), dayjs(to)])
  const [issueDate, setIssueDate] = useState<Dayjs>(dayjs())
  const [dueDate, setDueDate] = useState<Dayjs | null>(dayjs().add(14, 'day'))
  const [notes, setNotes] = useState('')
  const [fromBalance, setFromBalance] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrency(currencies[0] ?? 'IDR')
    setPeriod([dayjs(from), dayjs(to)])
    setIssueDate(dayjs())
    setDueDate(dayjs().add(14, 'day'))
    setNotes('')
    setFromBalance(false)
  }, [open, from, to, currencies.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !company) return
    let alive = true
    setLoading(true)
    const qs = new URLSearchParams({ company_id: company.id, from: period[0].format('YYYY-MM-DD'), to: period[1].format('YYYY-MM-DD'), currency })
    fetch(`/api/invoices/preview?${qs}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: Preview) => {
        if (!alive) return
        setPreview(d)
        setFromBalance(d.total > 0 && d.balance >= d.total)
      })
      .catch(() => alive && setPreview(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open, company, period, currency])

  const create = async () => {
    if (!company) return
    setSaving(true)
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          from: period[0].format('YYYY-MM-DD'),
          to: period[1].format('YYYY-MM-DD'),
          currency,
          issue_date: issueDate.format('YYYY-MM-DD'),
          due_date: dueDate ? dueDate.format('YYYY-MM-DD') : null,
          notes,
          pay_from_balance: fromBalance,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not create the invoice')
      if (data.warning) message.warning(data.warning)
      else message.success(`${data.number} created${data.status === 'paid' ? ' and paid from the deposit' : ''}`)
      onClose()
      router.push(`/invoices/${data.id}${data.status === 'paid' ? '?doc=receipt' : ''}`)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const money = (n: number) => formatMoney(n, currency)
  const empty = !loading && preview != null && preview.lines.length === 0
  // Only price reductions (adjustments) and not enough new work to offset them
  const credit = !loading && preview != null && preview.lines.length > 0 && preview.total <= 0
  const adjustments = preview?.lines.filter((l) => l.adjustment).length ?? 0

  return (
    <Modal
      title={company ? `Invoice ${company.name}` : 'Invoice'}
      open={open}
      onCancel={onClose}
      okText={fromBalance ? 'Create and pay from balance' : 'Create invoice'}
      okButtonProps={{ disabled: loading || !preview || empty || credit }}
      confirmLoading={saving}
      onOk={() => void create()}
      width={560}
      destroyOnHidden
    >
      <div className="mt-edit-grid" style={{ marginBottom: 12 }}>
        <label className="mt-field">
          <span className="mt-field__label">Work period</span>
          <DatePicker.RangePicker value={period} allowClear={false} onChange={(v) => v?.[0] && v?.[1] && setPeriod([v[0], v[1]])} />
        </label>
        <label className="mt-field">
          <span className="mt-field__label">Currency</span>
          <Select value={currency} onChange={setCurrency} options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </label>
        <label className="mt-field">
          <span className="mt-field__label">Issue date</span>
          <DatePicker value={issueDate} allowClear={false} onChange={(v) => v && setIssueDate(v)} />
        </label>
        <label className="mt-field">
          <span className="mt-field__label">Due date</span>
          <DatePicker value={dueDate} onChange={(v) => setDueDate(v)} />
        </label>
      </div>
      <label className="mt-field" style={{ marginBottom: 12 }}>
        <span className="mt-field__label">Notes on the invoice</span>
        <Input.TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </label>

      <div className="invoice-preview">
        {loading || !preview ? (
          <Spin size="small" />
        ) : empty ? (
          <span className="cell-muted">Nothing to bill in {currency} for this period (no priced billable time or fixed-price tickets).</span>
        ) : credit ? (
          <span className="cell-muted">
            Only price reductions in {currency} ({money(preview.total)}). They are deducted from the next invoice that has work to bill.
          </span>
        ) : (
          <>
            <div>
              <span className="cell-muted">{preview.lines.length} ticket(s) · Total </span>
              <strong>{money(preview.total)}</strong>
              {adjustments ? <span className="cell-muted"> · includes {adjustments} price adjustment{adjustments > 1 ? 's' : ''}</span> : null}
            </div>
            <div className="cell-muted">Deposit balance: {money(preview.balance)}</div>
            <Checkbox checked={fromBalance} disabled={preview.balance < preview.total} onChange={(e) => setFromBalance(e.target.checked)}>
              Pay it from the deposit balance now (a receipt is issued)
            </Checkbox>
          </>
        )}
      </div>
    </Modal>
  )
}
