'use client'

import { PlusOutlined, StopOutlined } from '@ant-design/icons'
import { App, Button, Input, Table } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import RowActions from '@/components/settings/RowActions'

type SkipRow = { id: string; email: string; reason: string | null; created_at: string }

/** Settings → Email: senders whose mail is never turned into tickets (address or whole domain). */
export default function EmailSkipList() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<SkipRow[]>([])
  const [loading, setLoading] = useState(false)
  const [entry, setEntry] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email/skip-list', { credentials: 'include' })
      if (res.ok) setRows(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    if (!entry.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/email/skip-list', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: entry, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not add')
      setRows((prev) => [data as SkipRow, ...prev])
      setEntry('')
      setReason('')
      message.success(`${(data as SkipRow).email} will be ignored`)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const removeRow = async (id: string) => {
    const res = await fetch(`/api/email/skip-list?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id))
    else message.error('Could not remove')
  }

  return (
    <section className="ticket-surface billing-section">
      <header className="billing-section__head">
        <span>
          <StopOutlined /> Ignored senders
        </span>
        <span className="page-head__count">{rows.length}</span>
      </header>
      <div className="page-toolbar" style={{ margin: 12, marginBottom: 0 }}>
        <Input
          placeholder="alerts@bank.com or @facebookmail.com"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onPressEnter={() => void add()}
          style={{ width: 300 }}
        />
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} onPressEnter={() => void add()} style={{ width: 240 }} />
        <Button type="primary" icon={<PlusOutlined />} loading={adding} disabled={!entry.trim()} onClick={() => void add()}>
          Ignore
        </Button>
        <span className="cell-muted" style={{ fontSize: 12 }}>
          Mail from these senders is never turned into tickets or replies. Use <code>@domain.com</code> to ignore a whole domain.
        </span>
      </div>
      <div className="ticket-table" style={{ marginTop: 8 }}>
        <Table<SkipRow>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: 'No ignored senders' }}
          columns={[
            {
              title: 'Sender',
              dataIndex: 'email',
              render: (v: string) => (
                <span className="cell-strong">
                  {v}
                  {v.startsWith('@') ? <span className="cell-muted" style={{ fontWeight: 400 }}> · whole domain</span> : null}
                </span>
              ),
            },
            { title: 'Reason', dataIndex: 'reason', render: (v: string | null) => <span className="cell-muted">{v || '—'}</span> },
            {
              title: 'Added',
              dataIndex: 'created_at',
              width: 140,
              render: (v: string) => <span className="cell-muted">{dayjs(v).format('DD MMM YYYY')}</span>,
            },
            {
              title: '',
              key: 'actions',
              width: 60,
              align: 'right',
              render: (_, r) => <RowActions onDelete={() => removeRow(r.id)} deleteTitle={`Stop ignoring ${r.email}?`} />,
            },
          ]}
        />
      </div>
    </section>
  )
}
