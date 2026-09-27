'use client'

import { ArrowLeftOutlined, CheckCircleFilled, CloseCircleFilled, MinusCircleFilled } from '@ant-design/icons'
import { Button, Layout, Tag, Typography } from 'antd'
import Link from 'next/link'
import { useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'

const { Content } = Layout
const { Title, Text } = Typography

interface Props {
  user: { id: string; email?: string | null; name?: string | null; role?: string }
}

type Access = 'yes' | 'no' | 'limited'

interface Feature {
  category: string
  name: string
  admin: Access
  manager: Access
  staff: Access
  customer: Access
  note?: string
}

const FEATURES: Feature[] = [
  // Tickets
  { category: 'Tickets', name: 'View tickets', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'yes' },
  { category: 'Tickets', name: 'Create ticket', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'yes' },
  { category: 'Tickets', name: 'Edit ticket', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'no' },
  { category: 'Tickets', name: 'Delete / move to trash', admin: 'yes', manager: 'yes', staff: 'no', customer: 'no' },
  { category: 'Tickets', name: 'Add comment', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'yes' },
  { category: 'Tickets', name: 'Internal note', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'no' },
  { category: 'Tickets', name: 'AI summarize', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'no' },
  { category: 'Tickets', name: 'Assign / reassign agent', admin: 'yes', manager: 'yes', staff: 'limited', customer: 'no', note: 'Staff can only self-assign' },
  // Dashboard & Reports
  { category: 'Dashboard & Reports', name: 'Dashboard', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'no' },
  // Projects
  { category: 'Projects', name: 'View & manage projects', admin: 'yes', manager: 'yes', staff: 'yes', customer: 'no' },
  // Ticket Attributes
  { category: 'Ticket Attributes', name: 'Statuses, types, priorities, tags', admin: 'yes', manager: 'yes', staff: 'no', customer: 'no' },
  // Teams
  { category: 'Teams', name: 'View teams', admin: 'yes', manager: 'yes', staff: 'no', customer: 'no' },
  { category: 'Teams', name: 'Create / delete team', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  // Users & Companies
  { category: 'Users & Companies', name: 'Manage users', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Users & Companies', name: 'Manage companies', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Users & Companies', name: 'Company log', admin: 'yes', manager: 'yes', staff: 'no', customer: 'no' },
  // Integrations & Automation
  { category: 'Integrations & Automation', name: 'Email integration', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Integrations & Automation', name: 'Slack notifications', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Integrations & Automation', name: 'Automation rules', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Integrations & Automation', name: 'Recurring tickets', admin: 'yes', manager: 'yes', staff: 'no', customer: 'no' },
  // Content & Templates
  { category: 'Content & Templates', name: 'Message / email templates', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Content & Templates', name: 'Knowledge base', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Content & Templates', name: 'Global announcement', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  { category: 'Content & Templates', name: 'Dashboard announcements', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
  // AI & System Settings
  { category: 'AI & System Settings', name: 'AI provider settings', admin: 'yes', manager: 'no', staff: 'no', customer: 'no' },
]

const ROLES: { key: 'admin' | 'manager' | 'staff' | 'customer'; label: string; color: string }[] = [
  { key: 'admin', label: 'Administrator', color: '#1677ff' },
  { key: 'manager', label: 'Manager', color: '#52c41a' },
  { key: 'staff', label: 'Staff', color: '#fa8c16' },
  { key: 'customer', label: 'Customer', color: '#8c8c8c' },
]

function AccessIcon({ access }: { access: Access }) {
  if (access === 'yes') return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
  if (access === 'limited') return <MinusCircleFilled style={{ color: '#fa8c16', fontSize: 18 }} />
  return <CloseCircleFilled style={{ color: '#d9d9d9', fontSize: 18 }} />
}

export default function FeatureAccessContent({ user: currentUser }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const categories = Array.from(new Set(FEATURES.map((f) => f.category)))

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={currentUser} collapsed={collapsed} onCollapse={setCollapsed} />
      <AdminMainColumn collapsed={collapsed} user={currentUser}>
        <Content className="settings-page" style={{ padding: 24, width: '100%' }}>
          <Button type="link" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 8 }}>
            <Link href="/settings">Back to Settings</Link>
          </Button>

          <Title level={3} className="settings-section-heading" style={{ margin: '0 0 4px' }}>
            Feature Access
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
            Overview of what each role can access and do in the system.
          </Text>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>Legend:</Text>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <CheckCircleFilled style={{ color: '#52c41a' }} /> Full access
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <MinusCircleFilled style={{ color: '#fa8c16' }} /> Limited
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <CloseCircleFilled style={{ color: '#d9d9d9' }} /> No access
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: 'var(--ant-color-text)' }}>
              <thead>
                <tr style={{ background: 'var(--ant-color-fill-quaternary)' }}>
                  <th colSpan={2} style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '2px solid var(--ant-color-border)', width: '36%', color: 'var(--ant-color-text-secondary)', fontWeight: 600 }}>
                    Feature
                  </th>
                  {ROLES.map((r) => (
                    <th key={r.key} style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '2px solid var(--ant-color-border)', color: 'var(--ant-color-text-secondary)', fontWeight: 600, minWidth: 110 }}>
                      <Tag color={r.color} style={{ fontWeight: 600, fontSize: 12 }}>{r.label}</Tag>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const rows = FEATURES.filter((f) => f.category === cat)
                  return rows.map((feature, idx) => (
                    <tr
                      key={feature.name}
                      style={{ background: idx % 2 === 0 ? 'var(--ant-color-bg-container)' : 'var(--ant-color-fill-quaternary)', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ant-color-primary-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--ant-color-bg-container)' : 'var(--ant-color-fill-quaternary)')}
                    >
                      {idx === 0 && (
                        <td
                          rowSpan={rows.length}
                          style={{
                            padding: '0 16px',
                            borderBottom: '1px solid var(--ant-color-border)',
                            borderRight: '2px solid var(--ant-color-primary-border)',
                            verticalAlign: 'middle',
                            background: 'var(--ant-color-primary-bg)',
                          }}
                        >
                          <Text strong style={{ color: 'var(--ant-color-primary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {cat}
                          </Text>
                        </td>
                      )}
                      <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--ant-color-border)', color: 'var(--ant-color-text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{feature.name}</span>
                          {feature.note && (
                            <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>({feature.note})</Text>
                          )}
                        </div>
                      </td>
                      {ROLES.map((r) => (
                        <td key={r.key} style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid var(--ant-color-border)' }}>
                          <AccessIcon access={feature[r.key]} />
                        </td>
                      ))}
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}
