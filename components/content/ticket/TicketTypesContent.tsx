'use client'

import { PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Layout, message, Modal, Space, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'

import { KanbanTagPreview } from '@/components/common/KanbanTagPreview'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import RowActions from '@/components/settings/RowActions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SkillsSelect from '@/components/settings/SkillsSelect'
import SlaDurationInput from '@/components/settings/SlaDurationInput'
import { Chip, StatusPill } from '@/components/ticket/list/TicketChips'
import { formatSlaTarget } from '@/lib/sla-format'

const { Content } = Layout

interface TicketTypesContentProps {
  user: { id: string; email?: string | null; user_metadata?: { full_name?: string | null } }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

interface TicketTypeRecord {
  id: number
  slug: string
  title: string
  description?: string
  color: string
  sort_order: number
  is_agent_only?: boolean
  required_skills?: string[]
  sla_respond_minutes?: number | null
  sla_resolve_minutes?: number | null
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
  const hex = value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'
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
        placeholder="#000000"
        style={{ width: 120 }}
        {...rest}
      />
    </Space>
  )
}

export default function TicketTypesContent({ user: currentUser }: TicketTypesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [types, setTypes] = useState<TicketTypeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingType, setEditingType] = useState<TicketTypeRecord | null>(null)
  const [form] = Form.useForm()
  const previewColor = Form.useWatch('color', form)
  const previewTitle = Form.useWatch('title', form)

  const fetchTypes = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<TicketTypeRecord[]>('/api/ticket-types')
      setTypes(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch ticket types')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTypes()
  }, [])

  const handleCreate = () => {
    setEditingType(null)
    form.resetFields()
    form.setFieldsValue({
      color: '#000000',
      is_agent_only: false,
      sort_order: types.length > 0 ? Math.max(...types.map((t) => t.sort_order)) + 1 : 0,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: TicketTypeRecord) => {
    setEditingType(record)
    form.setFieldsValue({
      title: record.title,
      slug: record.slug,
      color: record.color,
      sort_order: record.sort_order,
      description: record.description ?? '',
      is_agent_only: record.is_agent_only ?? false,
      required_skills: record.required_skills ?? [],
      sla_respond_minutes: record.sla_respond_minutes ?? null,
      sla_resolve_minutes: record.sla_resolve_minutes ?? null,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/ticket-types/${id}`, { method: 'DELETE' })
      message.success('Type deleted')
      fetchTypes()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete type')
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editingType && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        title: String(values.title || '').trim(),
        slug: String(values.slug || '').trim().toLowerCase().replace(/\s+/g, '_'),
        color: (values.color as string) || '#000000',
        sort_order: Number(values.sort_order) ?? 0,
        description: typeof values.description === 'string' ? values.description : '',
        is_agent_only: Boolean(values.is_agent_only),
        required_skills: Array.isArray(values.required_skills) ? values.required_skills : [],
        sla_respond_minutes: typeof values.sla_respond_minutes === 'number' ? values.sla_respond_minutes : null,
        sla_resolve_minutes: typeof values.sla_resolve_minutes === 'number' ? values.sla_resolve_minutes : null,
      }

      if (editingType) {
        await apiFetch(`/api/ticket-types/${editingType.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Type updated')
      } else {
        await apiFetch('/api/ticket-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Type created')
      }
      setModalVisible(false)
      form.resetFields()
      fetchTypes()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save type')
    }
  }

  const columns: ColumnsType<TicketTypeRecord> = [
    {
      title: '#',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 64,
      sorter: (a, b) => a.sort_order - b.sort_order,
      render: (v: number) => <span className="cell-order">{v}</span>,
    },
    {
      title: 'Type',
      key: 'title',
      width: 240,
      render: (_, r) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <Chip color={r.color}>{r.title}</Chip>
          <Typography.Text className="cell-muted" style={{ fontSize: 11 }} copyable={{ text: r.slug, tooltips: ['Copy slug', 'Copied'] }}>
            {r.slug}
          </Typography.Text>
        </span>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (d: string | undefined) => <span className="cell-muted">{(d ?? '').trim() || '—'}</span>,
    },
    {
      title: 'Default skills',
      dataIndex: 'required_skills',
      key: 'required_skills',
      width: 200,
      render: (skills: string[] | undefined) =>
        skills?.length ? (
          <Space size={[4, 4]} wrap>
            {skills.map((s) => (
              <Tag key={s} style={{ marginInlineEnd: 0 }}>
                {s}
              </Tag>
            ))}
          </Space>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
    {
      title: 'SLA (respond / resolve)',
      key: 'sla',
      width: 170,
      render: (_: unknown, r: TicketTypeRecord) =>
        r.sla_respond_minutes || r.sla_resolve_minutes ? (
          <span>
            {formatSlaTarget(r.sla_respond_minutes)} / {formatSlaTarget(r.sla_resolve_minutes)}
          </span>
        ) : (
          <span className="cell-muted">—</span>
        ),
    },
    {
      title: 'Who can pick it',
      dataIndex: 'is_agent_only',
      key: 'is_agent_only',
      width: 150,
      render: (v: boolean | undefined) =>
        v ? <StatusPill color="#D97706" title="Staff only" /> : <StatusPill color="#0F9D8A" title="Everyone" />,
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
          deleteTitle="Delete this type?"
          deleteDescription="Tickets using this type will have their type cleared."
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
            title="Ticket types"
            description="Request categories (bug, feature, question…) that customers and staff choose"
            count={`${types.length} types`}
            actions={
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add type
              </Button>
            }
          />
          <div className="ticket-surface ticket-table">
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={types}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: 760 }}
            />
          </div>

          <Modal
            title={editingType ? 'Edit Type' : 'Add Type'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="title"
                label="Title"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. Bug" onChange={handleTitleChange} />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. bug" disabled={!!editingType} />
              </Form.Item>
              <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                <ColorPickerWithInput />
              </Form.Item>
              <Form.Item label="Tag preview">
                <KanbanTagPreview
                  colorHex={previewColor}
                  name={previewTitle ?? undefined}
                  emptyLabel="Type preview"
                />
              </Form.Item>
              <Form.Item name="sort_order" label="Sort order" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="description"
                label="Reference description"
              >
                <Input.TextArea
                  rows={3}
                  placeholder="Shown on Reference page (ticket types tab) for all users who can open tickets"
                />
              </Form.Item>
              <Form.Item
                name="required_skills"
                label="Default skills"
                tooltip="Skills suggested for tickets of this type. Each ticket can set its own under Attributes → Skills needed; these apply when it has none."
              >
                <SkillsSelect />
              </Form.Item>
              <Form.Item
                name="sla_respond_minutes"
                label="Respond within"
                tooltip="Service level: the team must send a first public reply this soon after a client opens a ticket of this type. A client can have its own targets (Company → SLA). Empty = no target."
              >
                <SlaDurationInput />
              </Form.Item>
              <Form.Item
                name="sla_resolve_minutes"
                label="Resolve within"
                tooltip="Service level: the ticket must be resolved / closed this soon after it was created. Empty = no target."
              >
                <SlaDurationInput />
              </Form.Item>
              <Form.Item
                name="is_agent_only"
                label="Agent only?"
                valuePropName="checked"
                initialValue={false}
                tooltip="If active, this type will not be shown in the customer portal (new ticket form, lookup, Reference)."
              >
                <Switch />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingType ? 'Update' : 'Create'}
                  </Button>
                  <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
