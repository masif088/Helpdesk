'use client'

import { DeleteOutlined,EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect,useState } from 'react'

import { KanbanTagPreview, tagPreviewFillHex } from '@/components/common/KanbanTagPreview'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { kanbanTagStyle } from '@/lib/kanban-tag-chip-style'

const { Content } = Layout
const { Title, Text } = Typography

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
      title: 'Order',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 104,
      align: 'center',
      sorter: (a, b) => a.sort_order - b.sort_order,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      width: 160,
      ellipsis: true,
      render: (slug: string) => (
        <Typography.Text code copyable ellipsis={{ tooltip: slug }}>
          {slug}
        </Typography.Text>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (d: string | undefined) => (
        <Typography.Text type="secondary" ellipsis>
          {(d ?? '').trim() || '—'}
        </Typography.Text>
      ),
    },
    {
      title: 'Agents only',
      dataIndex: 'is_agent_only',
      key: 'is_agent_only',
      width: 120,
      align: 'center',
      render: (v: boolean | undefined) =>
        v ? <Tag color="orange">Agents only</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Preview',
      dataIndex: 'color',
      key: 'preview',
      width: 200,
      render: (_: string, record: TicketTypeRecord) => (
        <Tag style={kanbanTagStyle({ fillHex: tagPreviewFillHex(record.color) })}>{record.title}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 216,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this type?"
            description="Tickets using this type will have type cleared."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="primary" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ margin: '24px' }}>
          <SettingsBackLink />
          
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Title level={4} style={{ margin: 0 }}>
                Ticket Types
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add Type
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={types}
              pagination={false}
              tableLayout="fixed"
              scroll={{ x: 960 }}
            />

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
