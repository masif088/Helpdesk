'use client'

import {
  ArrowLeftOutlined,
  CheckSquareOutlined,
  DeleteOutlined,
  EditOutlined,
  GlobalOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Divider, Flex, Form, Input, InputNumber, Layout, message, Modal, Row, Select, Space, Switch, Tabs, Tag, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import {
  TabCrawling,
  TabInfo,
  TabTickets,
  TabUsers,
  TabWebsites,
} from '@/components/company'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import CustomerNavbar from '@/components/layout/CustomerNavbar'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

function ColorPickerInput({
  value,
  onChange,
}: {
  value?: string
  onChange?: (v: string) => void
}) {
  const hex = value || '#000000'
  return (
    <Space align="center">
      <Input
        type="color"
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }}
      />
      <Input
        value={hex}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="#000000"
        style={{ width: 120 }}
      />
    </Space>
  )
}

interface CompanyDetailContentProps {
  user: { id: string; email?: string | null; name?: string | null }
  companyData: any
  /** 'customer' = navbar layout for customer portal; 'admin' = sidebar layout (default) */
  variant?: 'admin' | 'customer'
  /** When set, render only this section (no tabs). Keys include: info, users, tickets, … */
  activeSection?: string
  /** Used to show portal-admin toggle on Users tab (system admin only) */
  currentUserRole?: string | null
}

export default function CompanyDetailContent({
  user: currentUser,
  companyData,
  variant = 'admin',
  activeSection,
  currentUserRole,
}: CompanyDetailContentProps) {
  const router = useRouter()
  const canEdit = (() => { const r = (currentUserRole ?? '').toLowerCase(); return r === 'admin' || r === 'manager' })()
  const [collapsed, setCollapsed] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [dataTemplates, setDataTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [websites, setWebsites] = useState<any[]>([])
  const [loadingWebsites, setLoadingWebsites] = useState(false)
  const [websiteModalVisible, setWebsiteModalVisible] = useState(false)
  const [editingWebsite, setEditingWebsite] = useState<any>(null)
  const [websiteForm] = Form.useForm()
  const [crawlSessions, setCrawlSessions] = useState<any[]>([])
  const [loadingCrawlSessions, setLoadingCrawlSessions] = useState(false)
  const [crawlModalVisible, setCrawlModalVisible] = useState(false)
  const [crawlForm] = Form.useForm()
  const [companyEditModalOpen, setCompanyEditModalOpen] = useState(false)
  const [companyEditLoading, setCompanyEditLoading] = useState(false)
  const [ticketTotal, setTicketTotal] = useState<number | null>(null)
  const [companyEditForm] = Form.useForm()
  const [companyEditLeaderOptions, setCompanyEditLeaderOptions] = useState<
    { id: string; full_name: string | null; email: string; role: string }[]
  >([])
  const [companyEditManagerOptions, setCompanyEditManagerOptions] = useState<
    { id: string; full_name: string | null; email: string; role: string }[]
  >([])
  const [companyEditTeamOptions, setCompanyEditTeamOptions] = useState<{ id: string; name: string }[]>([])

  async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...options, credentials: 'include' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || res.statusText || 'Request failed')
    }
    return res.json()
  }

  // Group company datas by template group
  const groupedDatas = (companyData.company_datas || []).reduce((acc: any, item: any) => {
    const group = item.company_data_templates?.group || 'Other'
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(item)
    return acc
  }, {})

  // Create map of existing company_datas for easy lookup
  const existingDatasMap = (companyData.company_datas || []).reduce((acc: any, item: any) => {
    acc[item.data_template_id] = item.value || ''
    return acc
  }, {})

  const openEditCompanyModal = async () => {
    const isCust = variant === 'customer'
    if (!isCust) {
      try {
        const userRows = await apiFetch<
          { id: string; full_name: string | null; email: string; role: string }[]
        >('/api/users')
        setCompanyEditLeaderOptions(
          (userRows || []).filter((u) => (u.role || '').toLowerCase() === 'customer' && !!u.email),
        )
        setCompanyEditManagerOptions(
          (userRows || []).filter((u) => (u.role || '').toLowerCase() !== 'customer' && !!u.email),
        )
      } catch {
        setCompanyEditLeaderOptions([])
        setCompanyEditManagerOptions([])
      }
      try {
        const teamRows = await apiFetch<{ id: string; name: string }[]>('/api/teams')
        setCompanyEditTeamOptions((teamRows || []).map((t) => ({ id: t.id, name: t.name })))
      } catch {
        setCompanyEditTeamOptions([])
      }
    }
    const adminRow = (companyData.company_users || []).find(
      (r: { company_role?: string }) => (r.company_role || '').toLowerCase() === 'company_admin',
    ) as { user_id?: string } | undefined
    const leaderId = adminRow?.user_id
    companyEditForm.setFieldsValue({
      name: companyData.name,
      email: companyData.email || '',
      is_active: companyData.is_active ?? true,
      color: companyData.color || '#000000',
      leader_user_id: leaderId,
      active_team_id: companyData.active_team_id || undefined,
      active_manager_id: companyData.active_manager_id || undefined,
      active_time: companyData.active_time ?? 0,
      is_customer: companyData.is_customer ?? false,
    })
    setCompanyEditModalOpen(true)
  }

  const handleSaveCompany = async () => {
    try {
      const values = await companyEditForm.validateFields()
      const name = (values.name ?? '').trim()
      if (!name) {
        message.warning('Company name is required')
        throw new Error('VALIDATION')
      }
      const color = (values.color || '#000000').trim() || '#000000'
      setCompanyEditLoading(true)
      const email = (values.email ?? '').trim() || null
      const isCust = variant === 'customer'
      if (isCust) {
        await apiFetch(`/api/companies/${companyData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, color }),
        })
      } else {
        await apiFetch(`/api/companies/${companyData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            is_active: !!values.is_active,
            color,
            leader_user_id: values.leader_user_id,
            active_team_id: values.active_team_id ?? null,
            active_manager_id: values.active_manager_id ?? null,
            active_time: values.active_time ?? 0,
            is_customer: values.is_customer === true,
          }),
        })
      }
      message.success('Company updated')
      setCompanyEditModalOpen(false)
      router.refresh()
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) {
        throw e
      }
      const err = e as { message?: string }
      if (err?.message === 'VALIDATION') {
        throw e
      }
      if (err?.message && !String(err.message).includes('validateFields')) {
        message.error(err?.message || 'Failed to update company')
      }
      throw e instanceof Error ? e : new Error('Failed to update company')
    } finally {
      setCompanyEditLoading(false)
    }
  }

  const handleCrawlDelete = async (crawlSessionId: string) => {
    try {
      await apiFetch(`/api/crawl-sessions/${crawlSessionId}`, { method: 'DELETE' })
      message.success('Crawl session deleted successfully')
      fetchCrawlSessions()
    } catch (error: any) {
      message.error('Failed to delete crawl session')
      console.error('Error deleting crawl session:', error)
    } finally {
      setLoadingCrawlSessions(false)
    }
  }

  useEffect(() => {
    fetchWebsites()
  }, [companyData?.id])

  useEffect(() => {
    if (websites.length > 0) {
      fetchCrawlSessions()
    }
  }, [websites])

  // Create map of last crawl session per website
  const getLastCrawlSession = (websiteId: string) => {
    return crawlSessions.find(session => session.company_website_id === websiteId)
  }

  const fetchWebsites = async () => {
    setLoadingWebsites(true)
    try {
      const res = await apiFetch<{ data: any[] }>(`/api/company-websites?company_id=${companyData.id}`)
      setWebsites(res?.data || [])
    } catch (error: any) {
      message.error('Failed to load websites')
      console.error('Error fetching websites:', error)
    } finally {
      setLoadingWebsites(false)
    }
  }

  const fetchCrawlSessions = async () => {
    setLoadingCrawlSessions(true)
    try {
      if (!companyData?.id) {
        setCrawlSessions([])
        setLoadingCrawlSessions(false)
        return
      }
      const data = await apiFetch<any[]>(`/api/companies/${companyData.id}/crawl-sessions`)
      setCrawlSessions(data || [])
    } catch (error: any) {
      message.error('Failed to load crawl sessions')
      console.error('Error fetching crawl sessions:', error)
    } finally {
      setLoadingCrawlSessions(false)
    }
  }

  const handleWebsiteCreate = () => {
    setEditingWebsite(null)
    websiteForm.resetFields()
    websiteForm.setFieldsValue({
      is_primary: false,
      url: '',
      title: '',
      description: '',
    })
    setWebsiteModalVisible(true)
  }

  const handleWebsiteEdit = (website: any) => {
    setEditingWebsite(website)
    websiteForm.setFieldsValue({
      url: website.url,
      title: website.title || '',
      description: website.description || '',
      is_primary: website.is_primary || false,
    })
    setWebsiteModalVisible(true)
  }

  const handleWebsiteSubmit = async (values: any) => {
    try {
      // Ensure is_primary is a proper boolean value
      const isPrimary = Boolean(values.is_primary === true || values.is_primary === 'true' || values.is_primary === 1)

      if (editingWebsite) {
        await apiFetch(`/api/company-websites/${editingWebsite.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: values.url,
            title: values.title || null,
            description: values.description || null,
            is_primary: isPrimary,
            company_id: companyData.id,
          }),
        })
        message.success('Website updated successfully')
      } else {
        await apiFetch('/api/company-websites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyData.id,
            url: values.url,
            title: values.title || null,
            description: values.description || null,
            is_primary: isPrimary,
          }),
        })
        message.success('Website created successfully')
      }

      setWebsiteModalVisible(false)
      websiteForm.resetFields()
      setEditingWebsite(null)
      fetchWebsites()
    } catch (error: any) {
      message.error(error.message || 'Failed to save website')
      console.error('Error saving website:', error)
    }
  }

  const handleWebsiteDelete = async (id: string) => {
    try {
      await apiFetch(`/api/company-websites/${id}`, { method: 'DELETE' })
      message.success('Website deleted successfully')
      fetchWebsites()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete website')
    }
  }

  const handleStartCrawl = () => {
    if (websites.length === 0) {
      message.warning('Please add at least one website first')
      return
    }
    crawlForm.resetFields()
    crawlForm.setFieldsValue({
      max_depth: 3,
      max_pages: 100,
    })
    setCrawlModalVisible(true)
  }

  const handleCrawlSubmit = async (values: any) => {
    try {
      const { startCrawl } = await import('@/app/actions/crawl')
      const result = await startCrawl({
        company_website_id: values.company_website_id,
        max_depth: values.max_depth || 3,
        max_pages: values.max_pages || 100,
      })

      if (result.error) {
        message.error(result.error)
      } else {
        message.success('Crawl session started successfully')
        setCrawlModalVisible(false)
        crawlForm.resetFields()
        fetchCrawlSessions()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to start crawl')
    }
  }

  const isCustomer = variant === 'customer'

  const tabItems = [
    {
      key: 'info',
      label: 'Company Information',
      children: <TabInfo companyData={companyData} canEdit={canEdit} />,
    },
    {
      key: 'users',
      label: (
        <span>
          <TeamOutlined /> Users ({companyData.company_users?.length || 0})
        </span>
      ),
      children: (
        <TabUsers
          companyData={companyData}
          viewerIsGlobalAdmin={currentUserRole?.toLowerCase() === 'admin'}
        />
      ),
    },
    {
      key: 'tickets',
      label: (
        <span>
          <CheckSquareOutlined /> Tickets{ticketTotal !== null ? ` (${ticketTotal})` : ''}
        </span>
      ),
      children: (
        <TabTickets
          companyData={companyData}
          currentUser={currentUser}
          viewerRole={currentUserRole ?? (currentUser as { role?: string }).role ?? null}
          basePath={isCustomer ? '/customer' : undefined}
          onTotalChange={setTicketTotal}
        />
      ),
    },
    {
      key: 'websites',
      label: (
        <span>
          <GlobalOutlined /> Websites ({websites.length})
        </span>
      ),
      children: (
        <TabWebsites
          websites={websites}
          loadingWebsites={loadingWebsites}
          getLastCrawlSession={getLastCrawlSession}
          onAddWebsite={handleWebsiteCreate}
          onEditWebsite={handleWebsiteEdit}
          onDeleteWebsite={handleWebsiteDelete}
        />
      ),
    },
    {
      key: 'crawling',
      label: (
        <span>
          <GlobalOutlined /> Crawling ({crawlSessions.length})
        </span>
      ),
      children: (
        <TabCrawling
          crawlSessions={crawlSessions}
          loadingCrawlSessions={loadingCrawlSessions}
          websites={websites}
          websitesLength={websites.length}
          onStartCrawl={handleStartCrawl}
          onCrawlDelete={handleCrawlDelete}
        />
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isCustomer ? (
        <CustomerNavbar user={currentUser} />
      ) : (
        <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      )}

      <AdminMainColumn
        collapsed={collapsed}
        user={currentUser}
        noSidebarInset={isCustomer}
      >
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          
            {!isCustomer ? (
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="default"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push('/settings/companies')}
                >
                  Back to list
                </Button>
              </div>
            ) : null}

            <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
              <Title level={2} style={{ margin: 0 }}>
                {companyData.name}
              </Title>
              <Space>
                {canEdit && (
                  <Button type="primary" icon={<EditOutlined />} onClick={() => void openEditCompanyModal()}>
                    Edit company
                  </Button>
                )}
              </Space>
            </Flex>

            <Modal
              title="Edit company"
              open={companyEditModalOpen}
              onOk={handleSaveCompany}
              onCancel={() => setCompanyEditModalOpen(false)}
              confirmLoading={companyEditLoading}
              okText="Save"
              width={variant === 'customer' ? 520 : 640}
              destroyOnHidden
            >
              <Form form={companyEditForm} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item
                  name="name"
                  label="Company name"
                  rules={[{ required: true, message: 'Company name is required' }]}
                >
                  <Input placeholder="Company name" />
                </Form.Item>
                <Form.Item name="email" label="Email">
                  <Input type="email" placeholder="support@company.com" />
                </Form.Item>
                {variant === 'customer' ? (
                  <Form.Item name="color" label="Brand color">
                    <ColorPickerInput />
                  </Form.Item>
                ) : (
                  <>
                    <Form.Item
                      name="leader_user_id"
                      label="Company leader"
                      extra="Leave blank for internal companies (no customer leader)"
                    >
                      <Select
                        showSearch
                        allowClear
                        placeholder="Customer user as leader (optional)"
                        optionFilterProp="label"
                        options={companyEditLeaderOptions.map((u) => ({
                          value: u.id,
                          label: `${u.full_name || u.email} (${u.email})`,
                        }))}
                      />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="is_active" label="Status" valuePropName="checked">
                          <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="color" label="Color (hex)">
                          <ColorPickerInput />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="active_team_id" label="Active team">
                      <Select
                        allowClear
                        showSearch
                        placeholder="Select team"
                        optionFilterProp="label"
                        options={companyEditTeamOptions.map((t) => ({
                          value: t.id,
                          label: t.name,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name="active_manager_id" label="Active manager">
                      <Select
                        allowClear
                        showSearch
                        placeholder="Non-customer user"
                        optionFilterProp="label"
                        options={companyEditManagerOptions.map((u) => ({
                          value: u.id,
                          label: `${u.full_name || u.email} (${u.email})`,
                        }))}
                      />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="active_time" label="Active time" initialValue={0}>
                          <InputNumber min={0} precision={0} addonAfter="H" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      {/* <Col xs={24} sm={12}>
                        <Form.Item name="is_customer" label="Is customer" valuePropName="checked">
                          <Switch checkedChildren="Yes" unCheckedChildren="No" />
                        </Form.Item>
                      </Col> */}
                    </Row>
                  </>
                )}
              </Form>
            </Modal>

            {activeSection ? (
              (() => {
                const item = tabItems.find((t) => t.key === activeSection)
                return item ? item.children : null
              })()
            ) : (
              <Tabs items={tabItems} />
            )}

            {/* Website Modal */}
            <Modal
              title={
                <Space>
                  <GlobalOutlined />
                  <span>{editingWebsite ? 'Edit Website' : 'Add New Website'}</span>
                </Space>
              }
              open={websiteModalVisible}
              onCancel={() => {
                setWebsiteModalVisible(false)
                websiteForm.resetFields()
                setEditingWebsite(null)
              }}
              footer={null}
              width={700}
            >
              <Form
                form={websiteForm}
                layout="vertical"
                onFinish={handleWebsiteSubmit}
                requiredMark={false}
              >
                <Card size="small" style={{ marginBottom: 16,  }}>
                  <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                    <Text strong>Website Information</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Add a website URL for this company. You can set one website as primary.
                    </Text>
                  </Space>
                </Card>

                <Form.Item
                  label={
                    <Space>
                      <Text strong>Website URL</Text>
                      <Text type="danger">*</Text>
                    </Space>
                  }
                  name="url"
                  rules={[
                    { required: true, message: 'Please enter website URL' },
                    { 
                      type: 'url', 
                      message: 'Please enter a valid URL (e.g., https://example.com)',
                      warningOnly: false
                    }
                  ]}
                  tooltip="Enter the full URL including http:// or https://"
                >
                  <Input 
                    placeholder="https://example.com"
                    prefix={<GlobalOutlined style={{ color: '#bfbfbf' }} />}
                    size="large"
                    allowClear
                  />
                </Form.Item>

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>Title</Text>}
                      name="title"
                      tooltip="Optional: A friendly name for this website"
                    >
                      <Input 
                        placeholder="e.g., Main Website, Blog, Store"
                        size="large"
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label={<Text strong>Primary Website</Text>}
                      name="is_primary"
                      valuePropName="checked"
                      initialValue={false}
                      tooltip="Set this as the primary website. Only one website can be primary."
                    >
                      <Switch 
                        checkedChildren="Yes" 
                        unCheckedChildren="No"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  label={<Text strong>Description</Text>}
                  name="description"
                  tooltip="Optional: Additional notes about this website"
                >
                  <TextArea 
                    rows={4}
                    placeholder="Add any notes or description about this website..."
                    showCount
                    maxLength={500}
                    style={{ resize: 'none' }}
                  />
                </Form.Item>

                <Divider />

                <Form.Item style={{ marginBottom: 0 }}>
                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button 
                      onClick={() => {
                        setWebsiteModalVisible(false)
                        websiteForm.resetFields()
                        setEditingWebsite(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="primary" 
                      htmlType="submit"
                      icon={editingWebsite ? <EditOutlined /> : <PlusOutlined />}
                      size="large"
                    >
                      {editingWebsite ? 'Update Website' : 'Add Website'}
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            </Modal>

            {/* Crawl Modal */}
            <Modal
              title="Start New Crawl"
              open={crawlModalVisible}
              onCancel={() => {
                setCrawlModalVisible(false)
                crawlForm.resetFields()
              }}
              footer={null}
              width={600}
            >
              <Form
                form={crawlForm}
                layout="vertical"
                onFinish={handleCrawlSubmit}
              >
                <Form.Item
                  label="Website"
                  name="company_website_id"
                  rules={[{ required: true, message: 'Please select a website' }]}
                >
                  <Select placeholder="Select a website" showSearch>
                    {websites.map((website) => (
                      <Option key={website.id} value={website.id} label={website.url}>
                        <Space>
                          {website.is_primary && <Tag color="blue">Primary</Tag>}
                          <span>{website.url}</span>
                          {website.title && <span style={{ color: '#999' }}> - {website.title}</span>}
                        </Space>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  label="Max Depth"
                  name="max_depth"
                  rules={[{ required: true, message: 'Please enter max depth' }]}
                  tooltip="Maximum depth to crawl (0 = only the start page)"
                >
                  <Input type="number" min={0} max={10} />
                </Form.Item>

                <Form.Item
                  label="Max Pages"
                  name="max_pages"
                  rules={[{ required: true, message: 'Please enter max pages' }]}
                  tooltip="Maximum number of pages to crawl"
                >
                  <Input type="number" min={1} max={1000} />
                </Form.Item>

                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />}>
                      Start Crawl
                    </Button>
                    <Button onClick={() => {
                      setCrawlModalVisible(false)
                      crawlForm.resetFields()
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

