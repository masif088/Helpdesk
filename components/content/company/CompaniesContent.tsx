'use client'

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Col, Form, Input, InputNumber, Layout, message, Modal, Popconfirm, Row, Select, Space, Switch, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo,useState } from 'react'

import AppTable from '@/components/common/AppTable'
import DateDisplay from '@/components/common/DateDisplay'
import { tagPreviewFillHex } from '@/components/common/KanbanTagPreview'
import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { Chip, StatusPill } from '@/components/ticket/list/TicketChips'
import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'
import { DEFAULT_RATE_CURRENCY, formatHourlyRate, RATE_CURRENCIES } from '@/lib/billing-rate'

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...options, credentials: 'include' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || res.statusText || 'Request failed')
  }
  return res.json()
}

const { Content } = Layout
const { Title, Text } = Typography

interface CompaniesContentProps {
  user: { id: string; email?: string | null; name?: string | null }
}

interface CompanyRecord {
  id: string
  name: string
  email?: string | null
  created_by?: string | null
  is_active: boolean
  color: string
  active_team_id?: string | null
  active_manager_id?: string | null
  is_customer?: boolean
  /** Answers emails from this company automatically ("we received your request") */
  email_auto_reply?: boolean
  created_at: string
  updated_at: string
  last_ticket_updated_at?: string | null
  default_hourly_rate?: number | null
  default_rate_currency?: string | null
}

interface LeaderOption {
  id: string
  full_name: string | null
  email: string
  role: string
}

interface TeamOption {
  id: string
  name: string
  member_count?: number
}

interface ManagerOption {
  id: string
  full_name: string | null
  email: string
  role: string
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

export default function CompaniesContent({ user: currentUser }: CompaniesContentProps) {
  /** Admin / manager: see and set the default hourly rate */
  const canEditBilling = ['admin', 'manager'].includes(String((currentUser as { role?: string }).role ?? '').toLowerCase())
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [companies, setCompanies] = useState<CompanyRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null)
  const [searchText, setSearchText] = useState('')
  const [filterIsCustomer] = useState<boolean | undefined>(undefined)
  const [filterStatus] = useState<boolean | undefined>(undefined)
  const [leaderOptions, setLeaderOptions] = useState<LeaderOption[]>([])
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([])
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([])
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })

  const filteredCompanies = useMemo(() => {
    return companies
      .filter((c) => {
        if (searchText.trim()) {
          const q = searchText.trim().toLowerCase()
          const matchesSearch =
            (c.name || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
          if (!matchesSearch) return false
        }
        if (filterIsCustomer !== undefined && (c.is_customer ?? false) !== filterIsCustomer) return false
        if (filterStatus !== undefined && (c.is_active ?? true) !== filterStatus) return false
        return true
      })
      .sort((a, b) => Number(b.is_customer ?? false) - Number(a.is_customer ?? false))
  }, [companies, searchText, filterIsCustomer, filterStatus])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: CompanyRecord[] }>('/api/companies')
      setCompanies(res.data || [])
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to fetch companies')
    } finally {
      setLoading(false)
    }
  }

  const fetchLeaderOptions = async () => {
    try {
      const rows = await apiFetch<LeaderOption[]>('/api/users')
      setLeaderOptions(
        (rows || []).filter((u) => (u.role || '').toLowerCase() === 'customer' && !!u.email)
      )
      setManagerOptions(
        (rows || []).filter((u) => (u.role || '').toLowerCase() !== 'customer' && !!u.email)
      )
    } catch {
      setLeaderOptions([])
      setManagerOptions([])
    }
  }

  const fetchTeamOptions = async () => {
    try {
      const rows = await apiFetch<TeamOption[]>('/api/teams')
      setTeamOptions(
        (rows || []).map((t) => ({
          id: t.id,
          name: t.name,
          member_count: t.member_count,
        }))
      )
    } catch {
      setTeamOptions([])
    }
  }

  useEffect(() => {
    fetchCompanies()
    fetchLeaderOptions()
    fetchTeamOptions()
  }, [])

  const handleCreate = () => {
    setEditingCompany(null)
    form.resetFields()
    form.setFieldsValue({
      color: '#000000',
      email: undefined,
      leader_user_id: undefined,
      active_team_id: undefined,
      active_manager_id: undefined,
      is_customer: false,
      default_hourly_rate: null,
      default_rate_currency: DEFAULT_RATE_CURRENCY,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: CompanyRecord) => {
    setEditingCompany(record)
    form.setFieldsValue({
      name: record.name,
      email: record.email || '',
      color: record.color || '#000000',
      leader_user_id: record.created_by || undefined,
      active_team_id: record.active_team_id || undefined,
      active_manager_id: record.active_manager_id || undefined,
      is_customer: record.is_customer ?? false,
      email_auto_reply: record.email_auto_reply !== false,
      default_hourly_rate: record.default_hourly_rate ?? null,
      default_rate_currency: record.default_rate_currency ?? DEFAULT_RATE_CURRENCY,
    })
    setModalVisible(true)
  }

  const handleDelete = async (companyId: string) => {
    try {
      await apiFetch(`/api/companies/${companyId}`, { method: 'DELETE' })
      message.success('Company deleted successfully')
      fetchCompanies()
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to delete company')
    }
  }

  const handleSubmit = async (values: {
    name: string
    email?: string
    color?: string
    leader_user_id?: string
    active_team_id?: string | null
    active_manager_id?: string | null
    is_customer?: boolean
    email_auto_reply?: boolean
    default_hourly_rate?: number | null
    default_rate_currency?: string | null
  }) => {
    const staffPayload = {
      active_team_id: values.active_team_id ?? null,
      active_manager_id: values.active_manager_id ?? null,
      is_customer: values.is_customer === true,
      email_auto_reply: values.email_auto_reply !== false,
      ...(canEditBilling
        ? {
            default_hourly_rate: values.default_hourly_rate ?? null,
            default_rate_currency:
              values.default_hourly_rate != null ? values.default_rate_currency ?? DEFAULT_RATE_CURRENCY : null,
          }
        : {}),
    }
    setSaving(true)
    try {
      if (editingCompany) {
        await apiFetch(`/api/companies/${editingCompany.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            email: values.email?.trim() || null,
            color: values.color || '#000000',
            leader_user_id: values.leader_user_id,
            ...staffPayload,
          }),
        })
        message.success('Company updated successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCompanies()
      } else {
        await apiFetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            email: values.email?.trim() || null,
            color: values.color || '#000000',
            leader_user_id: values.leader_user_id,
            ...staffPayload,
          }),
        })
        message.success('Company created successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCompanies()
      }
    } catch (error: unknown) {
      message.error((error as Error).message || 'Failed to save company')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<CompanyRecord> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      sortDirections: ['ascend', 'descend'],
      render: (name: string, record: CompanyRecord) => (
        <SpaNavLink href={`/companies/${record.id}`} className="people-cell">
          <span className="rr-company__mark" style={{ background: tagPreviewFillHex(record.color) }} aria-hidden>
            {(name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="people-cell__text">
            <span className="people-cell__name">{name}</span>
            {record.email ? <span className="people-cell__sub">{record.email}</span> : null}
          </span>
        </SpaNavLink>
      ),
    },
    {
      title: 'Is customer',
      dataIndex: 'is_customer',
      key: 'is_customer',
      width: 120,
      align: 'center',
      sorter: (a, b) => Number(a.is_customer ?? false) - Number(b.is_customer ?? false),
      sortDirections: ['ascend', 'descend'],
      render: (is_customer: boolean | undefined) => (
        <StatusPill color={is_customer ? '#0F9D8A' : '#94A3B8'} title={is_customer ? 'Customer' : 'Internal'} />
      ),
    },
    ...(canEditBilling
      ? [
          {
            title: 'Rate',
            key: 'default_hourly_rate',
            width: 150,
            render: (_: unknown, record: CompanyRecord) =>
              record.default_hourly_rate != null ? (
                <span className="people-strong">{formatHourlyRate(record.default_hourly_rate, record.default_rate_currency)}</span>
              ) : (
                <span className="people-muted">No rate</span>
              ),
          },
        ]
      : []),
    {
      title: 'Active Team',
      key: 'active_team_id',
      render: (_: unknown, record: CompanyRecord) => {
        const team = teamOptions.find((t) => t.id === record.active_team_id)
        if (!team) return '—'
        return (
          <Space size={4}>
            <Chip>{team.name}</Chip>
            {team.member_count != null && (
              <span className="people-muted">{team.member_count} member{team.member_count !== 1 ? 's' : ''}</span>
            )}
          </Space>
        )
      },
    },
    {
      title: 'Active Manager',
      key: 'active_manager_id',
      render: (_: unknown, record: CompanyRecord) => {
        const mgr = managerOptions.find((m) => m.id === record.active_manager_id)
        return mgr ? <span className="people-strong">{mgr.full_name || mgr.email}</span> : <span className="people-muted">—</span>
      },
    },
    {
      title: 'Last ticket update',
      dataIndex: 'last_ticket_updated_at',
      key: 'last_ticket_updated_at',
      sorter: (a, b) => {
        const ta = a.last_ticket_updated_at
          ? new Date(a.last_ticket_updated_at).getTime()
          : 0
        const tb = b.last_ticket_updated_at
          ? new Date(b.last_ticket_updated_at).getTime()
          : 0
        return ta - tb
      },
      sortDirections: ['ascend', 'descend'],
      render: (iso: string | null | undefined) =>
        iso ? <DateDisplay date={iso} /> : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/companies/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete Company"
            description="Are you sure you want to delete this company?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
            <div className="page-head">
              <div>
                <Title level={2} className="page-head__title">Companies</Title>
                <Text className="page-head__sub">Client organizations, their team, manager and plan hours</Text>
              </div>
              <div className="page-head__actions">
                <span className="page-head__count">{filteredCompanies.length} shown</span>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  Add company
                </Button>
              </div>
            </div>
            <div className="page-toolbar">
              <Input
                placeholder="Search by name or email..."
                prefix={<SearchOutlined />}
                allowClear
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value)
                  setPagination((p) => ({ ...p, current: 1 }))
                }}
                style={{ width: 280 }}
              />
            </div>
            <div className="ticket-surface">
            <AppTable
              className="ticket-table"
              columns={columns}
              dataSource={filteredCompanies}
              rowKey="id"
              loading={loading}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                showSizeChanger: true,
                pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                showTotal: appTableShowTotal('companies'),
                onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
              }}
            />
            </div>

          <Modal
            title={editingCompany ? 'Edit Company' : 'Create Company'}
            open={modalVisible}
            onCancel={() => {
              if (saving) return
              setModalVisible(false)
              form.resetFields()
            }}
            maskClosable={!saving}
            closable={!saving}
            footer={null}
            width={640}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              disabled={saving}
            >
              <Form.Item
                name="name"
                label="Company Name"
                rules={[{ required: true, message: 'Please enter company name!' }]}
              >
                <Input placeholder="Company Name" />
              </Form.Item>

              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: 'email', message: 'Invalid email!', required: true }]}
              >
                <Input type="email" placeholder="support@company.com" />
              </Form.Item>

              <Form.Item
                name="leader_user_id"
                label="Company Leader"
                extra="Leave blank for internal companies (no customer leader)"
              >
                <Select
                  showSearch
                  allowClear
                  placeholder="Select customer user as leader (optional)"
                  optionFilterProp="label"
                  options={leaderOptions.map((u) => ({
                    value: u.id,
                    label: `${u.full_name || u.email} (${u.email})`,
                  }))}
                />
              </Form.Item>

             

              <Form.Item
                name="active_team_id"
                label="Active team"
              >
                <Select
                  allowClear
                  showSearch
                  placeholder="Select team"
                  optionFilterProp="label"
                  options={teamOptions.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="active_manager_id"
                label="Active manager"
              >
                <Select
                  allowClear
                  showSearch
                  placeholder="Select manager"
                  optionFilterProp="label"
                  options={managerOptions.map((u) => ({
                    value: u.id,
                    label: `${u.full_name || u.email} (${u.email})`,
                  }))}
                />
              </Form.Item>

              <Row gutter={24}>
                {canEditBilling ? (
                  <Col xs={24}>
                    <Form.Item
                      label="Default hourly rate"
                      extra="Copied to new tickets of this company; each ticket can still be changed."
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="default_rate_currency" noStyle>
                          <Select style={{ width: 90 }} options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))} />
                        </Form.Item>
                        <Form.Item name="default_hourly_rate" noStyle>
                          <InputNumber min={0} placeholder="per hour" style={{ width: '100%' }} />
                        </Form.Item>
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                ) : null}
                <Col xs={24} sm={5}>
                  <Form.Item
                    name="is_customer"
                    label="Is customer"
                    valuePropName="checked"
                    initialValue={false}
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
<Col xs={24} sm={8}>
                  <Form.Item name="color" label="Color (hex)" initialValue="#000000">
                    <ColorPickerWithInput />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="email_auto_reply"
                label="Reply to their emails automatically"
                valuePropName="checked"
                initialValue
                tooltip="When this company emails the support inbox, a ticket is created and they get a 'we received your request' email (new senders also get a welcome email). Switch off if this company does not want that: the ticket is still created and agents reply by hand."
              >
                <Switch checkedChildren="On" unCheckedChildren="Off" />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    {editingCompany ? 'Update' : 'Create'}
                  </Button>
                  <Button disabled={saving} onClick={() => {
                    setModalVisible(false)
                    form.resetFields()
                  }}>
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

