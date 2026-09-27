'use client'

import {
  BellOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  MailOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Flex,
  Layout,
  message,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { shouldOpenHrefInNewTab } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import MessageTemplatePreviewModal from '@/components/message-template/MessageTemplatePreviewModal'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { APP_TABLE_PAGE_SIZE_OPTIONS } from '@/lib/app-table'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

interface MessageTemplatesContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null }; role?: string }
}

const GROUP_META: Record<
  string,
  { description: string; icon: React.ReactNode; hint?: string }
> = {
  'Agent Notification': {
    icon: <TeamOutlined />,
    description:
      'Emails and in-app notices sent to agents and staff when tickets change — assignments, replies, SLA alerts, and internal notes.',
    hint: 'Recipients are usually assignees, team members, or watchers.',
  },
  'Requester Notification': {
    icon: <MailOutlined />,
    description:
      'Messages sent to customers and requesters — new ticket confirmations, agent replies, solved/closed updates, account emails, and CC copies.',
    hint: 'Use placeholders like {{ recipient.full_name }} and {{ ticket }} for personalization.',
  },
  Templates: {
    icon: <FileTextOutlined />,
    description:
      'Default bodies loaded in the ticket composer when an agent replies or forwards — not automatic notifications.',
    hint: 'Keys template_agent_reply and template_agent_forward are wired in the ticket UI.',
  },
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export interface MessageTemplateRow {
  id: string
  type: string
  group: string
  title: string
  key: string
  status: string
  email_subject: string | null
  content: string | null
  created_at: string
  updated_at: string
}

function formatUpdatedAt(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function groupStats(rows: MessageTemplateRow[]) {
  const withBody = rows.filter((r) => r.content?.trim()).length
  const active = rows.filter((r) => r.status === 'active').length
  return { total: rows.length, withBody, empty: rows.length - withBody, active, inactive: rows.length - active }
}

function GroupTabPanel({
  group,
  rows,
  loading,
  columns,
}: {
  group: string
  rows: MessageTemplateRow[]
  loading: boolean
  columns: ColumnsType<MessageTemplateRow>
}) {
  const meta = GROUP_META[group]
  const stats = useMemo(() => groupStats(rows), [rows])

  return (
    <Card size="small" styles={{ body: { padding: 16 } }}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          icon={meta?.icon ?? <BellOutlined />}
          message={<Text strong>{group}</Text>}
          description={
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
              <span>{meta?.description ?? 'Templates in this category.'}</span>
              {meta?.hint ? (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {meta.hint}
                </Text>
              ) : null}
            </Space>
          }
        />
        <Flex wrap="wrap" gap={8}>
          <Tag>{stats.total} templates</Tag>
          <Tag color="success">{stats.active} active</Tag>
          {stats.inactive > 0 ? <Tag color="default">{stats.inactive} inactive</Tag> : null}
          <Tag color={stats.withBody > 0 ? 'processing' : 'warning'}>
            {stats.withBody} with body · {stats.empty} empty
          </Tag>
        </Flex>
        <Table<MessageTemplateRow>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: (t) => `${t} in this group` }}
          scroll={{ x: 1100 }}
          size="middle"
        />
      </Space>
    </Card>
  )
}

export default function MessageTemplatesContent({ user: currentUser }: MessageTemplatesContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<MessageTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [previewRow, setPreviewRow] = useState<MessageTemplateRow | null>(null)
  const [activeGroup, setActiveGroup] = useState<string>(() => searchParams.get('tab') ?? '')

  const groupsInOrder = useMemo(() => {
    const seen = new Set<string>()
    const order: string[] = []
    for (const r of rows) {
      const g = r.group || '—'
      if (!seen.has(g)) {
        seen.add(g)
        order.push(g)
      }
    }
    return order
  }, [rows])

  const resolvedGroup = useMemo(() => {
    if (groupsInOrder.length === 0) return ''
    if (activeGroup && groupsInOrder.includes(activeGroup)) return activeGroup
    return groupsInOrder[0]
  }, [groupsInOrder, activeGroup])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<MessageTemplateRow[]>('/api/message-templates')
      setRows(data || [])
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleStatus = async (r: MessageTemplateRow, active: boolean) => {
    const next = active ? 'active' : 'inactive'
    try {
      const updated = await apiFetch<MessageTemplateRow>(`/api/message-templates/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      message.success(active ? 'Activated' : 'Deactivated')
    } catch (e: unknown) {
      message.error((e as Error).message || 'Update failed')
    }
  }

  const columns: ColumnsType<MessageTemplateRow> = useMemo(
    () => [
      {
        title: 'Template',
        key: 'template',
        ellipsis: true,
        render: (_: unknown, r) => (
          <Space orientation="vertical" size={0} style={{ maxWidth: '100%' }}>
            <Text strong>{r.title}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.type.replace(/_/g, ' ')}
            </Text>
          </Space>
        ),
      },
      {
        title: 'Key',
        dataIndex: 'key',
        key: 'key',
        width: 280,
        ellipsis: true,
        render: (key: string) => (
          <Typography.Text code copyable={{ text: key }} ellipsis={{ tooltip: key }} style={{ fontSize: 12 }}>
            {key}
          </Typography.Text>
        ),
      },
      {
        title: 'Body',
        key: 'has_content',
        width: 100,
        align: 'center',
        render: (_: unknown, r) => {
          const len = r.content?.trim().length ?? 0
          return len > 0 ? (
            <Tag color="success">Set</Tag>
          ) : (
            <Tag color="warning">Empty</Tag>
          )
        },
      },
      {
        title: 'Updated',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 168,
        render: (v: string) => (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatUpdatedAt(v)}
          </Text>
        ),
      },
      {
        title: 'Active',
        key: 'status',
        width: 88,
        align: 'center',
        render: (_: unknown, r) => (
          <Switch
            checked={r.status === 'active'}
            onChange={(c) => void toggleStatus(r, c)}
            checkedChildren="On"
            unCheckedChildren="Off"
          />
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 200,
        fixed: 'right' as const,
        render: (_: unknown, r) => {
          const fromTab = encodeURIComponent(r.group || '')
          const editHref = `/settings/message-templates/${r.id}/edit?from_tab=${fromTab}`
          const isInactive = r.status !== 'active'
          return (
            <Space>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                disabled={isInactive}
                onClick={() => setPreviewRow(r)}
              >
                Preview
              </Button>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                disabled={isInactive}
                href={editHref}
                onClick={(e) => {
                  if (isInactive) {
                    e.preventDefault()
                    return
                  }
                  if (shouldOpenHrefInNewTab(e)) return
                  if (e.button !== 0) return
                  e.preventDefault()
                  router.push(editHref)
                }}
              >
                Edit
              </Button>
            </Space>
          )
        },
      },
    ],
    [router]
  )

  const tabItems = useMemo(
    () =>
      groupsInOrder.map((g) => {
        const groupRows = rows.filter((r) => (r.group || '—') === g)
        const count = groupRows.length
        return {
          key: g,
          label: (
            <Space size={6}>
              <span>{g}</span>
              <Tag style={{ margin: 0 }}>{count}</Tag>
            </Space>
          ),
          children: (
            <GroupTabPanel group={g} rows={groupRows} loading={loading} columns={columns} />
          ),
        }
      }),
    [groupsInOrder, rows, loading, columns]
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: 24 }}>
          <SettingsBackLink />
          <Card>
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Space align="center" style={{ marginBottom: 8 }}>
                  <FileTextOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                  <Title level={4} style={{ margin: 0 }}>
                    Message templates
                  </Title>
                </Space>
                <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 720 }}>
                  Pre-defined notification and composer templates. Edit the HTML body on each template&apos;s page;
                  toggle <Text strong>Active</Text> to enable or disable sending. Rows cannot be added or deleted — use
                  the <Text code>key</Text> column when wiring automation or email in code.
                </Paragraph>
              </div>

              {groupsInOrder.length > 0 ? (
                <Tabs
                  activeKey={resolvedGroup}
                  onChange={(g) => {
                    setActiveGroup(g)
                    router.replace(`/settings/message-templates?tab=${encodeURIComponent(g)}`, { scroll: false })
                  }}
                  items={tabItems}
                  destroyOnHidden={false}
                />
              ) : (
                <Card size="small" styles={{ body: { padding: 16 } }}>
                  <Table<MessageTemplateRow>
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={[]}
                    pagination={false}
                  />
                </Card>
              )}
            </Space>
          </Card>
        </Content>
      </AdminMainColumn>

      <MessageTemplatePreviewModal
        open={!!previewRow}
        onClose={() => setPreviewRow(null)}
        templateBody={previewRow?.content ?? ''}
        title={previewRow ? `Preview: ${previewRow.title}` : 'Preview (sample data)'}
      />
    </Layout>
  )
}
