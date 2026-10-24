'use client'

import { Layout, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'

import { SpaNavLink } from '@/components/common/SpaNavLink'
import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { ToRateItem } from '@/lib/customer-to-rate'

const { Content } = Layout
const { Title, Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
  items: ToRateItem[]
}

/** Client portal: finished tickets that still wait for the client's rating. */
export default function ToRateContent({ user, items }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={user}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <Title level={3} style={{ marginBottom: 4 }}>
            Rate your tickets
          </Title>
          <Text type="secondary">Tickets our team has finished that you have not rated yet. Open one to give 1 to 5 stars and tell us how it went.</Text>
          <div className="ticket-surface ticket-table" style={{ marginTop: 16 }}>
            <Table<ToRateItem>
              rowKey="id"
              dataSource={items}
              pagination={items.length > 25 ? { pageSize: 25, showSizeChanger: false } : false}
              scroll={{ x: 560 }}
              locale={{ emptyText: 'Nothing to rate. Thank you!' }}
              columns={[
                {
                  title: 'Ticket',
                  key: 'title',
                  render: (_, r) => (
                    <SpaNavLink href={`/tickets/${r.id}`} className="ticket-table__title">
                      #{r.id} {r.title}
                    </SpaNavLink>
                  ),
                },
                { title: 'Finished', dataIndex: 'finishedAt', width: 160, render: (v: string) => dayjs(v).format('D MMM YYYY') },
                { title: '', key: 'x', width: 110, align: 'right', render: (_, r) => <SpaNavLink href={`/tickets/${r.id}`}>Rate</SpaNavLink> },
              ]}
            />
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
