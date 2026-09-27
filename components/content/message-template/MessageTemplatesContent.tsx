'use client'

import { BellOutlined, EditOutlined, EyeOutlined, FileTextOutlined, MailOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Flex, Layout, message, Space, Switch, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { shouldOpenHrefInNewTab } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import MessageTemplatePreviewModal from '@/components/message-template/MessageTemplatePreviewModal'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { APP_TABLE_PAGE_SIZE_OPTIONS } from '@/lib/app-table'
import { MESSAGE_TEMPLATE_KEYS } from '@/lib/message-template-keys'

const { Content } = Layout

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
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <div className="mt-group-info">
        <span className="mt-group-info__icon">{meta?.icon ?? <BellOutlined />}</span>
        <div className="mt-group-info__text">
          <div className="cell-strong">{meta?.description ?? 'Templates in this category.'}</div>
          {meta?.hint ? <div className="cell-muted" style={{ fontSize: 12 }}>{meta.hint}</div> : null}
        </div>
        <Flex wrap="wrap" gap={6} className="mt-group-info__stats">
          <StatusPill color="#16A34A" title={`${stats.active} active`} />
          {stats.inactive > 0 ? <StatusPill color="#94A3B8" title={`${stats.inactive} off`} /> : null}
          {stats.empty > 0 ? <StatusPill color="#D97706" title={`${stats.empty} empty`} /> : null}
        </Flex>
      </div>
      <div className="ticket-surface ticket-table">
        <Table<MessageTemplateRow>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: (t) => `${t} in this group` }}
          scroll={{ x: 960 }}
        />
      </div>
    </Space>
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

  /** Keys the app sends that have no template row (their emails are skipped) */
  const missingKeys = useMemo(() => {
    const have = new Set(rows.map((r) => r.key))
    return MESSAGE_TEMPLATE_KEYS.filter((k) => !have.has(k))
  }, [rows])
  const [creatingDefaults, setCreatingDefaults] = useState(false)
  const createDefaults = async () => {
    setCreatingDefaults(true)
    try {
      const res = await apiFetch<{ created: string[] }>('/api/message-templates', { method: 'POST' })
      message.success(res.created.length ? `Created ${res.created.length} templates` : 'All default templates already exist')
      await load()
    } catch (e) {
      message.error((e as Error).message || 'Could not create templates')
    } finally {
      setCreatingDefaults(false)
    }
  }

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
          <span style={{ display: 'inline-flex', flexDirection: 'column', maxWidth: '100%' }}>
            <span className="cell-strong">{r.title}</span>
            <span className="cell-muted" style={{ fontSize: 12 }}>{r.type.replace(/_/g, ' ')}</span>
          </span>
        ),
      },
      {
        title: 'Key',
        dataIndex: 'key',
        key: 'key',
        width: 280,
        ellipsis: true,
        render: (key: string) => (
          <Typography.Text className="cell-muted" copyable={{ text: key, tooltips: ['Copy key', 'Copied'] }} ellipsis={{ tooltip: key }} style={{ fontSize: 12 }}>
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
          return len > 0 ? <StatusPill color="#16A34A" title="Set" /> : <StatusPill color="#D97706" title="Empty" />
        },
      },
      {
        title: 'Updated',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 168,
        render: (v: string) => (
          <span className="cell-muted" style={{ fontSize: 12 }}>{formatUpdatedAt(v)}</span>
        ),
      },
      {
        title: 'Active',
        key: 'status',
        width: 88,
        align: 'center',
        render: (_: unknown, r) => (
          <Switch size="small" checked={r.status === 'active'} onChange={(c) => void toggleStatus(r, c)} />
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 90,
        align: 'right' as const,
        render: (_: unknown, r) => {
          const fromTab = encodeURIComponent(r.group || '')
          const editHref = `/settings/message-templates/${r.id}/edit?from_tab=${fromTab}`
          const isInactive = r.status !== 'active'
          return (
            <span className="row-actions">
              <Tooltip title="Preview">
                <Button type="text" size="small" icon={<EyeOutlined />} disabled={isInactive} onClick={() => setPreviewRow(r)} aria-label="Preview" />
              </Tooltip>
              <Tooltip title="Edit">
              <Button
                type="text"
                size="small"
                aria-label="Edit"
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
              />
              </Tooltip>
            </span>
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
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Message templates"
            description="Notification emails and reply templates. Toggle a template to enable or disable sending; the key is what code and automations refer to."
            count={`${rows.length} templates`}
            actions={
              missingKeys.length > 0 && rows.length > 0 ? (
                <Tooltip title={`Missing: ${missingKeys.join(', ')}`}>
                  <Button loading={creatingDefaults} onClick={() => void createDefaults()}>
                    Add {missingKeys.length} missing default{missingKeys.length > 1 ? 's' : ''}
                  </Button>
                </Tooltip>
              ) : undefined
            }
          />
          <div>
              {groupsInOrder.length > 0 ? (
                <Tabs
                  activeKey={resolvedGroup}
                  onChange={(g) => {
                    setActiveGroup(g)
                    router.replace(`/settings/message-templates?tab=${encodeURIComponent(g)}`, { scroll: false })
                  }}
                  items={tabItems}
                  destroyOnHidden={false}
                  className="company-tabs"
                />
              ) : (
                <div className="tpl-empty">
                  <FileTextOutlined />
                  <div>{loading ? 'Loading templates…' : 'No message templates yet — notification emails are not sent until they exist.'}</div>
                  {!loading ? (
                    <Button type="primary" loading={creatingDefaults} onClick={() => void createDefaults()}>
                      Create default templates
                    </Button>
                  ) : null}
                </div>
              )}
          </div>
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
