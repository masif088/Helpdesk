'use client'

import { Alert, App, Button, InputNumber, Layout, Modal, Popconfirm, Spin, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import KeyCallsList from '@/components/common/KeyCallsList'
import KeyUsageChart from '@/components/common/KeyUsageChart'
import McpConnectorInfo from '@/components/common/McpConnectorInfo'
import ScopeTag from '@/components/common/ScopeTag'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { type ApiKeyScope, DEFAULT_RATE_LIMIT_PER_HOUR, MAX_RATE_LIMIT_PER_HOUR } from '@/lib/api-key-core'
import type { KeyUsage } from '@/lib/api-key-usage-core'

const { Content } = Layout
const { Text, Paragraph } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

type KeyRow = {
  id: string
  name: string
  prefix: string
  scopes: ApiKeyScope[]
  rate_limit_per_hour: number
  user: { id: string; full_name: string | null; email: string; role: string; company: string | null } | null
  created_by: string | null
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  usage: KeyUsage
}

/** Settings -> API keys: the AI connections (and older keys) with their use and limits. New ones come from the MCP connector sign-in, not from here. */
export default function ApiKeysContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<KeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [limitFor, setLimitFor] = useState<{ id: string; name: string; value: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const k = await fetch('/api/api-keys', { credentials: 'include', cache: 'no-store' })
      const kb = await k.json()
      if (!k.ok) throw new Error(kb.error || 'Could not load')
      setRows(kb)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const saveLimit = async () => {
    if (!limitFor) return
    const res = await fetch(`/api/api-keys/${limitFor.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rate_limit_per_hour: limitFor.value }) })
    if (!res.ok) return message.error((await res.json().catch(() => ({}))).error || 'Could not change the limit')
    message.success('Limit changed')
    setLimitFor(null)
    await load()
  }

  const revoke = async (id: string) => {
    const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return message.error((await res.json().catch(() => ({}))).error || 'Could not revoke')
    message.success('Key revoked')
    await load()
  }

  const status = (r: KeyRow) => (r.revoked_at ? 'revoked' : r.expires_at && dayjs(r.expires_at).isBefore(dayjs()) ? 'expired' : 'active')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%', maxWidth: 1100 }}>
          <SettingsPageHeader
            title="API keys"
            description="AI assistants connect through MCP and sign in, so no key is made or pasted. Their connections, and older keys, are listed here."
            count={`${rows.filter((r) => status(r) === 'active').length} active`}
          />

          <div style={{ display: 'grid', gap: 16 }}>
            <Alert
              type="info"
              showIcon
              message="A connection acts as the person who signed in"
              description="A customer contact sees only their own company's tickets and can only reply. A staff user sees what they see, and comments from an assistant are internal notes unless the request asks for a reply. Everything it makes is marked “API · Connector · <assistant>”. Revoke a connection and it stops at once."
            />

            {loading ? (
              <Spin />
            ) : (
              <Table
                size="small"
                rowKey="id"
                dataSource={rows}
                pagination={false}
                locale={{ emptyText: 'No keys yet' }}
                expandable={{
                  expandedRowRender: (r: KeyRow) => (
                    <div style={{ display: 'grid', gap: 16 }}>
                      <KeyUsageChart usage={r.usage} />
                      <KeyCallsList url={`/api/api-keys/${r.id}/calls`} />
                    </div>
                  ),
                  rowExpandable: () => true,
                }}
                columns={[
                  {
                    title: 'Name',
                    render: (_: unknown, r: KeyRow) => (
                      <div>
                        <div className="cell-strong">{r.name}</div>
                        <Text type="secondary" code style={{ fontSize: 12 }}>
                          {r.prefix}…
                        </Text>
                      </div>
                    ),
                  },
                  {
                    title: 'Acts as',
                    render: (_: unknown, r: KeyRow) =>
                      r.user ? (
                        <div>
                          {r.user.full_name || r.user.email} <Tag>{r.user.role}</Tag>
                          {r.user.company ? <div><Text type="secondary" style={{ fontSize: 12 }}>{r.user.company}</Text></div> : null}
                        </div>
                      ) : (
                        <Text type="secondary">user removed</Text>
                      ),
                  },
                  { title: 'Can', render: (_: unknown, r: KeyRow) => r.scopes.map((s) => <ScopeTag key={s} scope={s} />) },
                  {
                    title: 'Limit / hour',
                    width: 110,
                    render: (_: unknown, r: KeyRow) => (
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setLimitFor({ id: r.id, name: r.name, value: r.rate_limit_per_hour })}>
                        {r.rate_limit_per_hour}
                      </Button>
                    ),
                  },
                  {
                    title: 'Calls 7d / 30d',
                    width: 120,
                    render: (_: unknown, r: KeyRow) => (
                      <span>
                        {r.usage.calls7d} / {r.usage.calls30d}
                        {r.usage.limited30d ? <Tag color="orange" style={{ marginLeft: 6 }}>limit hit</Tag> : null}
                      </span>
                    ),
                  },
                  { title: 'Last used', render: (_: unknown, r: KeyRow) => (r.last_used_at ? dayjs(r.last_used_at).format('D MMM YYYY HH:mm') : <Text type="secondary">never</Text>) },
                  { title: 'Expires', render: (_: unknown, r: KeyRow) => (r.expires_at ? dayjs(r.expires_at).format('D MMM YYYY') : <Text type="secondary">no expiry</Text>) },
                  {
                    title: 'Status',
                    width: 90,
                    render: (_: unknown, r: KeyRow) => {
                      const s = status(r)
                      return <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag>
                    },
                  },
                  {
                    title: '',
                    width: 90,
                    render: (_: unknown, r: KeyRow) =>
                      status(r) === 'active' ? (
                        <Popconfirm title="Revoke this key?" description="Whoever uses it stops working straight away." okText="Revoke" okButtonProps={{ danger: true }} onConfirm={() => void revoke(r.id)}>
                          <Button size="small" danger>
                            Revoke
                          </Button>
                        </Popconfirm>
                      ) : null,
                  },
                ]}
              />
            )}

            <section className="ticket-surface" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <McpConnectorInfo />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Step by step guide: <a href="/settings/api-keys/tutorial">Tutorial</a>. Try calls: <a href="/settings/api-keys/builder">API builder</a>. A key that is wrong, revoked, expired or lacks the scope for a call answers 401; any other endpoint answers 403.
              </Text>
            </section>
          </div>

          <Modal title={`Calls per hour: ${limitFor?.name ?? ''}`} open={!!limitFor} onCancel={() => setLimitFor(null)} onOk={() => void saveLimit()} okText="Save" destroyOnHidden>
            <InputNumber min={1} max={MAX_RATE_LIMIT_PER_HOUR} value={limitFor?.value} onChange={(v) => setLimitFor((s) => (s ? { ...s, value: Number(v) || DEFAULT_RATE_LIMIT_PER_HOUR } : s))} style={{ width: 160 }} />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              The default is {DEFAULT_RATE_LIMIT_PER_HOUR}. The count is kept in memory, so it starts again from zero when the app restarts.
            </Paragraph>
          </Modal>

        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
