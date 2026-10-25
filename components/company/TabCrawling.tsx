'use client'

import { CheckCircleOutlined, CloseCircleOutlined,DeleteOutlined, EyeOutlined, GlobalOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Button, Card, Progress,Space, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'

import DateDisplay from '@/components/common/DateDisplay'
import { APP_TABLE_PAGE_SIZE_OPTIONS } from '@/lib/app-table'

const { Text } = Typography

function getCrawlStatusColor(status: string) {
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

interface TabCrawlingProps {
  crawlSessions: unknown[]
  loadingCrawlSessions: boolean
  websites: unknown[]
  websitesLength: number
  onStartCrawl: () => void
  onCrawlDelete: (id: string) => void
}

export default function TabCrawling({ crawlSessions, loadingCrawlSessions, websitesLength, onStartCrawl, onCrawlDelete }: TabCrawlingProps) {
  const router = useRouter()

  const columns: ColumnsType<unknown> = [
    {
      title: 'Website',
      key: 'website',
      render: (_: unknown, record: any) => (
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
        <Tag color={getCrawlStatusColor(status)} style={{ textTransform: 'uppercase' }}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_: unknown, record: any) => {
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
      render: (_: unknown, record: any) => (
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
      render: (_: unknown, record: any) => (record.started_at ? <DateDisplay date={record.started_at} /> : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => router.push(`/crawl-sessions/${record.id}`)}
          >
            View
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => onCrawlDelete(record.id)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={onStartCrawl}
          disabled={websitesLength === 0}
          size="large"
        >
          Start New Crawl
        </Button>
        {websitesLength === 0 && <Text type="secondary">Please add a website first</Text>}
      </Space>

      {loadingCrawlSessions ? (
        <Spin tip="Loading crawl sessions..." />
      ) : crawlSessions.length > 0 ? (
        <Table
          dataSource={crawlSessions}
          rowKey="id"
          columns={columns}
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
            {websitesLength > 0 && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={onStartCrawl}>
                Start First Crawl
              </Button>
            )}
          </Space>
        </Card>
      )}
    </div>
  )
}
