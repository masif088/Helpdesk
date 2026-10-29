'use client'

import { CopyOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Layout, Modal, Popconfirm, Select, Spin, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { API_KEY_SCOPE_LABELS, API_KEY_SCOPES, type ApiKeyScope, DEFAULT_RATE_LIMIT_PER_HOUR, MAX_RATE_LIMIT_PER_HOUR } from '@/lib/api-key-core'

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
}

type UserOption = { id: string; email: string; full_name: string | null; role: string; status: string | null; company: { name: string } | null }

/** Settings -> API keys: keys that let an outside tool (e.g. a customer's AI) read, create and comment on tickets. */
export default function ApiKeysContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<KeyRow[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [limitFor, setLimitFor] = useState<{ id: string; name: string; value: number } | null>(null)
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [k, u] = await Promise.all([
        fetch('/api/api-keys', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/users', { credentials: 'include', cache: 'no-store' }),
      ])
      const kb = await k.json()
      if (!k.ok) throw new Error(kb.error || 'Could not load')
      setRows(kb)
      if (u.ok) setUsers(await u.json())
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const userOptions = useMemo(
    () =>
      users
        .filter((u) => (u.status ?? 'active') === 'active')
        .map((u) => ({
          value: u.id,
          label: `${u.full_name || u.email} · ${u.role}${u.company ? ` · ${u.company.name}` : ''}`,
          search: `${u.full_name ?? ''} ${u.email} ${u.company?.name ?? ''}`.toLowerCase(),
        })),
    [users]
  )

  const saveLimit = async () => {
    if (!limitFor) return
    const res = await fetch(`/api/api-keys/${limitFor.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rate_limit_per_hour: limitFor.value }) })
    if (!res.ok) return message.error((await res.json().catch(() => ({}))).error || 'Could not change the limit')
    message.success('Limit changed')
    setLimitFor(null)
    await load()
  }

  const submit = async (values: { name: string; user_id: string; scopes: ApiKeyScope[]; rate_limit_per_hour: number | null; expires_in_days: number | null }) => {
    setSaving(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not create the key')
      setOpen(false)
      form.resetFields()
      setCreated({ key: body.key, name: body.name })
      await load()
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (id: string) => {
    const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return message.error((await res.json().catch(() => ({}))).error || 'Could not revoke')
    message.success('Key revoked')
    await load()
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-portal'
  const status = (r: KeyRow) => (r.revoked_at ? 'revoked' : r.expires_at && dayjs(r.expires_at).isBefore(dayjs()) ? 'expired' : 'active')

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%', maxWidth: 1100 }}>
          <SettingsPageHeader
            title="API keys"
            description="Let an outside tool, such as a customer's AI, read tickets, create tickets and add comments."
            count={`${rows.filter((r) => status(r) === 'active').length} active`}
            actions={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                New key
              </Button>
            }
          />

          <div style={{ display: 'grid', gap: 16 }}>
            <Alert
              type="info"
              showIcon
              message="A key acts as one user"
              description="Pick the user the key works as. A customer contact sees only their own company's tickets and can only reply. A staff user sees what that person sees, and comments from a key are internal notes unless the request asks for a reply. Everything made with a key is marked with the key's name."
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
                  { title: 'Can', render: (_: unknown, r: KeyRow) => r.scopes.map((s) => <Tag key={s}>{s}</Tag>) },
                  {
                    title: 'Limit / hour',
                    width: 110,
                    render: (_: unknown, r: KeyRow) => (
                      <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setLimitFor({ id: r.id, name: r.name, value: r.rate_limit_per_hour })}>
                        {r.rate_limit_per_hour}
                      </Button>
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
              <div className="cell-strong">How the other side uses it</div>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                Send the key as <Text code>Authorization: Bearer &lt;key&gt;</Text>. Create a ticket, comment, read:
              </Paragraph>
              <pre style={{ margin: 0, padding: 12, overflow: 'auto', fontSize: 12, background: 'var(--ant-color-fill-quaternary, #f5f5f5)', borderRadius: 6 }}>{`# what can be chosen (types, teams, statuses)
curl ${origin}/api/tickets/lookup -H "Authorization: Bearer $KEY"

# create a ticket
curl -X POST ${origin}/api/tickets -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"title":"Printer is down","description":"<p>Floor 2</p>","type_id":1}'

# comment on ticket 123
curl -X POST ${origin}/api/tickets/123/comments -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d '{"comment":"<p>Still happening after restart</p>"}'

# list tickets / read ticket 123 with its comments
curl "${origin}/api/tickets?limit=20" -H "Authorization: Bearer $KEY"
curl ${origin}/api/tickets/123/detail -H "Authorization: Bearer $KEY"`}</pre>
              <Text type="secondary" style={{ fontSize: 12 }}>
                A key that is wrong, revoked, expired or lacks the scope for a call answers 401; any other endpoint answers 403. Step by step guide and the AI skill: <a href="/settings/api-keys/tutorial">Tutorial</a>. Build and try calls: <a href="/settings/api-keys/builder">API builder</a>.
              </Text>
            </section>
          </div>

          <Modal title="New API key" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Create key" confirmLoading={saving} destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={submit} initialValues={{ scopes: ['tickets:read', 'tickets:create', 'comments:create'], rate_limit_per_hour: DEFAULT_RATE_LIMIT_PER_HOUR, expires_in_days: 365 }}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} extra="Shown on every ticket and comment made with this key, e.g. “Claude (Acme)”.">
                <Input maxLength={80} placeholder="Claude (Acme)" />
              </Form.Item>
              <Form.Item name="user_id" label="Acts as" rules={[{ required: true, message: 'Choose a user' }]} extra="For a customer's AI, pick that customer's contact: the key then sees only their company.">
                <Select showSearch options={userOptions} optionFilterProp="search" filterOption={(input, o) => (o as { search?: string } | undefined)?.search?.includes(input.toLowerCase()) ?? false} placeholder="Search by name, email or company" />
              </Form.Item>
              <Form.Item name="scopes" label="Allowed">
                <Checkbox.Group style={{ display: 'grid', gap: 6 }} options={API_KEY_SCOPES.map((s) => ({ value: s, label: API_KEY_SCOPE_LABELS[s] }))} />
              </Form.Item>
              <Form.Item name="rate_limit_per_hour" label="Calls per hour" extra="More than this answers 429 until the hour has room again. Can be changed later.">
                <InputNumber min={1} max={MAX_RATE_LIMIT_PER_HOUR} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="expires_in_days" label="Expires after (days)" extra="Leave empty for no expiry.">
                <InputNumber min={1} max={3650} style={{ width: 160 }} />
              </Form.Item>
            </Form>
          </Modal>

          <Modal title={`Calls per hour: ${limitFor?.name ?? ''}`} open={!!limitFor} onCancel={() => setLimitFor(null)} onOk={() => void saveLimit()} okText="Save" destroyOnHidden>
            <InputNumber min={1} max={MAX_RATE_LIMIT_PER_HOUR} value={limitFor?.value} onChange={(v) => setLimitFor((s) => (s ? { ...s, value: Number(v) || DEFAULT_RATE_LIMIT_PER_HOUR } : s))} style={{ width: 160 }} />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              The default is {DEFAULT_RATE_LIMIT_PER_HOUR}. The count is kept in memory, so it starts again from zero when the app restarts.
            </Paragraph>
          </Modal>

          <Modal
            title={`Key for ${created?.name ?? ''}`}
            open={!!created}
            onCancel={() => setCreated(null)}
            footer={<Button type="primary" onClick={() => setCreated(null)}>Done</Button>}
            maskClosable={false}
          >
            <Alert type="warning" showIcon message="Copy it now" description="This is the only time the key is shown. If it is lost, revoke it and make a new one." style={{ marginBottom: 12 }} />
            <Input.Search
              readOnly
              value={created?.key}
              enterButton={<CopyOutlined />}
              onSearch={() => {
                void navigator.clipboard.writeText(created?.key ?? '')
                message.success('Copied')
              }}
            />
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
