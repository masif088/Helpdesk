'use client'

import { DeleteOutlined,EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Space,
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
const { Title } = Typography

interface TagsContentProps {
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

interface TagRecord {
  id: string
  name: string
  slug: string
  color: string
  created_at: string
  updated_at: string
}

function slugFromName(name: string): string {
  return name
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

export default function TagsContent({ user: currentUser }: TagsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tags, setTags] = useState<TagRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTag, setEditingTag] = useState<TagRecord | null>(null)
  const [form] = Form.useForm()
  const previewColor = Form.useWatch('color', form)
  const previewName = Form.useWatch('name', form)

  const fetchTags = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<TagRecord[]>('/api/tags')
      setTags(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch tags')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTags()
  }, [])

  const handleCreate = () => {
    setEditingTag(null)
    form.resetFields()
    form.setFieldsValue({ color: '#000000' })
    setModalVisible(true)
  }

  const handleEdit = (record: TagRecord) => {
    setEditingTag(record)
    form.setFieldsValue({
      name: record.name,
      slug: record.slug,
      color: record.color || '#000000',
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/tags/${id}`, { method: 'DELETE' })
      message.success('Tag deleted')
      fetchTags()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete tag')
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    if (!editingTag && name) {
      form.setFieldValue('slug', slugFromName(name))
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        name: String(values.name || '').trim(),
        slug: String(values.slug || '').trim().toLowerCase().replace(/\s+/g, '_'),
        color: (values.color as string) || '#000000',
      }

      if (editingTag) {
        await apiFetch(`/api/tags/${editingTag.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Tag updated')
      } else {
        await apiFetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Tag created')
      }
      setModalVisible(false)
      form.resetFields()
      fetchTags()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save tag')
    }
  }

  const columns: ColumnsType<TagRecord> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (slug: string) => (
        <Typography.Text code copyable>
          {slug}
        </Typography.Text>
      ),
    },
    {
      title: 'Preview',
      dataIndex: 'color',
      key: 'preview',
      width: 200,
      render: (_: string, record: TagRecord) => (
        <Tag style={kanbanTagStyle({ fillHex: tagPreviewFillHex(record.color) })}>{record.name}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this tag?"
            description="It will be removed from all tickets."
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
                Tags
              </Title>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                Add Tag
              </Button>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={tags}
              pagination={false}
            />

          <Modal
            title={editingTag ? 'Edit Tag' : 'Add Tag'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="name"
                label="Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. urgent" onChange={handleNameChange} />
              </Form.Item>
              <Form.Item
                name="slug"
                label="Slug (unique)"
                rules={[
                  { required: true, message: 'Required' },
                  { pattern: /^[a-z0-9_]+$/, message: 'Only lowercase letters, numbers, underscore' },
                ]}
              >
                <Input placeholder="e.g. urgent" disabled={!!editingTag} />
              </Form.Item>
              <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                <ColorPickerWithInput />
              </Form.Item>
              <Form.Item label="Tag preview">
                <KanbanTagPreview
                  colorHex={previewColor}
                  name={previewName ?? undefined}
                  emptyLabel="Tag preview"
                />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit">
                    {editingTag ? 'Update' : 'Create'}
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
