'use client'

import { DeleteOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, Input, Layout, Spin, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import type { BaselineInfo } from '@/lib/demo-baseline'
import type { DemoResetPlan, DemoResetResult } from '@/lib/demo-reset'
import { BASELINE_RESTORE_PHRASE, BASELINE_SAVE_PHRASE, DEMO_RESET_GUARD, DEMO_RESET_PHRASE } from '@/lib/demo-reset-plan'

const { Content } = Layout
const { Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

/** Settings -> Demo reset: empty the whole app for a fresh demo. Only for the operator account. */
export default function DemoResetContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [plan, setPlan] = useState<(DemoResetPlan & { baseline: BaselineInfo | null; unlocked: boolean }) | null>(null)
  const [saveTyped, setSaveTyped] = useState('')
  const [restoreTyped, setRestoreTyped] = useState('')
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

  const run = async (action?: 'save-baseline' | 'restore-baseline') => {
    setRunning(true)
    setResult(null)
    try {
      const confirm = action === 'save-baseline' ? saveTyped : action === 'restore-baseline' ? restoreTyped : typed
      const res = await fetch('/api/demo-reset', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, confirm, withSample }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'It failed')
      setTyped('')
      setSaveTyped('')
      setRestoreTyped('')
      if (action === 'save-baseline') {
        message.success('Rollback point saved')
      } else {
        setResult(body)
        message[body.ok ? 'success' : 'warning'](body.ok ? (action ? 'Restored to the rollback point' : 'Demo reset done') : 'Finished with problems, see the steps below')
      }
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
              {plan.unlocked ? (
                <Alert type="success" showIcon message="Unlocked" description="The next reset, restore or save will run, then the switch turns itself off again." />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message="Locked"
                  description={
                    <>
                      Nothing on this page can run until you unlock it by hand in the database: Firebase Console → Firestore → collection{' '}
                      <code>{DEMO_RESET_GUARD.collection}</code> → document <code>{DEMO_RESET_GUARD.doc}</code> → field{' '}
                      <code>{DEMO_RESET_GUARD.field}</code> (boolean) = <code>true</code>. It locks itself again after one use. Reload this page after unlocking.
                    </>
                  }
                />
              )}
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
                  <Button danger type="primary" icon={<DeleteOutlined />} loading={running} disabled={!plan.unlocked || typed.trim() !== DEMO_RESET_PHRASE} onClick={() => void run()}>
                    Reset everything
                  </Button>
                </div>
                {plan.lastReset ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Last reset: {dayjs(plan.lastReset.at).format('D MMM YYYY HH:mm')} by {plan.lastReset.by}
                  </Text>
                ) : null}
              </section>

              <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div className="cell-strong">Rollback point</div>
                <Text type="secondary">
                  A copy of ALL data (tickets, accounts, companies, settings, everything) that you can put back later. Set it up the way the demo should start, save it, then restore it
                  after every demo instead of resetting to empty. Sign-in passwords are not part of the copy.
                </Text>
                {plan.baseline ? (
                  <Text>
                    Saved {dayjs(plan.baseline.savedAt).format('D MMM YYYY HH:mm')} by {plan.baseline.savedBy}: {Object.values(plan.baseline.collections).reduce((n, v) => n + v, 0)} documents, {plan.baseline.accounts} accounts
                  </Text>
                ) : (
                  <Text type="warning">No rollback point saved yet.</Text>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Input style={{ width: 220 }} value={saveTyped} onChange={(e) => setSaveTyped(e.target.value)} placeholder={BASELINE_SAVE_PHRASE} disabled={running} />
                  <Button loading={running} disabled={!plan.unlocked || saveTyped.trim() !== BASELINE_SAVE_PHRASE} onClick={() => void run('save-baseline')}>
                    Save current state as rollback point
                  </Button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Input style={{ width: 220 }} value={restoreTyped} onChange={(e) => setRestoreTyped(e.target.value)} placeholder={BASELINE_RESTORE_PHRASE} disabled={running || !plan.baseline} />
                  <Button danger loading={running} disabled={!plan.unlocked || !plan.baseline || restoreTyped.trim() !== BASELINE_RESTORE_PHRASE} onClick={() => void run('restore-baseline')}>
                    Restore the rollback point
                  </Button>
                </div>
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
