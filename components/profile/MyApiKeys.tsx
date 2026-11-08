'use client'

import { KeyOutlined } from '@ant-design/icons'
import { App, Button, Card, Popconfirm, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import KeyCallsList from '@/components/common/KeyCallsList'
import KeyUsageChart from '@/components/common/KeyUsageChart'
import McpConnectorInfo from '@/components/common/McpConnectorInfo'
import ScopeTag from '@/components/common/ScopeTag'
import type { ApiKeyScope } from '@/lib/api-key-core'
import type { KeyUsage } from '@/lib/api-key-usage-core'

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
  usage: KeyUsage
}

/** Profile -> your AI connections (and older keys). New ones come from the MCP connector sign-in. */
export default function MyApiKeys() {
  const { message } = App.useApp()
  const [rows, setRows] = useState<MyKey[]>([])
  const [loading, setLoading] = useState(true)

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
        <KeyOutlined /> Your AI assistants
      </Title>
      <div style={{ margin: '12px 0 20px' }}>
        <McpConnectorInfo />
      </div>
      <Text type="secondary">
        Connections you made, and older keys. An assistant sees what you see. <Link href="/profile/api-tutorial">Tutorial</Link> · <Link href="/profile/api-builder">API builder</Link>
      </Text>

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'No connections yet' }}
        scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: (r: MyKey) => (
            <div style={{ display: 'grid', gap: 16 }}>
              <KeyUsageChart usage={r.usage} />
              <KeyCallsList url={`/api/profile/api-keys/${r.id}/calls`} />
            </div>
          ),
          rowExpandable: () => true,
        }}
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
          { title: 'Can', render: (_: unknown, r: MyKey) => r.scopes.map((s) => <ScopeTag key={s} scope={s} />) },
          { title: 'Calls 7d / 30d', render: (_: unknown, r: MyKey) => `${r.usage.calls7d} / ${r.usage.calls30d}` },
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

    </Card>
  )
}
