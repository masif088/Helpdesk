'use client'

import { FileAddOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Skeleton, Space, Switch, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { formatMoney, RATE_CURRENCIES } from '@/lib/billing-rate'
import type { Retainer } from '@/lib/fsdb'

const { Text } = Typography

type FormValues = {
  active: boolean
  amount: number | null
  currency: string
  label: string
  startMonth: Dayjs | null
  dueDays: number
  autoSend: boolean
}

const monthText = (m: string) => dayjs(`${m}-01`).format('MMMM YYYY')

/** Company → Billing: a fixed monthly fee that is invoiced automatically on the first run of each month. */
export default function RetainerSection({ companyId, defaultCurrency, onChanged }: { companyId: string; defaultCurrency?: string | null; onChanged?: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [retainer, setRetainer] = useState<Retainer | null>(null)
  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; number: string } | null>(null)

  const fill = useCallback(
    (r: Retainer | null, month: string) =>
      form.setFieldsValue({
        active: r?.active ?? true,
        amount: r?.amount ?? null,
        currency: r?.currency ?? defaultCurrency ?? 'IDR',
        label: r?.label ?? 'Monthly retainer',
        // A new retainer starts next month: this month's work is already under way
        startMonth: dayjs(`${r?.startMonth ?? dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')}-01`),
        dueDays: r?.dueDays ?? 14,
        autoSend: r?.autoSend ?? false,
      }),
    [form, defaultCurrency]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/retainer`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the retainer')
      setRetainer(body.retainer)
      setCurrentMonth(body.currentMonth)
      fill(body.retainer, body.currentMonth)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [companyId, fill, message])

  useEffect(() => {
    void load()
  }, [load])

  const call = async (method: 'PUT' | 'POST', payload: unknown, done: string): Promise<boolean> => {
    setBusy(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/retainer`, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed')
      message.success(done)
      if (method === 'PUT') {
        setRetainer(body.retainer)
        fill(body.retainer, currentMonth)
      } else {
        setCreated({ id: body.id, number: body.number })
        await load()
        onChanged?.()
      }
      return true
    } catch (e) {
      message.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async (v: FormValues) => call('PUT', { retainer: { ...v, startMonth: v.startMonth?.format('YYYY-MM') } }, 'Retainer saved')

  const lastMonth = retainer?.lastMonth ?? null
  const next = retainer?.active
    ? retainer.startMonth > currentMonth
      ? retainer.startMonth
      : lastMonth === currentMonth
        ? dayjs(`${currentMonth}-01`).add(1, 'month').format('YYYY-MM')
        : currentMonth
    : null

  return (
    <section className="ticket-surface billing-section" style={{ marginBottom: 16 }}>
      <header className="billing-section__head">
        <span>Monthly retainer</span>
        {retainer ? (
          <Popconfirm title="Remove the retainer?" description="Invoices already created stay." okText="Remove" onConfirm={() => void call('PUT', { retainer: null }, 'Retainer removed')}>
            <Button size="small" danger disabled={busy}>
              Remove
            </Button>
          </Popconfirm>
        ) : null}
      </header>
      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} style={{ padding: 16 }} />
      ) : (
        <div style={{ padding: '0 16px 16px' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
            A fixed fee invoiced automatically once a month (the first hourly run of the month, Jakarta time). Work beyond it is invoiced as usual. Months are
            never back-filled.
          </Text>
          <Form form={form} layout="vertical" onFinish={(v) => void save(v)} disabled={busy}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0 16px' }}>
              <Form.Item label="Amount per month" name="amount" rules={[{ required: true, message: 'Enter the monthly amount' }]}>
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  formatter={(v) => (v === undefined || v === null ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))}
                  parser={(v) => Number((v ?? '').replace(/\./g, '')) as never}
                />
              </Form.Item>
              <Form.Item label="Currency" name="currency">
                <Select options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
              <Form.Item label="First month to invoice" name="startMonth" rules={[{ required: true, message: 'Pick a month' }]}>
                <DatePicker picker="month" allowClear={false} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Due after (days)" name="dueDays">
                <InputNumber min={0} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item label="Invoice line" name="label" tooltip="Shown on the invoice, followed by the month">
              <Input maxLength={120} />
            </Form.Item>
            <Space size="large" wrap>
              <Form.Item name="active" valuePropName="checked" label="Active" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>
              <Form.Item
                name="autoSend"
                valuePropName="checked"
                label="Email the invoice automatically"
                tooltip="Sent to the company email (or its portal admins) from the connected mailbox. Off = create it only and send it yourself."
                style={{ marginBottom: 0 }}
              >
                <Switch />
              </Form.Item>
            </Space>
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={busy}>
                {retainer ? 'Save' : 'Set retainer'}
              </Button>
              {retainer ? (
                <Popconfirm
                  title={`Invoice ${monthText(currentMonth)} now?`}
                  description="Creates the invoice for this month without waiting for the scheduled run. It is not emailed."
                  okText="Create invoice"
                  onConfirm={() => void call('POST', { month: currentMonth }, 'Invoice created')}
                  disabled={lastMonth === currentMonth}
                >
                  <Button icon={<FileAddOutlined />} disabled={busy || lastMonth === currentMonth}>
                    Invoice {monthText(currentMonth)} now
                  </Button>
                </Popconfirm>
              ) : null}
              {created ? <Link href={`/invoices/${created.id}`}>Open {created.number}</Link> : null}
            </div>
            {retainer ? (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <Text type="secondary">
                  {formatMoney(retainer.amount, retainer.currency)} / month · {lastMonth ? `last invoiced ${monthText(lastMonth)}` : 'not invoiced yet'}
                  {next ? ` · next invoice ${monthText(next)}` : ' · paused'}
                </Text>
              </div>
            ) : null}
          </Form>
        </div>
      )}
    </section>
  )
}
