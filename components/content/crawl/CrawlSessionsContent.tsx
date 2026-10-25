'use client'

import { CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, GlobalOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Button, Card, Form, InputNumber, Layout, message, Modal, Progress, Select, Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import { startCrawl } from '@/app/actions/crawl'
import DateDisplay from '@/components/common/DateDisplay'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import { APP_TABLE_PAGE_SIZE_OPTIONS } from '@/lib/app-table'

const { Content } = Layout
const { Text } = Typography
const { Option } = Select

interface CrawlSessionsContentProps {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

interface CrawlSessionRecord {
  id: string
  company_website_id: string
  status: string
  total_pages: number
  crawled_pages: number
  failed_pages: number
  uncrawled_pages: number
  broken_pages: number
  error_message: string | null
  max_depth: number
  max_pages: number
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  company_websites?: {
    id: string
    company_id: string
    url: string
    title: string | null
    companies?: {
      id: string
      name: string
    }
  }
}

interface CompanyWebsiteRecord {
  id: string
  company_id: string
  url: string
  title: string | null
  description: string | null
  is_primary: boolean
  companies?: {
    id: string
    name: string
  }
}

export default function CrawlSessionsContent({ user: currentUser }: CrawlSessionsContentProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [crawlSessions, setCrawlSessions] = useState<CrawlSessionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [companies, setCompanies] = useState<any[]>([])
  const [companyWebsites, setCompanyWebsites] = useState<CompanyWebsiteRecord[]>([])
  const [loadingWebsites, setLoadingWebsites] = useState(false)

  const fetchCrawlSessions = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crawl-sessions', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch crawl sessions')
      setCrawlSessions(Array.isArray(data) ? data : [])
    } catch (error: any) {
      message.error(error.message || 'Failed to fetch crawl sessions')
    } finally {
      setLoading(false)
    }
  }

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch companies')
      setCompanies(json.data || [])
    } catch (error: unknown) {
      console.error('Error fetching companies:', error)
    }
  }

  const fetchCompanyWebsites = async (companyId: string) => {
    if (!companyId) {
      setCompanyWebsites([])
      return
    }

    setLoadingWebsites(true)
    try {
      const res = await fetch(`/api/companies/${companyId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch company websites')
      const companyData = json.data
      const websites = (companyData?.company_websites || []).map((w: any) => ({
        ...w,
        companies: companyData ? { id: companyData.id, name: companyData.name } : null,
      }))
      setCompanyWebsites(websites)
    } catch (error: unknown) {
      message.error('Failed to fetch company websites')
      console.error('Error fetching company websites:', error)
    } finally {
      setLoadingWebsites(false)
    }
  }

  useEffect(() => {
    fetchCrawlSessions()
    fetchCompanies()
  }, [])

  const handleCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      max_depth: 3,
      max_pages: 100,
    })
    setModalVisible(true)
  }

  const handleCompanyChange = (companyId: string) => {
    fetchCompanyWebsites(companyId)
    form.setFieldsValue({ company_website_id: undefined })
  }

  const handleSubmit = async (values: any) => {
    try {
      const result = await startCrawl({
        company_website_id: values.company_website_id,
        max_depth: values.max_depth || 3,
        max_pages: values.max_pages || 100,
      })

      if (result.error) {
        message.error(result.error)
      } else {
        message.success('Crawl session started successfully')
        setModalVisible(false)
        form.resetFields()
        fetchCrawlSessions()
      }
    } catch (error: any) {
      message.error(error.message || 'Failed to start crawl')
    }
  }


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'crawling':
        return 'blue'
      case 'failed':
        return 'red'
      case 'broken-page':
        return 'orange'
      case 'pending':
        return 'orange'
      case 'uncrawl-page':
        return 'geekblue'
      default:
        return 'default'
    }
  }

  const columns: ColumnsType<CrawlSessionRecord> = [
    {
      title: 'Company',
      key: 'company',
      render: (_, record) => record.company_websites?.companies?.name || 'N/A',
    },
    {
      title: 'Website',
      key: 'website',
      render: (_, record) => (
        <a href={record.company_websites?.url} target="_blank" rel="noopener noreferrer">
          {record.company_websites?.url}
        </a>
      ),
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)} style={{ textTransform: 'uppercase' }}>
          {status}
        </Tag>
      ),
      width: 120,
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_, record) => {
        const getProgressPercent = () => {
          const total = record.total_pages || 0
          const crawled = record.crawled_pages || 0
          if (total === 0) return 0
          return Math.round((crawled / total) * 100)
        }

        return (
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <Progress 
              percent={getProgressPercent()} 
              status={record.status === 'crawling' ? 'active' : record.status === 'completed' ? 'success' : 'normal'}
              size="small"
            />
            <Space wrap>
              <Tag color="green">
                <CheckCircleOutlined /> Crawled: <strong>{record.crawled_pages || 0}</strong>
              </Tag>
              {(record.uncrawled_pages || 0) > 0 && (
                <Tag color="geekblue">
                  Uncrawled: <strong>{record.uncrawled_pages || 0}</strong>
                </Tag>
              )}
              {(record.broken_pages || 0) > 0 && (
                <Tag color="orange">
                  <CloseCircleOutlined /> Broken: <strong>{record.broken_pages || 0}</strong>
                </Tag>
              )}
              {(record.failed_pages || 0) > 0 && (
                <Tag color="red">
                  <CloseCircleOutlined /> Failed: <strong>{record.failed_pages || 0}</strong>
                </Tag>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Total Pages: <strong>{record.total_pages || 0}</strong>
            </Text>
          </Space>
        )
      },
    },
    {
      title: 'Settings',
      key: 'settings',
      render: (_, record) => (
        <Space>
          <span>Max Depth: {record.max_depth}</span>
          <span>|</span>
          <span>Max Pages: {record.max_pages}</span>
        </Space>
      ),
    },
    {
      title: 'Started At',
      key: 'started_at',
      render: (_, record) => record.started_at ? <DateDisplay date={record.started_at} /> : '-',
      width: 180,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => router.push(`/crawl-sessions/${record.id}`)}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleCreate}
                size="large"
              >
                Start New Crawl
              </Button>
              <Text type="secondary">Manage crawl sessions</Text>
            </Space>

            {loading ? (
              <Spin tip="Loading crawl sessions..." />
            ) : crawlSessions.length > 0 ? (
              <Table
                columns={columns}
                dataSource={crawlSessions}
                rowKey="id"
                pagination={{
                  pageSize: 15,
                  showSizeChanger: true,
                  pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS,
                  showTotal: (total) => `Total ${total} crawl sessions`,
                }}
              />
            ) : (
              <Card>
                <Space orientation="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
                  <GlobalOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
                  <Text type="secondary">No crawl sessions yet</Text>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleCreate}
                  >
                    Start First Crawl
                  </Button>
                </Space>
              </Card>
            )}
          </Card>

          <Modal
            title="Start New Crawl Session"
            open={modalVisible}
            onCancel={() => {
              setModalVisible(false)
              form.resetFields()
            }}
            footer={null}
            width={600}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
            >
              <Form.Item
                label="Company"
                name="company_id"
                rules={[{ required: true, message: 'Please select a company' }]}
              >
                <Select
                  placeholder="Select a company"
                  onChange={handleCompanyChange}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {companies.map((company) => (
                    <Option key={company.id} value={company.id} label={company.name}>
                      {company.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Company Website"
                name="company_website_id"
                rules={[{ required: true, message: 'Please select a website' }]}
              >
                <Select
                  placeholder="Select a website"
                  loading={loadingWebsites}
                  disabled={!form.getFieldValue('company_id')}
                  showSearch
                  filterOption={(input, option) =>
                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {companyWebsites.map((website) => (
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
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                label="Max Pages"
                name="max_pages"
                rules={[{ required: true, message: 'Please enter max pages' }]}
                tooltip="Maximum number of pages to crawl"
              >
                <InputNumber min={1} max={1000} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />}>
                    Start Crawl
                  </Button>
                  <Button onClick={() => {
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

