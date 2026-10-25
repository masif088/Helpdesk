'use client'

import { CopyOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { API_KEY_SCOPE_LABELS, API_KEY_SCOPES, type ApiKeyScope, DEFAULT_RATE_LIMIT_PER_HOUR, MAX_ACTIVE_SELF_KEYS, SELF_KEY_DAYS } from '@/lib/api-key-core'

const { Text, Title } = Typography

type MyKey = {
  id: string
  name: string
  prefix: string
  scopes: ApiKeyScope[]
  rate_limit_per_hour: number
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
}

/** Profile -> your own API keys: lets your AI or a script read, create and comment on tickets as you. */
export default function MyApiKeys() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<MyKey[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/profile/api-keys', { credentials: 'include', cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load')
      setRows(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (values: { name: string; scopes: ApiKeyScope[] }) => {
    setSaving(true)
    try {
      const res = await fetch('/api/profile/api-keys', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
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
    const res = await fetch(`/api/profile/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) return message.error((await res.json().catch(() => ({}))).error || 'Could not revoke')
    message.success('Key revoked')
    await load()
  }

  const status = (r: MyKey) => (r.revoked_at ? 'revoked' : r.expires_at && dayjs(r.expires_at).isBefore(dayjs()) ? 'expired' : 'active')

  return (
    <Card style={{ marginTop: 24 }}>
      <Title level={3}>
        <KeyOutlined /> API keys for your AI
      </Title>
      <Text type="secondary">
        A key lets your AI assistant or a script read, create and comment on tickets <b>as you</b>: it sees what you see. Each key lasts {SELF_KEY_DAYS} days and allows {DEFAULT_RATE_LIMIT_PER_HOUR} calls per hour;
        make a new one when it expires. Need more? Ask an admin. <Link href="/profile/api-tutorial">How to use it, and a skill file for your AI</Link>
      </Text>

      <div style={{ margin: '16px 0' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} disabled={rows.filter((r) => status(r) === 'active').length >= MAX_ACTIVE_SELF_KEYS}>
          New key
        </Button>
      </div>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'No keys yet' }}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'Name',
            render: (_: unknown, r: MyKey) => (
              <div>
                <div className="cell-strong">{r.name}</div>
                <Text type="secondary" code style={{ fontSize: 12 }}>
                  {r.prefix}…
                </Text>
              </div>
            ),
          },
          { title: 'Can', render: (_: unknown, r: MyKey) => r.scopes.map((s) => <Tag key={s}>{s}</Tag>) },
          { title: 'Last used', render: (_: unknown, r: MyKey) => (r.last_used_at ? dayjs(r.last_used_at).format('D MMM YYYY HH:mm') : <Text type="secondary">never</Text>) },
          { title: 'Expires', render: (_: unknown, r: MyKey) => (r.expires_at ? dayjs(r.expires_at).format('D MMM YYYY') : <Text type="secondary">no expiry</Text>) },
          {
            title: 'Status',
            render: (_: unknown, r: MyKey) => {
              const s = status(r)
              return <Tag color={s === 'active' ? 'green' : 'default'}>{s}</Tag>
            },
          },
          {
            title: '',
            render: (_: unknown, r: MyKey) =>
              status(r) === 'active' ? (
                <Popconfirm title="Revoke this key?" description="Whatever uses it stops working straight away." okText="Revoke" okButtonProps={{ danger: true }} onConfirm={() => void revoke(r.id)}>
                  <Button size="small" danger>
                    Revoke
                  </Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />

      <Modal title="New API key" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Create key" confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ scopes: ['tickets:read', 'tickets:create', 'comments:create'] }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} extra="Shown on every ticket and comment made with this key, e.g. “Claude (my laptop)”.">
            <Input maxLength={80} placeholder="Claude (my laptop)" />
          </Form.Item>
          <Form.Item name="scopes" label="Allowed" extra="Give only what the tool needs.">
            <Checkbox.Group style={{ display: 'grid', gap: 6 }} options={API_KEY_SCOPES.map((s) => ({ value: s, label: API_KEY_SCOPE_LABELS[s] }))} />
          </Form.Item>
          <Text type="secondary">Lasts {SELF_KEY_DAYS} days, {DEFAULT_RATE_LIMIT_PER_HOUR} calls per hour.</Text>
        </Form>
      </Modal>

      <Modal title={`Key for ${created?.name ?? ''}`} open={!!created} onCancel={() => setCreated(null)} footer={<Button type="primary" onClick={() => setCreated(null)}>Done</Button>} maskClosable={false}>
        <Alert type="warning" showIcon message="Copy it now" description="This is the only time the key is shown. If it is lost, revoke it and make a new one. Keep it private: whoever has it can act as you." style={{ marginBottom: 12 }} />
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
    </Card>
  )
}
