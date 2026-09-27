'use client'

import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Layout, message, Modal, Switch, Table, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import RowActions from '@/components/settings/RowActions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { StatusPill } from '@/components/ticket/list/TicketChips'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'

const { Content } = Layout

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
    {
      title: '#',
      dataIndex: 'sort_order',
      width: 64,
      sorter: (a, b) => a.sort_order - b.sort_order,
      render: (v: number) => <span className="cell-order">{v}</span>,
    },
    {
      title: 'Job type',
      key: 'title',
      render: (_, r) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
          <span className="cell-strong">{r.title}</span>
          <span className="cell-muted" style={{ fontSize: 11 }}>{r.slug}</span>
        </span>
      ),
    },
    {
      title: 'Billing',
      dataIndex: 'billable',
      width: 140,
      render: (b: boolean) => (b ? <StatusPill color="#0F9D8A" title="Billable" /> : <StatusPill color="#64748B" title="Internal" />),
    },
    {
      title: 'State',
      dataIndex: 'is_active',
      width: 120,
      render: (a: boolean) => (a ? <StatusPill color="#16A34A" title="Active" /> : <StatusPill color="#94A3B8" title="Inactive" />),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      align: 'right',
      render: (_, record) => (
        <RowActions
          onEdit={() => openEdit(record)}
          onDelete={() => handleDelete(record)}
          deleteTitle={`Delete "${record.title}"?`}
          deleteDescription="Only possible when no time entry uses it — otherwise deactivate it instead."
        />
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
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <SettingsPageHeader
            title="Job types"
            description="What time is spent on. Every time entry needs one; billable job types count toward the hours billed to the client."
            count={`${rows.length} job types`}
            actions={
              <>
                <Tooltip title="Refresh">
                  <Button icon={<ReloadOutlined />} onClick={() => fetchList()} loading={listLoading} aria-label="Refresh" />
                </Tooltip>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  Add job type
                </Button>
              </>
            }
          />

          <div className="ticket-surface ticket-table">
            <Table<JobTypeRow>
              rowKey="slug"
              loading={listLoading}
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('job types') }}
            />
          </div>

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
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
