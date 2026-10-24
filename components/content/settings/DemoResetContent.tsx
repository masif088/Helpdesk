'use client'

import { DeleteOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, Input, Layout, Spin, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import type { DemoResetPlan, DemoResetResult } from '@/lib/demo-reset'
import { DEMO_RESET_PHRASE } from '@/lib/demo-reset-plan'

const { Content } = Layout
const { Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

/** Settings -> Demo reset: empty the whole app for a fresh demo. Only for the operator account. */
export default function DemoResetContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [plan, setPlan] = useState<DemoResetPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [typed, setTyped] = useState('')
  const [withSample, setWithSample] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DemoResetResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/demo-reset', { credentials: 'include', cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load')
      setPlan(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/demo-reset', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed, withSample }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The reset failed')
      setResult(body)
      setTyped('')
      message[body.ok ? 'success' : 'warning'](body.ok ? 'Demo reset done' : 'Reset finished with problems, see the steps below')
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%', maxWidth: 900 }}>
          <SettingsPageHeader title="Demo reset" description="Put the whole app back to an empty, demo-ready state. This cannot be undone." />

          {loading || !plan ? (
            <Spin />
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              <Alert
                type="warning"
                showIcon
                message="This removes data for good"
                description="All tickets, comments, invoices and payments, the connected mailbox, every automation, every other account and company. Settings, ticket statuses and types, templates, the knowledge base and teams stay."
              />

              <section className="ticket-surface" style={{ padding: 16 }}>
                <div className="cell-strong" style={{ marginBottom: 8 }}>
                  Stays
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {plan.keepUsers.map((u) => (
                    <div key={u.email}>
                      <Tag color="green">{u.role}</Tag> {u.name || u.email} <Text type="secondary">{u.email}</Text>
                    </div>
                  ))}
                  <Text type="secondary">
                    Companies kept: {plan.keepCompanies.length ? plan.keepCompanies.join(', ') : 'none'}. Statuses, types, templates, knowledge base, teams and settings are not touched.
                  </Text>
                </div>
              </section>

              <section className="ticket-surface" style={{ padding: 16 }}>
                <div className="cell-strong" style={{ marginBottom: 8 }}>
                  Goes
                </div>
                <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                  <Text>
                    {plan.removeUsers} account{plan.removeUsers === 1 ? '' : 's'} (login included) and {plan.removeCompanies} compan{plan.removeCompanies === 1 ? 'y' : 'ies'}
                  </Text>
                  <Text>{plan.mailboxes.length ? `Mailbox released: ${plan.mailboxes.join(', ')}` : 'No mailbox is connected'}</Text>
                  <Text>All automation rules; one rule is created that opens every new ticket. Ticket numbers start again from 1.</Text>
                </div>
                <Table
                  size="small"
                  rowKey="table"
                  pagination={false}
                  dataSource={plan.rows}
                  locale={{ emptyText: 'Nothing to empty: it is already clean' }}
                  columns={[
                    { title: 'Data', dataIndex: 'table' },
                    { title: 'Rows', dataIndex: 'rows', align: 'right', width: 100 },
                  ]}
                />
              </section>

              <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 12 }}>
                <Checkbox checked={withSample} onChange={(e) => setWithSample(e.target.checked)}>
                  Add a few sample tickets for the demo (replies, a closed ticket with ratings, one low rating)
                </Checkbox>
                <label className="mt-field">
                  <span className="mt-field__label">
                    Type <b>{DEMO_RESET_PHRASE}</b> to confirm
                  </span>
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={DEMO_RESET_PHRASE} disabled={running} />
                </label>
                <div>
                  <Button danger type="primary" icon={<DeleteOutlined />} loading={running} disabled={typed.trim() !== DEMO_RESET_PHRASE} onClick={() => void run()}>
                    Reset everything
                  </Button>
                </div>
                {plan.lastReset ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Last reset: {dayjs(plan.lastReset.at).format('D MMM YYYY HH:mm')} by {plan.lastReset.by}
                  </Text>
                ) : null}
              </section>

              {result ? (
                <section className="ticket-surface" style={{ padding: 16 }}>
                  <div className="cell-strong" style={{ marginBottom: 8 }}>
                    Result
                  </div>
                  <Table
                    size="small"
                    rowKey="step"
                    pagination={false}
                    dataSource={result.steps}
                    columns={[
                      { title: 'Step', dataIndex: 'step', width: 220 },
                      { title: '', dataIndex: 'ok', width: 70, render: (ok: boolean) => <Tag color={ok ? 'green' : 'red'}>{ok ? 'ok' : 'failed'}</Tag> },
                      { title: 'Detail', dataIndex: 'detail' },
                    ]}
                  />
                </section>
              ) : null}
            </div>
          )}
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
