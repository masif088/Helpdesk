'use client'

import { App, DatePicker, Layout, Rate, Table, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { RatedTicket, RatingsPage } from '@/lib/ratings-list'

const { Content } = Layout
const { Title, Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string | null }
}

/** Reports → Ratings: every rated ticket of one month, a page at a time (admin / manager). */
export default function RatingsContent({ user }: Props) {
  const { message } = App.useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'))
  const [page, setPage] = useState(1)
  const [data, setData] = useState<RatingsPage | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ month: month.format('YYYY-MM'), page: String(page) })
      const res = await fetch(`/api/reports/ratings?${qs}`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the ratings')
      setData(body)
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [month, page, message])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={{ ...user, role: user.role ?? undefined }} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <div className="page-head">
            <div>
              <Title level={2} className="page-head__title">
                Ratings
              </Title>
              <Text className="page-head__sub">Tickets rated by clients, newest rating first. Averages per agent and client are on SLA &amp; satisfaction.</Text>
            </div>
          </div>

          <div className="page-toolbar">
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              disabledDate={(d) => d.isAfter(dayjs(), 'month')}
              onChange={(d) => {
                if (!d) return
                setMonth(d.startOf('month'))
                setPage(1)
              }}
            />
            <Text type="secondary">{data ? `${data.total} rating${data.total === 1 ? '' : 's'} in ${month.format('MMMM YYYY')}` : ''}</Text>
          </div>

          <div className="ticket-surface ticket-table">
            <Table<RatedTicket>
              rowKey="ticketId"
              loading={loading}
              dataSource={data?.items ?? []}
              scroll={{ x: 760 }}
              locale={{ emptyText: 'No ratings in this month' }}
              pagination={{
                current: page,
                pageSize: data?.pageSize ?? 20,
                total: data?.total ?? 0,
                showSizeChanger: false,
                hideOnSinglePage: true,
                onChange: setPage,
              }}
              columns={[
                {
                  title: 'Ticket',
                  key: 'title',
                  render: (_, r) => (
                    <SpaNavLink href={`/tickets/${r.ticketId}`} className="ticket-table__title">
                      #{r.ticketId} {r.title}
                    </SpaNavLink>
                  ),
                },
                { title: 'Client', dataIndex: 'company', width: 160, render: (v: string | null) => v ?? '—' },
                { title: 'Agent', dataIndex: 'agents', width: 170, render: (v: string[]) => (v.length ? v.join(', ') : 'Unassigned') },
                { title: 'Rating', dataIndex: 'rating', width: 150, render: (v: number) => <Rate disabled value={v} style={{ fontSize: 13 }} /> },
                { title: 'Comment', dataIndex: 'comment', render: (v: string | null) => v ?? <span className="cell-muted">—</span> },
                { title: 'Rated', dataIndex: 'at', width: 120, render: (v: string) => dayjs(v).format('D MMM YYYY') },
              ]}
            />
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
