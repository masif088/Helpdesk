'use client'

import { DeleteOutlined, EditOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
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
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect,useState } from 'react'

import ActionBuilder from '@/components/automation/ActionBuilder'
import ConditionBuilder from '@/components/automation/ConditionBuilder'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import SettingsBackLink from '@/components/settings/SettingsBackLink'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import type { AutomationActions } from '@/lib/automation-actions-types'
import type { OurConditionGroup } from '@/lib/condition-builder-utils'

const { Content } = Layout
const { Title } = Typography

interface AutomationRulesContentProps {
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

interface AutomationRuleRecord {
  id: number
  name: string | null
  event_type: string
  conditions: object
  actions: object
  priority: number
  company_id: string | null
  status: boolean
  created_at: string
  updated_at: string
}

function hasAtLeastOneAction(actions: AutomationActions | object): boolean {
  if (!actions || typeof actions !== 'object') return false
  return Object.values(actions).some((v) => {
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  })
}

const emptyConditions: OurConditionGroup = { operator: 'AND', conditions: [] }

export default function AutomationRulesContent({ user: currentUser }: AutomationRulesContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [rules, setRules] = useState<AutomationRuleRecord[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterCompany, setFilterCompany] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRuleRecord | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const fetchRules = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<AutomationRuleRecord[]>('/api/automation-rules')
      setRules(data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch rules')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const res = await apiFetch<{ data: { id: string; name: string }[] }>('/api/companies')
      setCompanies(res?.data || [])
    } catch {
      setCompanies([])
    }
  }

  useEffect(() => {
    fetchRules()
    fetchCompanies()
  }, [])

  const handleCreate = () => {
    setEditingRule(null)
    form.resetFields()
    form.setFieldsValue({
      event_type: 'ticket_created',
      priority: 0,
      status: true,
      conditions: emptyConditions,
      actions: {},
    })
    setModalVisible(true)
  }

  const handleEdit = (record: AutomationRuleRecord) => {
    setEditingRule(record)
    const cond = record.conditions as OurConditionGroup
    const validCond =
      cond && typeof cond === 'object' && 'operator' in cond && Array.isArray(cond.conditions)
        ? cond
        : emptyConditions
    const act = record.actions as AutomationActions
    form.setFieldsValue({
      name: record.name,
      event_type: record.event_type,
      priority: record.priority,
      company_id: record.company_id || undefined,
      status: record.status,
      conditions: validCond,
      actions: act && typeof act === 'object' ? act : {},
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/automation-rules/${id}`, { method: 'DELETE' })
      message.success('Rule deleted')
      fetchRules()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete rule')
    }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const conditionsObj =
        values.conditions && typeof values.conditions === 'object'
          ? (values.conditions as object)
          : {}
      const actionsObj =
        values.actions && typeof values.actions === 'object'
          ? (values.actions as object)
          : {}

      const payload = {
        name: values.name ? String(values.name).trim() : null,
        event_type: String(values.event_type || 'ticket_created'),
        conditions: conditionsObj,
        actions: actionsObj,
        priority: Number(values.priority) ?? 0,
        company_id: values.company_id || null,
        status: values.status !== false,
      }

      if (editingRule) {
        await apiFetch(`/api/automation-rules/${editingRule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Rule updated')
      } else {
        await apiFetch('/api/automation-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        message.success('Rule created')
      }
      setModalVisible(false)
      form.resetFields()
      fetchRules()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save rule')
    } finally {
      setSubmitting(false)
    }
  }

  const columns: ColumnsType<AutomationRuleRecord> = [
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      sorter: (a, b) => b.priority - a.priority,
      render: (p: number) => <Tag>{p}</Tag>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string | null) => name || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Event',
      dataIndex: 'event_type',
      key: 'event_type',
      width: 130,
      render: (et: string) => <Tag color="blue">{et}</Tag>,
    },
    {
      title: 'Scope',
      dataIndex: 'company_id',
      key: 'company_id',
      width: 150,
      render: (cid: string | null) => {
        if (!cid) return <Tag>Global</Tag>
        const company = companies.find((c) => c.id === cid)
        return <Tag color="purple">{company?.name ?? cid}</Tag>
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: boolean) => (
        <Tag color={s ? 'green' : 'default'}>{s ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this rule?"
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
                <ThunderboltOutlined style={{ marginRight: 8 }} />
                Automation Rules
              </Title>
              <Space>
                <Input.Search
                  placeholder="Search by name…"
                  allowClear
                  style={{ width: 200 }}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <Select
                  allowClear
                  showSearch
                  placeholder="Filter by company"
                  style={{ width: 180 }}
                  value={filterCompany ?? undefined}
                  onChange={(v) => setFilterCompany(v ?? null)}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    { value: '__global__', label: 'Global' },
                    ...companies.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  Add Rule
                </Button>
              </Space>
            </div>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={rules.filter((r) => {
                if (searchText && !(r.name ?? '').toLowerCase().includes(searchText.toLowerCase())) return false
                if (filterCompany === '__global__' && r.company_id !== null) return false
                if (filterCompany && filterCompany !== '__global__' && r.company_id !== filterCompany) return false
                return true
              })}
              pagination={{
                pageSize: 15,
                showSizeChanger: true,
                pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                showTotal: appTableShowTotal('rules'),
              }}
            />

          <Modal
            title={editingRule ? 'Edit Rule' : 'Add Rule'}
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={820}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item name="name" label="Name (optional)">
                <Input placeholder="e.g. Refund to Billing" />
              </Form.Item>

              <Space style={{ width: '100%', marginBottom: 16 }} wrap>
                <Form.Item
                  name="event_type"
                  label="Event Type"
                  rules={[{ required: true }]}
                  style={{ marginBottom: 0, minWidth: 180 }}
                >
                  <Select
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={[
                      { value: 'ticket_created', label: 'Ticket Created' },
                      { value: 'ticket_updated', label: 'Ticket Updated' },
                      { value: 'ticket_reply_added', label: 'New Reply (thread / email / client note)' },
                      { value: 'ticket_note_added', label: 'New Internal Note' },
                      { value: 'ticket_comment_added', label: 'New Reply or Note (any)' },
                      { value: 'time_trigger', label: 'Time Trigger (cron-based)' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="priority" label="Priority" style={{ marginBottom: 0, minWidth: 100 }}>
                  <InputNumber min={0} placeholder="0" style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="company_id" label="Company (optional)" style={{ marginBottom: 0, minWidth: 180 }}>
                  <Select
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    placeholder="Global"
                    options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Form.Item>
                <Form.Item name="status" label="Active" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch />
                </Form.Item>
              </Space>

              <Form.Item
                name="conditions"
                label="Conditions"
                rules={[
                  { required: true, message: 'Add at least one condition' },
                  {
                    validator: (_, v: OurConditionGroup) => {
                      if (!v?.conditions?.length) return Promise.reject(new Error('Add at least one condition'))
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                  {/** Do not emit empty onChange — it would overwrite Form.Item so conditions are not saved */}
                  <ConditionBuilder />
                </Form.Item>

              <Form.Item
                name="actions"
                label="Actions"
                rules={[
                  { required: true, message: 'Select at least one action' },
                  {
                    validator: (_, v: AutomationActions) =>
                      hasAtLeastOneAction(v) ? Promise.resolve() : Promise.reject(new Error('Select at least one action')),
                  },
                ]}
              >
                <ActionBuilder />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    {editingRule ? 'Update' : 'Create'}
                  </Button>
                  <Button onClick={() => setModalVisible(false)} disabled={submitting}>Cancel</Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
