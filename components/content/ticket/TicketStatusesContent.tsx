'use client'

import { PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Layout, message, Modal, Space, Switch, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'

import { KanbanTagPreview } from '@/components/common/KanbanTagPreview'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import RowActions from '@/components/settings/RowActions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { Chip, StatusPill } from '@/components/ticket/list/TicketChips'
import { isLockedTicketStatusSlug } from '@/lib/ticket-status-locked-slugs'

const { Content } = Layout

interface TicketStatusesContentProps {
  user: { id: string; email?: string | null; name?: string | null; user_metadata?: { full_name?: string | null } }
}

interface TicketStatusRecord {
  id: number
  slug: string
  title: string
  customer_title?: string
  description?: string
  color: string
  show_in_kanban: boolean
  /** Selected by default in an agent's ticket filter */
  agent_default_filter?: boolean
  /** Selected by default in a client's ticket filter */
  customer_default_filter?: boolean
  /** The ball is with the client (waiting for their reply or approval) */
  ball_with_client?: boolean
  /** When false, row is protected (seeded); delete is disabled in UI and API. */
  is_deletable?: boolean
  /** When false, inactive — hidden from ticket status pickers / default kanban. */
  is_active?: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function ColorPickerWithInput({
  value,
  onChange,
  ...rest
}: {
  value?: string
  onChange?: (v: string) => void
} & React.ComponentProps<typeof Input>) {
  const hex = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#1890ff'
  return (
    <Space align="center" style={{ width: '100%' }}>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: 40,
          height: 32,
          padding: 2,
          cursor: 'pointer',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
        }}
      />
      <Input
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#1890ff"
        style={{ width: 120 }}
        {...rest}
      />
    </Space>
  )
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

export default function TicketStatusesContent({ user: currentUser }: TicketStatusesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [statuses, setStatuses] = useState<TicketStatusRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingStatus, setEditingStatus] = useState<TicketStatusRecord | null>(null)
  const [form] = Form.useForm()
  const previewColor = Form.useWatch('color', form)
  const previewTitle = Form.useWatch('title', form)

  const fetchStatuses = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<TicketStatusRecord[]>('/api/ticket-statuses')
      setStatuses(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch statuses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatuses()
  }, [])

  const handleCreate = () => {
    setEditingStatus(null)
    form.resetFields()
    form.setFieldsValue({
      show_in_kanban: true,
      agent_default_filter: true,
      customer_default_filter: true,
      ball_with_client: false,
      is_deletable: true,
      is_active: true,
      sort_order: (statuses.length > 0 ? Math.max(...statuses.map((s) => s.sort_order)) : 0) + 1,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TicketStatusRecord) => {
    setEditingStatus(record)
    form.setFieldsValue({
      title: record.title,
      slug: record.slug,
      customer_title: record.customer_title ?? '',
      description: record.description ?? '',
      color: record.color,
      show_in_kanban: record.show_in_kanban,
      agent_default_filter: record.agent_default_filter === true,
      customer_default_filter: record.customer_default_filter === true,
      ball_with_client: record.ball_with_client === true,
      is_deletable: record.is_deletable === true,
      is_active: record.is_active !== false,
      sort_order: record.sort_order,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/ticket-statuses/${id}`, { method: 'DELETE' })
      message.success('Status deleted')
      fetchStatuses()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete status')
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editingStatus && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        title: String(values.title || '').trim(),
        slug: String(values.slug || '').trim().toLowerCase().replace(/\s+/g, '_'),
        customer_title: (values.customer_title as string)?.trim() || null,
        description: (values.description as string)?.trim() ?? '',
        color: (values.color as string) || '#8c8c8c',
        show_in_kanban: editingStatus
          ? Boolean(values.show_in_kanban)
          : !!(values.show_in_kanban ?? true),
        agent_default_filter: Boolean(values.agent_default_filter),
        customer_default_filter: Boolean(values.customer_default_filter),
        ball_with_client: Boolean(values.ball_with_client),
        is_deletable: values.is_deletable !== false,
        is_active: values.is_active !== false,
        sort_order: Number(values.sort_order) ?? 0,
      }

      if (editingStatus) {
        await apiFetch(`/api/ticket-statuses/${editingStatus.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Status updated')
      } else {
        await apiFetch('/api/ticket-statuses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Status created')
      }

      setModalVisible(false)
      form.resetFields()
      fetchStatuses()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save status')
    }
  }

  const columns: ColumnsType<TicketStatusRecord> = [
    {
      title: '#',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 64,
      sorter: (a, b) => a.sort_order - b.sort_order,
      render: (v: number) => <span className="cell-order">{v}</span>,
    },
    {
      title: 'Status',
      key: 'title',
      width: 220,
      render: (_, r) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <StatusPill color={r.color} title={r.title} />
          <span className="cell-muted" style={{ fontSize: 11 }}>{r.slug}</span>
        </span>
      ),
    },
    {
      title: 'Customer sees',
      dataIndex: 'customer_title',
      key: 'customer_title',
      width: 220,
      render: (v: string) => (v ? <span className="cell-strong">{v}</span> : <span className="cell-muted">Same as title</span>),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string) => <span className="cell-muted">{v || '—'}</span>,
    },
    {
      title: 'Default filter',
      key: 'default_filter',
      width: 190,
      render: (_: unknown, r: TicketStatusRecord) =>
        r.agent_default_filter || r.customer_default_filter || r.ball_with_client ? (
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {r.agent_default_filter ? <Chip color="#0F9D8A">Agent</Chip> : null}
            {r.customer_default_filter ? <Chip color="#2563EB">Client</Chip> : null}
            {r.ball_with_client ? <Chip color="#D97706">Ball: client</Chip> : null}
          </span>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
    {
      title: 'State',
      key: 'is_active',
      width: 110,
      render: (_: unknown, r: TicketStatusRecord) =>
        r.is_active !== false ? <StatusPill color="#16A34A" title="Active" /> : <StatusPill color="#94A3B8" title="Inactive" />,
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_, record) => (
        <RowActions
          onEdit={() => handleEdit(record)}
          onDelete={() => handleDelete(record.id)}
          deleteTitle="Delete this status?"
          deleteDescription="Tickets using this status keep the value; reassign them first."
          deleteDisabledReason={
            record.is_deletable === true && !isLockedTicketStatusSlug(record.slug) ? undefined : 'Built-in status — cannot be deleted'
          }
        />
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Ticket statuses"
            description="Workflow states, which are selected by default in the ticket filter, and what customers see"
            count={`${statuses.length} statuses`}
            actions={
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add status
              </Button>
            }
          />
          <div className="ticket-surface ticket-table">
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={statuses}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: 900 }}
            />
          </div>

          <Modal
            title={editingStatus ? 'Edit Status' : 'Add Status'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={760}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', columnGap: 16 }}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. In Progress" onChange={handleTitleChange} />
              </Form.Item>
              <Form.Item name="customer_title" label="Customer Title">
                <Input placeholder="e.g. In Progress (shown to customer)" />
              </Form.Item>
              <Form.Item name="description" label="Description" style={{ gridColumn: '1 / -1' }}>
                <Input.TextArea rows={3} placeholder="Description of this status" />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique, used in DB)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. in_progress" disabled={!!editingStatus} />
              </Form.Item>
              <Form.Item name="sort_order" label="Sort order" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="color" label="Color (hex)" initialValue="#1890ff">
                <ColorPickerWithInput />
              </Form.Item>
              <Form.Item label="Tag preview">
                <KanbanTagPreview
                  colorHex={previewColor}
                  name={previewTitle ?? undefined}
                  fallbackHex="#1890ff"
                  emptyLabel="Status preview"
                />
              </Form.Item>
              <Form.Item name="show_in_kanban" label="Show in Kanban" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item
                name="agent_default_filter"
                label="Selected by default for agents"
                valuePropName="checked"
                tooltip="Agents open the ticket list with the statuses switched on here already selected (they can change it)."
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="customer_default_filter"
                label="Selected by default for clients"
                valuePropName="checked"
                tooltip="Clients open their ticket list with the statuses switched on here already selected (they can change it). Keep it on for statuses a client always wants to see."
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="ball_with_client"
                label="Ball is with the client"
                valuePropName="checked"
                tooltip="The team is waiting for the client (a reply, an approval). Counted as 'Waiting on client' in Reports → Workload and on the dashboards."
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="is_active"
                label="Active"
                valuePropName="checked"
                tooltip="Inactive statuses are hidden from ticket status dropdowns and default kanban columns. Existing tickets keep the status."
              >
                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
              </Form.Item>
              <Form.Item
                name="is_deletable"
                label="Allow delete"
                valuePropName="checked"
                tooltip="If off, this status cannot be removed from settings (same as system statuses)."
              >
                <Switch
                  disabled={!!editingStatus && isLockedTicketStatusSlug(editingStatus.slug)}
                  checkedChildren="Yes"
                  unCheckedChildren="No"
                />
              </Form.Item>
              <Form.Item style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingStatus ? 'Update' : 'Create'}
                  </Button>
                  <Button
                    onClick={() => {
                      setModalVisible(false)
                      form.resetFields()
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
