'use client'

import { BellOutlined,DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
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
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { KNOWLEDGE_BASE_ARTICLE_ROLES, labelForKnowledgeBaseRoles } from '@/lib/knowledge-base-article-roles'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { RangePicker } = DatePicker

interface AdminRow {
  id: string
  title: string
  body: string
  target_roles: string[] | null
  is_published: boolean
  starts_at: string | null
  ends_at: string | null
  sort_order: number
  updated_at: string
}

interface DashboardAnnouncementsSettingsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

const ROLE_OPTIONS = KNOWLEDGE_BASE_ARTICLE_ROLES.map((r) => ({
  label: r.charAt(0).toUpperCase() + r.slice(1),
  value: r,
}))

function scheduleLabel(starts: string | null, ends: string | null): string {
  if (!starts && !ends) return 'Always (when published)'
  if (starts && ends) {
    return `${dayjs(starts).format('MMM D, YYYY HH:mm')} — ${dayjs(ends).format('MMM D, YYYY HH:mm')}`
  }
  return '—'
}

export default function DashboardAnnouncementsSettingsContent({
  user: currentUser,
}: DashboardAnnouncementsSettingsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [rows, setRows] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard-announcements/manage', { credentials: 'include' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      const data = (await res.json()) as { items: AdminRow[] }
      setRows(Array.isArray(data.items) ? data.items : [])
    } catch (e: unknown) {
      message.error((e as Error).message || 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({
      title: '',
      body: '',
      target_roles: [],
      is_published: false,
      schedule: null,
      sort_order: 0,
    })
    setModalOpen(true)
  }

  const openEdit = (row: AdminRow) => {
    setEditingId(row.id)
    const start = row.starts_at ? dayjs(row.starts_at) : null
    const end = row.ends_at ? dayjs(row.ends_at) : null
    form.setFieldsValue({
      title: row.title,
      body: row.body,
      target_roles: row.target_roles && row.target_roles.length > 0 ? row.target_roles : [],
      is_published: row.is_published,
      schedule: start && end ? ([start, end] as [Dayjs, Dayjs]) : null,
      sort_order: row.sort_order ?? 0,
    })
    setModalOpen(true)
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const target_roles =
        Array.isArray(values.target_roles) && values.target_roles.length > 0 ? values.target_roles : null
      const range = values.schedule
      const payload = {
        title: values.title.trim(),
        body: values.body ?? '',
        target_roles,
        is_published: values.is_published === true,
        starts_at: range?.[0]?.toISOString() ?? null,
        ends_at: range?.[1]?.toISOString() ?? null,
        sort_order: values.sort_order ?? 0,
      }
      const url = editingId
        ? `/api/dashboard-announcements/manage/${editingId}`
        : '/api/dashboard-announcements/manage'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      message.success(editingId ? 'Updated' : 'Created')
      setModalOpen(false)
      load()
    } catch (e: unknown) {
      if ((e as Error)?.message && !(e as Error).message.includes('validateFields')) {
        message.error((e as Error).message || 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboard-announcements/manage/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      message.success('Deleted')
      load()
    } catch (e: unknown) {
      message.error((e as Error).message || 'Delete failed')
    }
  }

  const columns: ColumnsType<AdminRow> = [
    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: 'Roles',
      key: 'roles',
      width: 140,
      render: (_, r) => labelForKnowledgeBaseRoles(r.target_roles),
    },
    {
      title: 'Published',
      dataIndex: 'is_published',
      key: 'pub',
      width: 100,
      render: (v: boolean) => (v ? 'Yes' : 'No'),
    },
    {
      title: 'Schedule',
      key: 'sched',
      width: 220,
      ellipsis: true,
      render: (_, r) => scheduleLabel(r.starts_at, r.ends_at),
    },
    { title: 'Sort', dataIndex: 'sort_order', key: 'sort', width: 72 },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated',
      width: 160,
      render: (d: string) => (d ? dayjs(d).format('MMM D, YYYY HH:mm') : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Popconfirm title="Delete this announcement?" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar
        user={{ ...currentUser, role: currentUser.role ?? undefined }}
        collapsed={collapsed}
        onCollapse={setCollapsed}
      />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: 24, background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <SettingsBackLink />
          <Card>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <Title level={2} style={{ marginTop: 0 }}>
                    <BellOutlined style={{ marginRight: 10 }} />
                    Dashboard announcements
                  </Title>
                  <Text type="secondary">
                    Title-only preview on the dashboard; full text opens in a large modal. Leave all roles unchecked to
                    target everyone. Optional schedule limits when a published item is visible.
                  </Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  New announcement
                </Button>
              </div>

              <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('announcements') }}
              />
            </Space>
          </Card>

          <Modal
            title={editingId ? 'Edit announcement' : 'New announcement'}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={submit}
            confirmLoading={saving}
            width={640}
            destroyOnHidden
          >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
              <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title required' }]}>
                <Input placeholder="Short title (shown on dashboard)" maxLength={500} showCount />
              </Form.Item>
              <Form.Item name="body" label="Full message">
                <TextArea rows={8} placeholder="Full content shown in the modal" />
              </Form.Item>
              <Form.Item
                name="target_roles"
                label="Visible to roles"
                extra="Leave none selected to show to all roles."
              >
                <Checkbox.Group options={ROLE_OPTIONS} />
              </Form.Item>
              <Form.Item name="is_published" label="Published" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="schedule" label="Visible between (optional)">
                <RangePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sort_order" label="Sort order">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
