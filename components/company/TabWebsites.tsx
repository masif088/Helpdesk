'use client'

import { DeleteOutlined, EditOutlined, EyeOutlined,GlobalOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Space, Spin,Table, Tag, Typography } from 'antd'
import { Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/navigation'

import DateDisplay from '@/components/common/DateDisplay'

const { Text } = Typography

interface TabWebsitesProps {
  websites: unknown[]
  loadingWebsites: boolean
  getLastCrawlSession: (websiteId: string) => any
  onAddWebsite: () => void
  onEditWebsite: (record: unknown) => void
  onDeleteWebsite: (id: string) => void
}

export default function TabWebsites({
  websites,
  loadingWebsites,
  getLastCrawlSession,
  onAddWebsite,
  onEditWebsite,
  onDeleteWebsite,
}: TabWebsitesProps) {
  const router = useRouter()

  const columns: ColumnsType<unknown> = [
    {
      title: 'Primary',
      dataIndex: 'is_primary',
      key: 'is_primary',
      render: (isPrimary: boolean) => (
        <Tag color={isPrimary ? 'blue' : 'default'}>
          {isPrimary ? 'Primary' : '-'}
        </Tag>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ),
      ellipsis: true,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (title: string | null) => title || '-',
    },
    {
      title: 'Created At',
      key: 'created_at',
      render: (_: unknown, record: any) => <DateDisplay date={record.created_at} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: any) => {
        const lastCrawlSession = getLastCrawlSession(record.id)
        return (
          <Space>
            {lastCrawlSession && (
              <Button
                type="link"
                icon={<EyeOutlined />}
                onClick={() => router.push(`/crawl-sessions/${lastCrawlSession.id}`)}
              >
                Last Crawl
              </Button>
            )}
            <Button type="link" icon={<EditOutlined />} onClick={() => onEditWebsite(record)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete website"
              description="Are you sure you want to delete this website?"
              onConfirm={() => onDeleteWebsite(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddWebsite} size="large">
          Add Website
        </Button>
        <Text type="secondary">Manage company websites</Text>
      </Space>

      {loadingWebsites ? (
        <Spin />
      ) : websites.length > 0 ? (
        <Table
          dataSource={websites}
          rowKey="id"
          columns={columns}
          pagination={false}
        />
      ) : (
        <Card>
          <Space orientation="vertical" align="center" style={{ width: '100%', padding: '40px 0' }}>
            <GlobalOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
            <Text type="secondary">No websites added yet</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAddWebsite}>
              Add First Website
            </Button>
          </Space>
        </Card>
      )}
    </div>
  )
}
