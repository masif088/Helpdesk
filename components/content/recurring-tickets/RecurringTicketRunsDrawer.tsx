'use client'

import { SyncOutlined } from '@ant-design/icons'
import { Avatar, Badge, Empty, Space, Spin, Table, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

import { APP_TABLE_PAGE_SIZE_OPTIONS, appTableShowTotal } from '@/lib/app-table'

const { Text } = Typography

interface Run {
  id: string
  ticketId: number | null
  ranAt: string
  status: 'success' | 'failed'
  error: string | null
}

export default function RecurringTicketRunsDrawer({ ruleId }: { ruleId: string }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/recurring-tickets/${ruleId}`)
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ruleId])

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />

  const columns = [
    {
      title: 'Ran at',
      dataIndex: 'ranAt',
      key: 'ranAt',
      render: (v: string) => (
        <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm:ss')}>
          <Text>{dayjs(v).format('MMM D, YYYY HH:mm')}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) =>
        v === 'success' ? (
          <Badge status="success" text="Success" />
        ) : (
          <Badge status="error" text="Failed" />
        ),
    },
    {
      title: 'Ticket',
      dataIndex: 'ticketId',
      key: 'ticketId',
      render: (v: number | null) =>
        v ? (
          <Space size={6}>
            <Avatar
              size={20}
              icon={<SyncOutlined />}
              style={{ backgroundColor: '#0E7490', flexShrink: 0 }}
            />
            <a href={`/tickets/${v}`} target="_blank" rel="noopener noreferrer">
              #{v}
            </a>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <Text type="danger" style={{ fontSize: 12 }}>
              {v.slice(0, 50)}{v.length > 50 ? '…' : ''}
            </Text>
          </Tooltip>
        ) : null,
    },
  ]

  return (
    <Table
      dataSource={runs}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: APP_TABLE_PAGE_SIZE_OPTIONS, showTotal: appTableShowTotal('runs') }}
      locale={{ emptyText: <Empty description="No runs yet" /> }}
      size="small"
    />
  )
}
