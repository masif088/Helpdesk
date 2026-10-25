'use client'

import { CalendarOutlined,CopyOutlined, DeleteOutlined, EditOutlined, PictureOutlined } from '@ant-design/icons'
import { Button, Card, Col, DatePicker, Empty,Image, Layout, message, Modal, Row, Select, Space, Tag, Typography } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect,useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

type SessionUser = { id: string; email?: string | null; name?: string | null }

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

interface Screenshot {
  id: string
  file_name: string
  file_path: string
  file_url: string
  file_size: number
  mime_type: string
  ticket_id: number | null
  title: string | null
  description: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  tickets?: {
    id: number
    title: string
    status: string
  } | null
}

interface Ticket {
  id: number
  title: string
  status: string
  due_date: string | null
}

interface ScreenshotsContentProps {
  user: SessionUser
  screenshots: Screenshot[]
  tickets: Ticket[]
}

export default function ScreenshotsContent({ user, screenshots: initialScreenshots, tickets }: ScreenshotsContentProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [screenshots, setScreenshots] = useState<Screenshot[]>(initialScreenshots)
  const [filteredScreenshots, setFilteredScreenshots] = useState<Screenshot[]>(initialScreenshots)
  const [selectedTicket, setSelectedTicket] = useState<number | null>(null)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])
  const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [, setLoading] = useState(false)

  // Filter screenshots
  useEffect(() => {
    let filtered = [...screenshots]

    // Filter by ticket
    if (selectedTicket) {
      filtered = filtered.filter(s => s.ticket_id === selectedTicket)
    }

    // Filter by date range
    if (dateRange[0] && dateRange[1]) {
      filtered = filtered.filter(s => {
        const screenshotDate = dayjs(s.created_at)
        return screenshotDate.isAfter(dateRange[0]!.subtract(1, 'day')) && 
               screenshotDate.isBefore(dateRange[1]!.add(1, 'day'))
      })
    }

    setFilteredScreenshots(filtered)
  }, [screenshots, selectedTicket, dateRange])

  // Link screenshot to ticket
  const handleLinkToTicket = async (screenshotId: string, ticketId: string | number | null) => {
    setLoading(true)
    try {
      const res = await fetch('/api/screenshots/link', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: screenshotId,
          ticket_id: ticketId === null || ticketId === undefined || ticketId === '' ? null : Number(ticketId),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to link screenshot')

      const normalizedTicketId: number | null = ticketId === null || ticketId === undefined || ticketId === '' ? null : Number(ticketId)
      setScreenshots(prev => prev.map(s =>
        s.id === screenshotId ? { ...s, ticket_id: normalizedTicketId } : s
      ))

      message.success('Screenshot linked to ticket successfully')
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to link screenshot')
    } finally {
      setLoading(false)
    }
  }

  // Delete screenshot
  const handleDelete = async (screenshot: Screenshot) => {
    if (!confirm('Are you sure you want to delete this screenshot?')) return

    setLoading(true)
    try {
      const res = await fetch('/api/screenshots/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: screenshot.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete screenshot')

      setScreenshots(prev => prev.filter(s => s.id !== screenshot.id))
      message.success('Screenshot deleted successfully')
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to delete screenshot')
    } finally {
      setLoading(false)
    }
  }

  // Copy URL
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    message.success('URL copied to clipboard!')
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <Title level={2}>
              <PictureOutlined /> Screenshots Gallery
            </Title>
            <Text type="secondary">View and manage your screenshots</Text>

            {/* Filters */}
            <div style={{ marginTop: 24, marginBottom: 24 }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Filter by Ticket:</Text>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="All tickets"
                    allowClear
                    value={selectedTicket}
                    onChange={setSelectedTicket}
                  >
                    <Option value={null}>All Screenshots</Option>
                    {tickets.map(ticket => (
                      <Option key={ticket.id} value={ticket.id}>
                        #{ticket.id} - {ticket.title} ({ticket.status})
                      </Option>
                    ))}
                  </Select>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Filter by Date:</Text>
                  <RangePicker
                    style={{ width: '100%' }}
                    value={dateRange}
                    onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null])}
                    format="YYYY-MM-DD"
                  />
                </Col>
                <Col xs={24} sm={24} md={8}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Total:</Text>
                  <Text style={{ fontSize: 18, fontWeight: 600 }}>
                    {filteredScreenshots.length} screenshot{filteredScreenshots.length !== 1 ? 's' : ''}
                  </Text>
                </Col>
              </Row>
            </div>

            {/* Gallery Grid */}
            {filteredScreenshots.length === 0 ? (
              <Empty description="No screenshots found" />
            ) : (
              <Row gutter={[16, 16]}>
                {filteredScreenshots.map(screenshot => (
                  <Col xs={24} sm={12} md={8} lg={6} key={screenshot.id}>
                    <Card
                      hoverable
                      cover={
                        <div style={{ height: 200, overflow: 'hidden', background: '#f5f5f5' }}>
                          <Image
                            src={screenshot.file_url}
                            alt={screenshot.title || screenshot.file_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            preview={false}
                            onClick={() => {
                              setSelectedScreenshot(screenshot)
                              setModalVisible(true)
                            }}
                          />
                        </div>
                      }
                      actions={[
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setSelectedScreenshot(screenshot)
                            setModalVisible(true)
                          }}
                        />,
                        <Button
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyUrl(screenshot.file_url)}
                        />,
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDelete(screenshot)}
                        />
                      ]}
                    >
                      <Card.Meta
                        title={
                          <div>
                            <Text ellipsis style={{ fontSize: 12 }}>
                              {screenshot.title || screenshot.file_name}
                            </Text>
                            {screenshot.tickets && (
                              <Tag color="blue" style={{ marginTop: 4, display: 'block' }}>
                                {screenshot.tickets.title}
                              </Tag>
                            )}
                          </div>
                        }
                        description={
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <CalendarOutlined /> {dayjs(screenshot.created_at).format('YYYY-MM-DD HH:mm')}
                            </Text>
                          </div>
                        }
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </Card>
        </Content>
      </AdminMainColumn>

      {/* Modal for screenshot details */}
      <Modal
        title="Screenshot Details"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setSelectedScreenshot(null)
        }}
        footer={null}
        width={800}
      >
        {selectedScreenshot && (
          <div>
            <Image
              src={selectedScreenshot.file_url}
              alt={selectedScreenshot.title || selectedScreenshot.file_name}
              style={{ width: '100%', marginBottom: 16 }}
            />
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>Link to Ticket:</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="Select a ticket"
                  value={selectedScreenshot.ticket_id}
                  onChange={(ticketId) => handleLinkToTicket(selectedScreenshot.id, ticketId ?? null)}
                >
                  <Option value={null}>No Ticket</Option>
                  {tickets.map(ticket => (
                    <Option key={ticket.id} value={ticket.id}>
                      #{ticket.id} - {ticket.title} ({ticket.status})
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong>URL:</Text>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <Text code style={{ flex: 1, fontSize: 11, wordBreak: 'break-all' }}>
                    {selectedScreenshot.file_url}
                  </Text>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyUrl(selectedScreenshot.file_url)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div>
                <Text strong>Created:</Text>
                <Text style={{ marginLeft: 8 }}>
                  {dayjs(selectedScreenshot.created_at).format('YYYY-MM-DD HH:mm:ss')}
                </Text>
              </div>
            </Space>
          </div>
        )}
      </Modal>
    </Layout>
  )
}
