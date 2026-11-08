'use client'

import { Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useCallback, useEffect, useState } from 'react'

import { type CallEntry, describeCall } from '@/lib/api-key-calls-core'

dayjs.extend(utc)
dayjs.extend(timezone)

const { Text } = Typography

/** What one key or connection called, newest first, in words (“Opened a ticket #12”) with the exact call under it and the MCP tool it came through. */
export default function KeyCallsList({ url }: { url: string }) {
  const [calls, setCalls] = useState<CallEntry[]>([])
  const [zone, setZone] = useState('UTC')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the calls')
      setCalls(body.calls)
      setZone(body.time_zone)
      setDays(body.days)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="cell-strong">Recent calls</div>
      {error ? <Text type="danger">{error}</Text> : null}
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={calls}
        pagination={{ pageSize: 10, hideOnSinglePage: true, size: 'small' }}
        locale={{ emptyText: 'No calls recorded yet' }}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: `When (${zone})`, width: 150, render: (_: unknown, c: CallEntry) => dayjs(c.at).tz(zone).format('D MMM HH:mm:ss') },
          {
            title: 'What',
            render: (_: unknown, c: CallEntry) => (
              <div>
                <div className="cell-strong">{describeCall(c.method, c.path)}</div>
                <Text type="secondary" code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {c.method} {c.path}
                  {c.query ? `?${c.query}` : ''}
                </Text>
              </div>
            ),
          },
          { title: 'Through', width: 190, render: (_: unknown, c: CallEntry) => (c.tool ? <Tag color="blue">MCP · {c.tool}</Tag> : <Tag>HTTP API</Tag>) },
          { title: '', width: 150, render: (_: unknown, c: CallEntry) => (c.limited ? <Tag color="red">Refused: hourly limit</Tag> : null) },
        ]}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        The last {calls.length >= 100 ? '100 ' : ''}calls of the past {days} days are kept. Calls made before the log was added were counted but not recorded.
      </Text>
    </div>
  )
}
