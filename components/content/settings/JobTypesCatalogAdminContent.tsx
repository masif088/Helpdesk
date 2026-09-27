'use client'

import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
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
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'

const { Content } = Layout
const { Title, Text } = Typography

interface JobTypeRow {
  slug: string
  title: string
  sort_order: number
  is_active: boolean
  billable: boolean
  created_at: string | null
}

interface JobTypesCatalogAdminContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64)
}

export default function JobTypesCatalogAdminContent({ user: currentUser }: JobTypesCatalogAdminContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [rows, setRows] = useState<JobTypeRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<JobTypeRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const fetchList = useCallback(async () => {
    setListLoading(true)
    try {
      const data = await apiFetch<JobTypeRow[]>('/api/settings/job-types')
      setRows(data || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load job types')
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      slug: '',
      title: '',
      sort_order:
        rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order), 0) + 10 : 10,
      is_active: true,
      billable: true,
    })
    setModalOpen(true)
  }

  const openEdit = (record: JobTypeRow) => {
    setEditing(record)
    form.setFieldsValue({
      slug: record.slug,
      title: record.title,
      sort_order: record.sort_order,
      is_active: record.is_active,
      billable: record.billable,
    })
    setModalOpen(true)
  }

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    if (!editing && title) {
      form.setFieldValue('slug', slugFromTitle(title))
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const body = {
        title: values.title,
        sort_order: values.sort_order,
        is_active: values.is_active,
        billable: values.billable,
      }
      if (editing) {
        await apiFetch(`/api/settings/job-types/${encodeURIComponent(editing.slug)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        message.success('Job type updated')
      } else {
        await apiFetch('/api/settings/job-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: values.slug, ...body }),
        })
        message.success('Job type created')
      }
      setModalOpen(false)
      fetchList()
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return
      message.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: JobTypeRow) => {
    try {
      await apiFetch(`/api/settings/job-types/${encodeURIComponent(record.slug)}`, { method: 'DELETE' })
      message.success(`Deleted "${record.slug}"`)
      fetchList()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const columns: ColumnsType<JobTypeRow> = [
    { title: 'Slug', dataIndex: 'slug', width: 160, render: (s: string) => <Text code>{s}</Text> },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    { title: 'Sort', dataIndex: 'sort_order', width: 80 },
    {
      title: 'Billable',
      dataIndex: 'billable',
      width: 110,
      render: (b: boolean) => (b ? <Tag color="blue">Billable</Tag> : <Tag>Non-billable</Tag>),
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      width: 100,
      render: (a: boolean) => (a ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title={`Delete "${record.slug}"?`}
            description="Only possible when no time entry uses it — otherwise deactivate it instead."
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{
          ...currentUser,
          role: currentUser.role ?? undefined,
        }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />

      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, maxWidth: 1100 }}>
          <Link href="/settings" style={{ display: 'inline-block', marginBottom: 16, color: 'inherit' }}>
            <Space style={{ opacity: 0.85 }}>
              <ArrowLeftOutlined />
              Back to Settings
            </Space>
          </Link>

          <Title level={2}>Job types</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            What the time was spent on. Every time entry needs one; billable job types count toward the hours billed to the client.
          </Text>

          <Card title="Job types" style={{ marginBottom: 24 }}>
            <Space style={{ marginBottom: 16 }} wrap>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add job type
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => fetchList()} loading={listLoading}>
                Refresh list
              </Button>
            </Space>

            <Table<JobTypeRow>
              rowKey="slug"
              loading={listLoading}
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('job types') }}
              size="small"
            />

            <Modal
              title={editing ? `Edit "${editing.slug}"` : 'Add job type'}
              open={modalOpen}
              onCancel={() => setModalOpen(false)}
              destroyOnHidden
              onOk={() => handleSubmit()}
              confirmLoading={saving}
              okText="Save"
            >
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                  label="Slug"
                  name="slug"
                  rules={[{ required: !editing, message: 'Slug is required' }]}
                  extra="Lowercase letters, numbers, underscores only (max 64). Cannot change after creation."
                >
                  <Input disabled={!!editing} placeholder="e.g. design_review" />
                </Form.Item>
                <Form.Item
                  label="Title"
                  name="title"
                  rules={[{ required: true, message: 'Title is required' }]}
                >
                  <Input placeholder="Display name" onChange={onTitleChange} />
                </Form.Item>
                <Form.Item label="Sort order" name="sort_order" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label="Billable"
                  name="billable"
                  valuePropName="checked"
                  extra="Billable time is charged to the client at the ticket's hourly rate."
                >
                  <Switch checkedChildren="Billable" unCheckedChildren="Non-billable" />
                </Form.Item>
                <Form.Item label="Active" name="is_active" valuePropName="checked">
                  <Switch checkedChildren="On" unCheckedChildren="Off" />
                </Form.Item>
              </Form>
            </Modal>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
